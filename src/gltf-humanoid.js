import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = './assets/models/RobotExpressive.glb';
const loader = new GLTFLoader();
let PLAYER_GLTF_PROMISE = null;

function getPlayerGltf() {
  if (!PLAYER_GLTF_PROMISE) {
    PLAYER_GLTF_PROMISE = loader.loadAsync(MODEL_URL).catch((error) => {
      console.warn('[ARENA] RobotExpressive.glb unavailable; using procedural player.', error);
      return null;
    });
  }
  return PLAYER_GLTF_PROMISE;
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
  if (!Number.isFinite(size.y) || size.y <= 0.001) throw new Error('RobotExpressive has invalid height.');
  model.scale.multiplyScalar(1.9 / size.y);
  const scaledBox = new THREE.Box3().setFromObject(model);
  model.position.y -= scaledBox.min.y;
}

function buildGltfRig(asset, look = {}) {
  const model = SkeletonUtils.clone(asset.scene);
  normalizeModel(model);
  model.traverse((o) => {
    o.visible = true;
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const material of materials) {
        if (!material) continue;
        // RobotExpressive is opaque in the GLB. Keep the imported material visible
        // even if a later player-effect path touched a shared material instance.
        material.visible = true;
        if (material.opacity !== undefined && material.opacity <= 0) material.opacity = 1;
        if (material.transparent && material.opacity >= 1) material.transparent = false;
        material.needsUpdate = true;
      }
    }
  });
  model.updateMatrixWorld(true);

  const root = new THREE.Group();
  root.add(model);

  const pelvis = findBone(root, [/Hips$/i, /Hip$/i, /Pelvis$/i]);
  const torso = findBone(root, [/Spine2$/i, /Spine1$/i, /Spine$/i]);
  const head = findBone(root, [/Head$/i]);
  const legL = findBone(root, [/LeftUpLeg$/i, /LeftLeg$/i, /ThighL$/i, /LegL$/i]);
  const legR = findBone(root, [/RightUpLeg$/i, /RightLeg$/i, /ThighR$/i, /LegR$/i]);
  const armL = findBone(root, [/LeftArm$/i, /LeftForeArm$/i, /UpperArmL$/i, /ArmL$/i]);
  const armR = findBone(root, [/RightArm$/i, /RightForeArm$/i, /UpperArmR$/i, /ArmR$/i]);
  // GLTFLoader normalizes bone names by removing dots (e.g. Palm2.R -> Palm2R).
  // Keep both semantic hand names and the normalized Palm2 names so weapon groups
  // remain attached even when a model uses the latter convention.
  const handBoneL = findBone(root, [/LeftHand$/i, /HandL$/i, /LeftPalm$/i, /Palm2L$/i, /PalmL$/i]);
  const handBoneR = findBone(root, [/RightHand$/i, /HandR$/i, /RightPalm$/i, /Palm2R$/i, /PalmR$/i]);

  const handL = new THREE.Group();
  const handR = new THREE.Group();
  (handBoneL || root).add(handL);
  (handBoneR || root).add(handR);

  const eyes = [];
  root.traverse((o) => {
    if (o.isMesh && /(eye|eyeball)/i.test(o.name)) eyes.push(o);
  });

  return {
    root,
    body: pelvis || root,
    torso: torso || pelvis || root,
    head: head || torso || pelvis || root,
    legL: legL || pelvis || root,
    legR: legR || pelvis || root,
    armL: armL || torso || root,
    armR: armR || torso || root,
    handL, handR, eyes, cape: null, model,
    animations: asset.animations || [],
    // Diagnostic-only reference: proves the mixer targets the SkeletonUtils clone,
    // not the loader cache's original scene.
    sourceScene: asset.scene,
    makeAnimator() { return new GltfAnimator(this); },
  };
}

export async function loadPlayerRig(look = {}, createHumanoid) {
  const asset = await getPlayerGltf();
  if (asset) {
    try {
      const rig = buildGltfRig(asset, look);
      console.log('[ARENA] Player rig ready: GLTF final rig.', {
        clonedScene: rig.model !== asset.scene,
        modelName: rig.model.name || '(unnamed)',
        sourceName: asset.scene.name || '(unnamed)',
      });
      return rig;
    } catch (error) {
      console.warn('[ARENA] Failed to build RobotExpressive rig; using procedural player.', error);
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

      const ancestors = [];
      let parent = o;
      while (parent) {
        ancestors.push({
          name: parent.name || parent.type || '(unnamed)',
          visible: parent.visible,
          isScene: !!parent.isScene,
        });
        parent = parent.parent;
      }

      const materials = Array.isArray(o.material) ? o.material : [o.material];
      const material = materials[0] || null;
      const materialInfo = material ? {
        type: material.type,
        color: material.color ? '#' + material.color.getHexString() : null,
        opacity: material.opacity ?? null,
        transparent: material.transparent ?? null,
        colorWrite: material.colorWrite ?? null,
        depthWrite: material.depthWrite ?? null,
        depthTest: material.depthTest ?? null,
        side: material.side ?? null,
        visible: material.visible ?? null,
      } : null;

      meshes.push({
        name: o.name || '(unnamed)',
        isSkinnedMesh: !!o.isSkinnedMesh,
        visible: o.visible,
        ancestors,
        worldPosition: worldPosition.toArray().map((v) => Number(v.toFixed(5))),
        worldScale: worldScale.toArray().map((v) => Number(v.toFixed(5))),
        layersMask: o.layers.mask,
        frustumCulled: o.frustumCulled,
        renderOrder: o.renderOrder,
        material: materialInfo,
      });
    });

    // The camera is not an ancestor of the player; Player supplies it explicitly.
    const cameraLayersMask = this.r.camera?.layers?.mask ?? null;

    let activeActions = 0;
    for (const action of Object.values(this.actions)) {
      if (action.isRunning() && action.getEffectiveWeight() > 0.0001) activeActions++;
    }

    console.log('[ARENA] GLTF PLAYER MESH DIAGNOSTIC', {
      cameraLayersMask,
      activeActions,
      actions: mixerActions,
      meshes,
    });
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
