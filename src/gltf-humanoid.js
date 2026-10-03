import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = './assets/models/RobotExpressive.glb';
const loader = new GLTFLoader();
const PLAYER_GLTF_PROMISE = loader.loadAsync(MODEL_URL).catch((error) => {
  console.warn('[ARENA] RobotExpressive.glb unavailable; using procedural player.', error);
  return null;
});

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
    makeAnimator() { return new GltfAnimator(this); },
  };
}

function fallbackRig(createHumanoid, look) {
  const rig = createHumanoid(look);
  rig.ready = PLAYER_GLTF_PROMISE.then((asset) => {
    if (!asset) return null;
    try { return buildGltfRig(asset, look); }
    catch (error) {
      console.warn('[ARENA] Failed to build RobotExpressive rig; keeping procedural player.', error);
      return null;
    }
  });
  return rig;
}

export function createPlayerRig(look = {}, createHumanoid) {
  const rig = fallbackRig(createHumanoid, look);
  console.log('[ARENA] Player rig: fallback (aguardando RobotExpressive.glb).');

  rig.ready = rig.ready.then((nextRig) => {
    if (!nextRig) {
      console.log('[ARENA] Player rig: FALLBACK — modelo glTF não foi usado.');
      return null;
    }

    const finalBox = new THREE.Box3().setFromObject(nextRig.model);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    console.log('[ARENA] Player rig: GLTF — modelo usado.', {
      height: Number(finalSize.y.toFixed(4)),
      minY: Number(finalBox.min.y.toFixed(4)),
      maxY: Number(finalBox.max.y.toFixed(4)),
    });
    return nextRig;
  });

  return rig;
}

export class GltfAnimator {
  constructor(rig) {
    this.r = rig;
    this.mixer = new THREE.AnimationMixer(rig.model);
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
      if (!action) {
        mixerActions[name.toLowerCase()] = null;
        continue;
      }
      mixerActions[name.toLowerCase()] = {
        running: action.isRunning(),
        enabled: action.enabled,
        weight: Number(action.getEffectiveWeight().toFixed(4)),
        time: Number(action.time.toFixed(4)),
      };
    }

    const materials = [];
    const meshes = [];
    let allParentsVisible = true;
    this.r.root.traverse((o) => {
      if (!o.visible) allParentsVisible = false;
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.visible = true;
      meshes.push({
        name: o.name || '(unnamed)',
        skinned: !!o.isSkinnedMesh,
        visible: o.visible,
        frustumCulled: o.frustumCulled,
      });
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const material of mats) {
        if (!material) continue;
        material.side = THREE.DoubleSide;
        material.colorWrite = true;
        material.depthWrite = true;
        material.needsUpdate = true;
        materials.push({
          type: material.type,
          opacity: material.opacity,
          transparent: material.transparent,
          colorWrite: material.colorWrite,
          depthWrite: material.depthWrite,
          visible: material.visible,
        });
      }
    });

    let chainVisible = true;
    for (let node = this.r.root; node; node = node.parent) {
      if (!node.visible) chainVisible = false;
    }

    this.r.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.r.model);
    const hand = this.r.handR;
    hand.updateMatrixWorld(true);
    const handWorld = new THREE.Vector3();
    hand.getWorldPosition(handWorld);
    const rootWorld = new THREE.Vector3();
    this.r.root.getWorldPosition(rootWorld);

    console.log('[ARENA] GLTF PLAYER DIAGNOSTIC', {
      dying: this.dying,
      dead: this.dead,
      mixer: mixerActions,
      allParentsVisible,
      chainVisible,
      meshCount: meshes.length,
      skinnedMeshCount: meshes.filter((m) => m.skinned).length,
      meshes,
      materials,
      rootWorld: rootWorld.toArray(),
      handRWorld: handWorld.toArray(),
      boxMin: box.min.toArray(),
      boxMax: box.max.toArray(),
      boxSize: box.getSize(new THREE.Vector3()).toArray(),
    });
    return { box, handWorld, rootWorld };
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
  }
}
