import * as THREE from 'three';
import { createWeapon } from './models.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const KAYKIT_MODELS = {
  knight: 'https://raw.githubusercontent.com/euuuuuuan/cairnfall-public/main/assets/vendor/kaykit_adventurers/Knight.glb',
  sorcerer: 'https://raw.githubusercontent.com/euuuuuuan/cairnfall-public/main/assets/vendor/kaykit_adventurers/Mage.glb',
  druid: 'https://raw.githubusercontent.com/euuuuuuan/cairnfall-public/main/assets/vendor/kaykit_adventurers/Mage.glb',
  paladin: 'https://raw.githubusercontent.com/euuuuuuan/cairnfall-public/main/assets/vendor/kaykit_adventurers/Rogue.glb',
  monk: 'https://raw.githubusercontent.com/euuuuuuan/cairnfall-public/main/assets/vendor/kaykit_adventurers/Barbarian.glb',
};

const VOCATION_MODELS = KAYKIT_MODELS;

const loader = new GLTFLoader();
const PLAYER_GLTF_PROMISES = new Map();

function getModelPathForVocation(vocation) {
  const key = String(vocation || '').toLowerCase();
  return VOCATION_MODELS[key] || VOCATION_MODELS.knight;
}

async function loadGltfUrl(modelPath) {
  try {
    const asset = await loader.loadAsync(modelPath);
    if (!asset?.scene) throw new Error('GLTF sem scene.');
    return asset;
  } catch (error) {
    throw new Error(`[ARENA] Failed to load vocation GLTF: ${modelPath}`, { cause: error });
  }
}

function getPlayerGltf(vocation) {
  const modelPath = getModelPathForVocation(vocation);

  if (!PLAYER_GLTF_PROMISES.has(modelPath)) {
    PLAYER_GLTF_PROMISES.set(
      modelPath,
      loadGltfUrl(modelPath).catch(async (error) => {
        // Every vocation now resolves to a KayKit Adventurers model. If a
        // requested CDN asset fails, keep the game playable with KayKit Knight.
        if (modelPath !== VOCATION_MODELS.knight) {
          console.warn('[ARENA] Vocation GLTF failed; falling back to KayKit Knight.', {
            requested: modelPath,
            fallback: VOCATION_MODELS.knight,
            error,
          });
          return loadGltfUrl(VOCATION_MODELS.knight);
        }

        PLAYER_GLTF_PROMISES.delete(modelPath);
        throw error;
      }),
    );
  }

  return PLAYER_GLTF_PROMISES.get(modelPath);
}

const findBone = (root, patterns) => {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  for (const re of patterns) {
    const hit = bones.find((b) => re.test(b.name));
    if (hit) return hit;
  }
  return null;
};

function normalizeModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0.001) return;

  // Todos os GLTFs entram no mundo com a mesma altura humana de referência.
  // Isso evita que um asset exportado em outra unidade apareça dezenas de vezes maior.
  const targetHeight = 1.8;
  const scale = targetHeight / size.y;
  model.scale.set(scale, scale, scale);
  // NUNCA alterar model.position.y aqui.
}

function buildGltfRig(asset, look = {}, vocation = null) {
  const model = SkeletonUtils.clone(asset.scene);
  normalizeModel(model);
  // KayKit Adventurers ships multiple native equipment variants inside the
  // character. Keep only the loadout that belongs to the active vocation.
  const nativeWeaponConfig = configureNativeKayKitWeapons(model, vocation);
  if (nativeWeaponConfig.usesNativeWeapons) {
    console.log('[ARENA] Native KayKit weapon loadout enabled.', {
      vocation,
      weapon: nativeWeaponConfig.weapon?.name || null,
      shield: nativeWeaponConfig.shield?.name || null,
    });
  }

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  model.updateMatrixWorld(true);
  let invalidSkeletonBindings = 0;
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    for (const bone of o.skeleton.bones) {
      let parent = bone;
      let insideModel = false;
      while (parent) {
        if (parent === model) { insideModel = true; break; }
        parent = parent.parent;
      }
      if (!insideModel) invalidSkeletonBindings++;
    }
  });
  if (invalidSkeletonBindings) {
    throw new Error('GLTF clone has invalid SkinnedMesh skeleton bindings: ' + invalidSkeletonBindings);
  }


  const root = new THREE.Group();
  root.add(model);

  // These seven nodes are compatibility anchors for the old procedural rig API.
  // They MUST stay outside the GLTF model/skeleton: gameplay code may rotate or
  // scale these references for procedural actors, but GLTF animation must own all
  // actual bones/meshes exclusively through GltfAnimator's AnimationMixer.
  const body = new THREE.Group();
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const armL = new THREE.Group();
  const armR = new THREE.Group();

  body.name = 'PlayerRigBodyAnchor';
  torso.name = 'PlayerRigTorsoAnchor';
  head.name = 'PlayerRigHeadAnchor';
  legL.name = 'PlayerRigLegLAnchor';
  legR.name = 'PlayerRigLegRAnchor';
  armL.name = 'PlayerRigArmLAnchor';
  armR.name = 'PlayerRigArmRAnchor';

  root.add(body, torso, head, legL, legR, armL, armR);

  // vocation GLTF: GLTFLoader removes dots from bone names.
  // KayKit uses handslot.l/r; other humanoids are matched through generic Hand/LeftHand/RightHand patterns.
  // Keep the gameplay anchors DIRECTLY under those animated bones so every
  // weapon follows the hand translation/rotation/scale produced by the mixer.
  const handBoneL = findBone(model, [
    /^handslotl$/i, /^handl$/i, /^lefthand$/i, /^left_hand$/i, /^hand\.l$/i,
    /left.*hand/i, /hand.*left/i, /wrist.*l$/i, /forearm.*l$/i,
  ]);
  const handBoneR = findBone(model, [
    /^handslotr$/i, /^handr$/i, /^righthand$/i, /^right_hand$/i, /^hand\.r$/i,
    /right.*hand/i, /hand.*right/i, /wrist.*r$/i, /forearm.*r$/i,
  ]);

  const handL = armL;
  const handR = armR;
  handL.name = 'PlayerRigArmLAnchor';
  handR.name = 'PlayerRigArmRAnchor';
  handL.userData.sourceHandBone = handBoneL?.name || null;
  handR.userData.sourceHandBone = handBoneR?.name || null;

  if (handBoneL) handBoneL.add(handL);
  if (handBoneR) handBoneR.add(handR);

  if (!handBoneL || !handBoneR) {
    console.warn('[ARENA] GLTF hand bone lookup incomplete.', {
      left: handBoneL?.name || null,
      right: handBoneR?.name || null,
    });
  } else {
    console.log('[ARENA] GLTF HAND BONES', {
      left: handBoneL.name,
      right: handBoneR.name,
    });
  }

  const eyes = [];
  root.traverse((o) => {
    if (o.isMesh && /(eye|eyeball)/i.test(o.name)) eyes.push(o);
  });

  return {
    root,
    body, torso, head, legL, legR, armL, armR,
    handL, handR, eyes, cape: null, model,
    usesNativeWeapons: nativeWeaponConfig.usesNativeWeapons,
    nativeWeapon: nativeWeaponConfig.weapon,
    nativeShield: nativeWeaponConfig.shield,
    animations: asset.animations || [],
    // Diagnostic-only reference: proves the mixer targets the SkeletonUtils clone,
    // not the loader cache's original scene.
    sourceScene: asset.scene,
    makeAnimator() { return new GltfAnimator(this); },
  };
}

const GLTF_WEAPON_OFFSETS = {
  crossbow: { position: [0, 0, 0], rotation: [-Math.PI / 2, Math.PI, 0], targetSize: 1.4 },
  staff: { position: [0, 0, 0], rotation: [0, Math.PI / 2, Math.PI / 2], targetSize: 2.0 },
};


function centerWeaponAtGrip(weapon, type) {
  weapon.updateMatrixWorld(true);

  // For a single BufferGeometry, geometry.center() is the correct primitive.
  // Composite weapon Groups need the equivalent group-space rebase so the
  // relative positions of stock/limbs/rail/orb are preserved.
  if (weapon.isMesh && weapon.geometry?.center) {
    weapon.geometry.center();
    weapon.position.set(0, 0, 0);
    weapon.updateMatrixWorld(true);
    return;
  }

  const box = new THREE.Box3().setFromObject(weapon);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const grip = type === 'crossbow'
    ? center
    : new THREE.Vector3(
      center.x,
      box.min.y,
      center.z
    );

  weapon.children.forEach((child) => {
    child.position.sub(grip);
  });
  weapon.updateMatrixWorld(true);
}

function applyGltfWeaponOffset(weaponMesh, type) {
  const typeStr = String(type || '');
  const isStaff = /staff|cajado|sorcerer|druid/i.test(typeStr);
  const offset = GLTF_WEAPON_OFFSETS[isStaff ? 'staff' : type];
  if (!offset) return;
  if (offset.position) weaponMesh.position.set(...offset.position);
  if (offset.rotation) weaponMesh.rotation.set(...offset.rotation);
}

function normalizedNodeName(name) {
  return String(name || '').toLowerCase().replace(/[.\s_-]+/g, '');
}

function isWeaponOrShieldNode(name) {
  const n = normalizedNodeName(name);
  return n.includes('sword') ||
    n.includes('shield') ||
    n.includes('staff') ||
    n.includes('bow') ||
    n.includes('1h') ||
    n.includes('2h') ||
    n.includes('knife');
}

function isNativeDaggerNode(name) {
  const n = normalizedNodeName(name);
  return n.includes('dagger') || n.includes('knife');
}

function findNativeNode(model, patterns) {
  let hit = null;
  model.traverse((child) => {
    if (hit) return;
    const n = normalizedNodeName(child.name);
    if (patterns.some((pattern) => pattern.test(n))) hit = child;
  });
  return hit;
}

function getNativeWeaponNameForVocation(vocation) {
  const v = String(vocation || '').toLowerCase();
  if (v === 'knight') return ['1hsword', '2hsword'];
  if (v === 'sorcerer' || v === 'druid') return ['staff'];
  if (v === 'paladin') return ['bow', 'crossbow'];
  return [];
}

function setSubtreeVisible(node, visible) {
  node.traverse((child) => {
    child.visible = visible;
  });
}

function configureNativeKayKitWeapons(model, vocation) {
  const v = String(vocation || '').toLowerCase();
  const nativeNames = getNativeWeaponNameForVocation(v);
  const usesNativeWeapons = nativeNames.length > 0;

  if (!usesNativeWeapons) return { usesNativeWeapons: false, weapon: null, shield: null };

  let weapon = null;
  if (v === 'knight') {
    weapon = findNativeNode(model, [/^1hsword(?:$|\\d)/, /^2hsword(?:$|\\d)/]);
  } else if (v === 'sorcerer' || v === 'druid') {
    weapon = findNativeNode(model, [/^staff(?:$|\\d)/]);
  } else if (v === 'paladin') {
    // KayKit Rogue uses the native ranged accessory as 1H_Crossbow.
    weapon = findNativeNode(model, [
      /^1hcrossbow(?:$|\\d)/,
      /^2hcrossbow(?:$|\\d)/,
      /^crossbow(?:$|\\d)/,
      /^bow(?:$|\\d)/,
    ]);
  }

  const shield = v === 'knight'
    ? findNativeNode(model, [/^shield(?:$|\\d)/])
    : null;

  // Important: weapon meshes can have child meshes whose names also contain
  // "sword", "bow", etc. Setting visibility independently during traverse can
  // accidentally re-enable a child belonging to an inactive weapon.
  // First disable the complete subtree of EVERY weapon/shield node.
  const equipmentNodes = [];
  model.traverse((child) => {
    if (isWeaponOrShieldNode(child.name)) equipmentNodes.push(child);
  });

  for (const node of equipmentNodes) {
    setSubtreeVisible(node, false);
  }

  // Then enable only the complete native loadout selected for this vocation.
  if (weapon) setSubtreeVisible(weapon, true);
  if (shield) setSubtreeVisible(shield, true);

  // The native crossbow needs its third Euler axis adjusted; Y/X are left
  // untouched because those orientations were tested and are incorrect.
  if (v === 'paladin' && weapon) {
    weapon.rotation.z += Math.PI / 2;
  }

  // Rogue/KayKit carries knives as separate native accessories.
  // Hide only the knife/dagger nodes, never their parent hierarchy, so the
  // selected crossbow remains completely intact.
  if (v === 'paladin') {
    model.traverse((child) => {
      if (isNativeDaggerNode(child.name)) child.visible = false;
    });
  }

  return { usesNativeWeapons: true, weapon, shield };
}

function disposeWeaponNode(node) {
  node.traverse((child) => {
    if (child.geometry?.dispose) child.geometry.dispose();

    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose?.());
    }
  });
}

function clearAttachedGltfWeapons(pivot) {
  if (!pivot) return;

  while (pivot.children.length > 0) {
    const child = pivot.children[0];
    pivot.remove(child);
    disposeWeaponNode(child);
  }

  if (pivot.parent) {
    pivot.parent.remove(pivot);
  }
}


export function attachGltfWeapon(rig, anim, type, look = {}, hand) {
  if (!rig?.model || !hand || !type) return null;

  // KayKit already contains the correct native weapon/shield for these
  // vocations. Never create a second generic gameplay weapon on top of it.
  if (rig.usesNativeWeapons) {
    const nativeNode = /shield/i.test(String(type))
      ? rig.nativeShield
      : rig.nativeWeapon;

    if (nativeNode) {
      nativeNode.visible = true;
      const isShield = /shield/i.test(String(type));

      // Keep weaponPivot pointing at the offensive weapon. The shield is only
      // an offhand visual and must not become the projectile/melee origin.
      if (!isShield) rig.weaponPivot = nativeNode;

      if (anim && !isShield) {
        anim.equippedWeaponPivot = nativeNode;
        anim.isStaffEquipped = /staff|cajado|sorcerer|druid/i.test(String(type));
      }

      return {
        weapon: nativeNode,
        pivot: isShield ? null : nativeNode,
        native: true,
      };
    }

    return { weapon: null, pivot: rig.weaponPivot || null, native: true };
  }

  // A Player can re-equip/change vocation/weapon without accumulating old
  // pivots. Remove the previous gameplay weapon before attaching the new one.
  clearAttachedGltfWeapons(rig.equippedWeaponPivot || rig.weaponPivot);

  const weaponMesh = createWeapon(type, look);
  weaponMesh.userData.arenaPlayerWeapon = type;
  const isStaff = /staff|cajado|sorcerer|druid/i.test(String(type));
  hand.updateMatrixWorld(true);
  weaponMesh.updateMatrixWorld(true);

  const targetSize = isStaff ? 2.0 : (GLTF_WEAPON_OFFSETS[type]?.targetSize || 1.5);
  if (isStaff || type === 'crossbow') {
    centerWeaponAtGrip(weaponMesh, type);
  }

  const box = new THREE.Box3().setFromObject(weaponMesh);
  const size = box.getSize(new THREE.Vector3());
  weaponMesh.scale.setScalar(targetSize / (Math.max(size.x, size.y, size.z) || 1));

  const pivot = new THREE.Group();
  pivot.name = 'PlayerWeaponPivot';
  const handScale = new THREE.Vector3();
  hand.getWorldScale(handScale);
  const safe = (v) => Number.isFinite(v) && Math.abs(v) > 0.00001 ? v : 1;
  pivot.scale.set(1 / safe(handScale.x), 1 / safe(handScale.y), 1 / safe(handScale.z));

  applyGltfWeaponOffset(weaponMesh, type);
  pivot.add(weaponMesh);
  hand.add(pivot);

  if (type === 'crossbow' || isStaff) rig.weaponPivot = pivot;
  if (isStaff) {
    rig.isStaffEquipped = true;
    rig.equippedWeaponPivot = pivot;
    if (anim) {
      anim.isStaffEquipped = true;
      anim.equippedWeaponPivot = pivot;
    }
  }
  return { weapon: weaponMesh, pivot };
}

export async function loadPlayerRig(look = {}, createHumanoid, vocation = null, playerData = null) {
  const vocationStr = (vocation || playerData?.vocation || 'knight').toString().toLowerCase();
  const modelPath = getModelPathForVocation(vocationStr);
  const asset = await getPlayerGltf(vocationStr);

  if (!asset?.scene) {
    throw new Error(`[ARENA] No real GLTF scene available for vocation: ${vocationStr}`);
  }

  const rig = buildGltfRig(asset, look, vocationStr);
  console.log('[ARENA] Real vocation GLTF rig ready.', {
    vocation: vocationStr,
    modelPath,
    clonedScene: rig.model !== asset.scene,
    modelName: rig.model.name || '(unnamed)',
    sourceName: asset.scene.name || '(unnamed)',
    animations: rig.animations.map((clip) => clip.name),
  });
  return rig;
}


export class GltfAnimator {
  constructor(rig) {
    this.r = rig;
    this.isStaffEquipped = !!rig.isStaffEquipped;
    this.equippedWeaponPivot = rig.equippedWeaponPivot || null;
    this.mixer = new THREE.AnimationMixer(rig.model);
    this.mixerTarget = rig.model;
    this.actions = {};

    for (const clip of rig.animations) {
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name] = action;
    }

    const findAction = (patterns) => {
      const key = Object.keys(this.actions).find((name) =>
        patterns.some((re) => re.test(name))
      );
      return key ? this.actions[key] : null;
    };

    this.actions.Idle = this.actions.Idle || findAction([/^idle$/i, /idle/i, /stand/i]);
    this.actions.Walking = this.actions.Walking || findAction([/^walking/i, /^walk/i, /walk_loop/i]);
    this.actions.Running = this.actions.Running || findAction([/^running/i, /^run/i, /sprint/i, /jog/i]);
    this.actions.Punch = this.actions.Punch || findAction([
      /punch/i, /attack/i, /melee/i, /shoot/i, /cast/i, /slash/i, /swing/i
    ]);
    this.actions.Death = this.actions.Death || findAction([/death/i, /die/i]);

    for (const action of Object.values(this.actions)) {
      if (!action || !action.getClip) continue;
      const name = action.getClip().name;
      if (/death|die/i.test(name)) {
        action.clampWhenFinished = true;
        action.loop = THREE.LoopOnce;
      }
    }

    // Start neutral animation immediately; real assets may call it Idle/idle/stand.
    for (const name of ['Idle', 'Walking', 'Running']) {
      const action = this.actions[name];
      if (!action) continue;
      action.enabled = true;
      action.setEffectiveWeight(name === 'Idle' ? 1 : 0);
      action.setEffectiveTimeScale(1);
      action.reset().play();
    }

    this.attackState = null;
    this.dying = false;
    this.dead = false;
    this.hurt = 0;
    this._diagnosticLogged = false;
    this._diagnosticTimer = 0;
    this._diagnosticCount = 0;

    // Start the neutral animation immediately. This guarantees Idle has weight
    // 1 before the first gameplay frame; Walking/Running remain at weight 0.
    for (const name of ['Idle', 'Walking', 'Running']) {
      const action = this.actions[name];
      if (!action) continue;
      action.enabled = true;
      action.setEffectiveWeight(name === 'Idle' ? 1 : 0);
      action.setEffectiveTimeScale(1);
      action.reset().play();
    }
  }

  setBaseWeights(speedNorm) {
    const s = Math.max(0, Math.min(1, Number(speedNorm) || 0));
    const idle = Math.max(0, 1 - s * 4);
    const walk = Math.max(0, 1 - Math.abs(s - 0.5) * 3);
    const run = Math.max(0, (s - 0.55) / 0.45);
    const sum = idle + walk + run || 1;
    const weights = { Idle: idle / sum, Walking: walk / sum, Running: run / sum };
    for (const name of ['Idle', 'Walking', 'Running']) {
      const action = this.actions[name];
      if (!action) continue;
      action.enabled = true;
      action.setEffectiveWeight(weights[name]);
      action.setEffectiveTimeScale(name === 'Running' ? 0.95 + s * 0.65 : 0.9 + s * 0.25);
      if (!action.isRunning()) action.play();
    }
  }

  attack(style, dur = 0.4) {
    const action = this.actions.Punch;
    if (!action) return;
    this.attackState = { action, t: 0, dur: Math.max(0.05, dur) };
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(action.getClip().duration / this.attackState.dur);
    action.play();
  }

  hit() { this.hurt = 0.12; }

  die() {
    this.dying = true;
    this.dead = true;
    this.attackState = null;
    for (const name of ['Idle', 'Walking', 'Running', 'Punch']) {
      if (this.actions[name]) this.actions[name].setEffectiveWeight(0);
    }
    const death = this.actions.Death;
    if (death) {
      death.reset().setLoop(THREE.LoopOnce, 1);
      death.clampWhenFinished = true;
      death.setEffectiveWeight(1);
      death.play();
    }
  }

  revive() {
    this.dying = false;
    this.dead = false;
    this.hurt = 0;
    this.attackState = null;
    for (const action of Object.values(this.actions)) action.stop().setEffectiveWeight(0);
    if (this.actions.Idle) this.actions.Idle.reset().setEffectiveWeight(1).play();
    this.r.root.rotation.set(0, 0, 0);
    this.r.root.position.y = 0;
  }

  diagnostic() {
    const mixerActions = {};
    for (const name of ['Idle', 'Walking', 'Running', 'Punch', 'Death']) {
      const action = this.actions[name];
      mixerActions[name.toLowerCase()] = action ? {
        running: action.isRunning(),
        enabled: action.enabled,
        weight: Number(action.getEffectiveWeight().toFixed(4)),
        time: Number(action.time.toFixed(4)),
      } : null;
    }

    const meshes = [];
    this.r.root.updateMatrixWorld(true);

    this.r.root.traverse((o) => {
      if (!o.isMesh) return;

      const worldPosition = new THREE.Vector3();
      const worldScale = new THREE.Vector3();
      o.getWorldPosition(worldPosition);
      o.getWorldScale(worldScale);

      let ancestorsVisible = true;
      let parent = o.parent;
      while (parent) {
        if (!parent.visible) {
          ancestorsVisible = false;
          break;
        }
        parent = parent.parent;
      }

      const material = Array.isArray(o.material) ? (o.material[0] || null) : o.material;
      const materialText = material
        ? `tipo=${material.type} cor=${material.color ? '#' + material.color.getHexString() : 'none'} opacity=${material.opacity ?? 'null'} transparent=${material.transparent ?? 'null'} colorWrite=${material.colorWrite ?? 'null'} depthWrite=${material.depthWrite ?? 'null'} depthTest=${material.depthTest ?? 'null'} visible=${material.visible ?? 'null'}`
        : 'tipo=null cor=none opacity=null transparent=null colorWrite=null depthWrite=null depthTest=null visible=null';

      const p = worldPosition.toArray().map((v) => Number(v.toFixed(3))).join(',');
      const s = worldScale.toArray().map((v) => Number(v.toFixed(3))).join(',');
      const line = `${o.name || '(unnamed)'} | skinned=${!!o.isSkinnedMesh} | visible=${o.visible} | ancestraisVisiveis=${ancestorsVisible} | posMundo=${p} | escalaMundo=${s} | layers=${o.layers.mask} | frustumCulled=${o.frustumCulled} | ${materialText} renderOrder=${o.renderOrder}`;
      console.log('[ARENA] ' + line);
      meshes.push(line);
    });

    // The camera is not an ancestor of the player; Player supplies it explicitly.
    const cameraLayersMask = this.r.camera?.layers?.mask ?? null;

    let activeActions = 0;
    for (const action of Object.values(this.actions)) {
      if (action.isRunning() && action.getEffectiveWeight() > 0.0001) activeActions++;
    }

    console.log(`[ARENA] GLTF PLAYER MESH DIAGNOSTIC END | cameraLayers=${cameraLayersMask} | activeActions=${activeActions} | meshCount=${meshes.length}`);
    return { meshes, mixerActions, activeActions };
  }

  update(dt, speedNorm) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!this.dead) {
      this.setBaseWeights(speedNorm);
      if (this.attackState) {
        this.attackState.t += dt;
        if (this.attackState.t >= this.attackState.dur) {
          this.attackState.action.stop();
          this.attackState = null;
        } else {
          for (const name of ['Idle', 'Walking', 'Running']) {
            if (this.actions[name]) this.actions[name].setEffectiveWeight(0);
          }
        }
      }
    }
    this.hurt = Math.max(0, this.hurt - dt);
    this.mixer.update(dt);



    // Log the actual post-update action state once per second for the first
    // five seconds, so the diagnostic reflects the running mixer rather than
    // constructor-time zeroed actions.
    if (this._diagnosticCount < 5) {
      this._diagnosticTimer += dt;
      if (this._diagnosticTimer >= 1) {
        this._diagnosticTimer -= 1;
        this._diagnosticCount++;
        const actions = {};
        for (const name of ['Idle', 'Walking', 'Running']) {
          const action = this.actions[name];
          if (!action) continue;
          actions[name] = {
            running: action.isRunning(),
            weight: Number(action.getEffectiveWeight().toFixed(4)),
            time: Number(action.time.toFixed(4)),
          };
        }
        console.log('[ARENA] GLTF ACTIONS', {
          second: this._diagnosticCount,
          activeActions: Object.values(this.actions).filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.0001).length,
          actions,
        });
      }
    }
  }
}
