import * as THREE from 'three';
import { createWeapon } from './models.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const PLAYER_MODEL_PATH = './assets/models/RobotExpressive.glb';
const loader = new GLTFLoader();
let PLAYER_GLTF_PROMISE = null;

const VOCATION_COLORS = {
  paladin: 0xFFD700,
  sorcerer: 0x8A2BE2,
  druid: 0x2E8B57,
  knight: 0xC0C0C0,
};

function getVocationColor(vocation) {
  return VOCATION_COLORS[String(vocation || '').toLowerCase()] ?? 0xD8D8D8;
}

function getPlayerGltf() {
  if (!PLAYER_GLTF_PROMISE) {
    PLAYER_GLTF_PROMISE = loader.loadAsync(PLAYER_MODEL_PATH).catch((error) => {
      console.error('[ARENA] Default GLTF unavailable.', { modelPath: PLAYER_MODEL_PATH, error });
      return null;
    });
  }
  return PLAYER_GLTF_PROMISE;
}

function tintVocationModel(model, vocation) {
  const color = getVocationColor(vocation);
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => {
        const clone = material.clone();
        if (clone.color) clone.color.set(color);
        return clone;
      });
      return;
    }
    const material = child.material.clone();
    if (material.color) material.color.set(color);
    child.material = material;
  });
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

  // Mantém o robô proporcional ao cenário e ao Player antigo (~3.8m na escala atual).
  const targetHeight = 76.0;
  const scale = targetHeight / size.y;
  model.scale.set(scale, scale, scale);
  // NUNCA alterar model.position.y aqui.
}

function buildGltfRig(asset, look = {}, vocation = null) {
  const model = SkeletonUtils.clone(asset.scene);
  tintVocationModel(model, vocation);
  normalizeModel(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
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

  // RobotExpressive.glb: GLTFLoader removes dots from bone names.
  // The actual hand bones are Palm2L and Palm2R (source names Palm2.L/Palm2.R).
  // Keep the gameplay anchors DIRECTLY under those animated bones so every
  // weapon follows the hand translation/rotation/scale produced by the mixer.
  const handBoneL = findBone(model, [/^Palm2L$/i, /LeftHand$/i, /HandL$/i, /LeftPalm$/i, /PalmL$/i]);
  const handBoneR = findBone(model, [/^Palm2R$/i, /RightHand$/i, /HandR$/i, /RightPalm$/i, /PalmR$/i]);

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

function applyGltfWeaponOffset(weaponMesh, type) {
  const typeStr = String(type || '');
  const isStaff = /staff|cajado|sorcerer|druid/i.test(typeStr);
  const offset = GLTF_WEAPON_OFFSETS[isStaff ? 'staff' : type];
  if (!offset) return;
  if (offset.position) weaponMesh.position.set(...offset.position);
  if (offset.rotation) weaponMesh.rotation.set(...offset.rotation);
}

export function attachGltfWeapon(rig, anim, type, look = {}, hand) {
  if (!rig?.model || !hand || !type) return null;
  const weaponMesh = createWeapon(type, look);
  weaponMesh.userData.arenaPlayerWeapon = type;
  const isStaff = /staff|cajado|sorcerer|druid/i.test(String(type));
  hand.updateMatrixWorld(true);
  weaponMesh.updateMatrixWorld(true);

  const targetSize = isStaff ? 2.0 : (GLTF_WEAPON_OFFSETS[type]?.targetSize || 1.5);
  if (isStaff) {
    const box = new THREE.Box3().setFromObject(weaponMesh);
    const grip = new THREE.Vector3(
      (box.min.x + box.max.x) * 0.5,
      box.min.y,
      (box.min.z + box.max.z) * 0.5
    );
    weaponMesh.children.forEach((child) => child.position.sub(grip));
    weaponMesh.updateMatrixWorld(true);
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
  const vocationStr = (typeof vocation !== 'undefined' && vocation)
    ? String(vocation).toLowerCase()
    : (playerData && playerData.vocation ? String(playerData.vocation).toLowerCase() : 'paladin');
  const asset = await getPlayerGltf();
  if (asset) {
    try {
      const rig = buildGltfRig(asset, look, vocationStr);
      console.log('[ARENA] Player rig ready: GLTF final rig.', {
        vocation: vocationStr,
        modelPath: PLAYER_MODEL_PATH,
        clonedScene: rig.model !== asset.scene,
        modelName: rig.model.name || '(unnamed)',
        sourceName: asset.scene.name || '(unnamed)',
      });
      return rig;
    } catch (error) {
      console.warn('[ARENA] Failed to build GLTF rig; using procedural player.', error);
    }
  }
  const rig = createHumanoid(look);
  rig.isProceduralFallback = true;
  console.log('[ARENA] Player rig ready: PROCEDURAL FALLBACK.');
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
      if (clip.name === 'Death' || clip.name === 'Punch') {
        action.clampWhenFinished = true;
        action.loop = THREE.LoopOnce;
      }
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
