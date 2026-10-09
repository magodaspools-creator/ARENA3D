import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GltfAnimator } from './gltf-humanoid.js';

const A = (path) => new URL(path, import.meta.url).href;

const PATHS = {
  knight: A('../assets/kaykit/characters/Knight.glb'),
  mage: A('../assets/kaykit/characters/Mage.glb'),
  skeletonMinion: A('../assets/kaykit/characters/Skeleton_Minion.glb'),
  skeletonMage: A('../assets/kaykit/characters/Skeleton_Mage.glb'),
  skeletonRogue: A('../assets/kaykit/characters/Skeleton_Rogue.glb'),
  skeletonWarrior: A('../assets/kaykit/characters/Skeleton_Warrior.glb'),
  floor: A('../assets/kaykit/environment/floor-tile.glb'),
  grate: A('../assets/kaykit/environment/floor-grate.glb'),
  wall: A('../assets/kaykit/environment/wall-broken.glb'),
  arch: A('../assets/kaykit/environment/wall-arch.glb'),
  pillar: A('../assets/kaykit/environment/pillar.glb'),
  torch: A('../assets/kaykit/environment/torch.glb'),
  chest: A('../assets/kaykit/environment/chest.glb'),
  rubble: A('../assets/kaykit/environment/rubble.glb'),
  banner: A('../assets/kaykit/environment/banner.glb'),
};

const loader = new GLTFLoader();

let minimaHaloTexture = null;
let minimaTorchGlowTexture = null;

function makeRadialTexture(innerColor) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, innerColor);
  g.addColorStop(0.38, innerColor.replace(/rgba\\(([^,]+),([^,]+),([^,]+),[^)]+\\)/, 'rgba($1,$2,$3,0.32)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function getMinimaHaloTexture() {
  return minimaHaloTexture || (minimaHaloTexture = makeRadialTexture('rgba(120,220,190,0.52)'));
}

function getMinimaTorchGlowTexture() {
  return minimaTorchGlowTexture || (minimaTorchGlowTexture = makeRadialTexture('rgba(255,122,50,0.85)'));
}

export function addMinimaCharacterHalo(root, scale = 1.55) {
  if (!root || root.userData.minimaHalo) return;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getMinimaHaloTexture(), color: 0x8de0c8, transparent: true, opacity: 0.72,
    depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  sprite.name = 'MinimaCharacterHalo';
  sprite.position.set(0, 1.0, 0);
  sprite.scale.set(scale, scale, 1);
  sprite.renderOrder = -1;
  root.add(sprite);
  root.userData.minimaHalo = sprite;
}

export function addMinimaTorchGlow(root, scale = 1.35) {
  if (!root || root.userData.minimaTorchGlow) return;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getMinimaTorchGlowTexture(), color: 0xff8a40, transparent: true, opacity: 0.35,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  sprite.name = 'MinimaTorchGlow';
  sprite.position.set(0, 0.85, 0);
  sprite.scale.set(scale, scale, 1);
  sprite.renderOrder = -2;
  root.add(sprite);
  root.userData.minimaTorchGlow = sprite;
}

// Cache por URL: cada .glb tem UMA Promise de carregamento compartilhada por todos
// os inimigos/objetos. O modelo resultante é clonado com SkeletonUtils.clone().
const loadPromises = new Map();
const LOAD_ATTEMPTS = 4; // 1 tentativa inicial + até 3 retries
const RETRY_DELAYS = [500, 1000, 2000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadWithRetry(url) {
  let lastError = null;
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
    try {
      if (attempt > 0) {
        console.warn('[ARENA] Retrying KayKit GLB (' + attempt + '/' + (LOAD_ATTEMPTS - 1) + '): ' + url);
      }
      return await loader.loadAsync(url);
    } catch (error) {
      lastError = error;
      console.warn('[ARENA] KayKit GLB load failed (attempt ' + (attempt + 1) + '/' + LOAD_ATTEMPTS + '): ' + url, error);
    }
  }
  throw lastError;
}

export function kaykitPath(key) { return PATHS[key] || null; }

export function loadKayKitAsset(key) {
  const url = kaykitPath(key);
  if (!url) return Promise.reject(new Error('[ARENA] Unknown KayKit asset: ' + key));

  if (!loadPromises.has(url)) {
    const promise = loadWithRetry(url);
    loadPromises.set(url, promise);
  }
  return loadPromises.get(url);
}

const ENEMY_ASSET_KEYS = ['skeletonMinion', 'skeletonMage', 'skeletonRogue', 'skeletonWarrior'];
const ENVIRONMENT_ASSET_KEYS = ['floor', 'grate', 'wall', 'arch', 'pillar', 'torch', 'chest', 'rubble', 'banner'];
const PRELOAD_KEYS = [...ENEMY_ASSET_KEYS, ...ENVIRONMENT_ASSET_KEYS];
const idleTurn = () => new Promise((resolve) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 120 });
  else setTimeout(resolve, 24);
});

// Serial, yield-between-files preload. The same URL Promise is used by the
// live scene, so this does not download an asset twice.
export async function preloadKayKitAssetsSpaced(onProgress = null) {
  const results = [];
  for (let i = 0; i < PRELOAD_KEYS.length; i++) {
    const key = PRELOAD_KEYS[i];
    if (!loadPromises.has(kaykitPath(key))) await idleTurn();
    try {
      const asset = await loadKayKitAsset(key);
      // Force world matrices and bounds once while outside the transition.
      asset.scene.updateMatrixWorld(true);
      new THREE.Box3().setFromObject(asset.scene);
      results.push({ status: 'fulfilled', value: asset });
    } catch (reason) {
      results.push({ status: 'rejected', reason });
      console.warn('[ARENA] KayKit preload failed:', key, reason);
    }
    onProgress?.(i + 1, PRELOAD_KEYS.length, key);
  }
  const failed = results.filter((x) => x.status === 'rejected').length;
  console.info('[ARENA] Spaced KayKit preload complete:', {
    total: PRELOAD_KEYS.length, failed,
    cached: PRELOAD_KEYS.filter((key) => loadPromises.has(kaykitPath(key))),
  });
  return results;
}

export async function preloadKayKitEnemyAssets(onProgress = null) {
  const results = [];
  for (let i = 0; i < ENEMY_ASSET_KEYS.length; i++) {
    const key = ENEMY_ASSET_KEYS[i];
    if (!loadPromises.has(kaykitPath(key))) await idleTurn();
    try {
      results.push({ status: 'fulfilled', value: await loadKayKitAsset(key) });
    } catch (reason) {
      results.push({ status: 'rejected', reason });
      console.warn('[ARENA] KayKit enemy preload failed:', key, reason);
    }
    onProgress?.(i + 1, ENEMY_ASSET_KEYS.length, key);
  }
  return results;
}

// Começa o preload assim que este módulo é carregado, antes dos Enemy serem criados.
// A Promise fica no mesmo cache usado pelos inimigos, portanto não há segundo download.
// Enemy GLBs are loaded on demand; the cache still guarantees one network load per URL.
const kayKitEnemyPreload = null;

export function simplifyKayKitMaterials(root) {
  // LOW QUALITY MUST KEEP THE ORIGINAL GLTF MATERIAL. KayKit uses a shared
  // atlas texture; replacing the material can break its texture/color response
  // and, on some WebGL paths, animated SkinnedMesh variants.
  root?.traverse?.((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) {
        m.map.anisotropy = 1;
        m.map.needsUpdate = false;
      }
      // Do not inject emissive light into KayKit materials. The pack uses
      // an atlas/base-color workflow; adding emissive here was the source of
      // the washed-out low-quality scene.
      m.needsUpdate = true;
    }
    o.castShadow = false;
    o.receiveShadow = false;
  });
}

export function prepareKayKitLowQuality(root, addHalo = false) {
  simplifyKayKitMaterials(root);
  if (addHalo) addMinimaCharacterHalo(root, 1.45);
}

export async function cloneKayKit(key) {
  const asset = await loadKayKitAsset(key);
  const model = SkeletonUtils.clone(asset.scene);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (globalThis.game?.qualityName === 'minima' || globalThis.game?.qualityName === 'leve') {
    prepareKayKitLowQuality(model, true);
  }
  model.updateMatrixWorld(true);
  return { model, animations: asset.animations || [] };
}

// Facing corrections are isolated from gameplay-facing/attack calculations.
// KayKit skeleton assets use +Z as forward; the previous unconditional PI flip
// caused the visible model to face away from its movement direction.
const KAYKIT_RIG_FACING = Object.freeze({
  skeletonMinion: 0,
  skeletonMage: 0,
  skeletonRogue: 0,
  skeletonWarrior: 0,
  knight: 0,
  mage: 0,
});

export async function loadKayKitEnemyRig(type, targetHeight = 2) {
  const key =
    type === 'wisp' ? 'skeletonMage' :
    (type === 'scorpion' || type === 'spider' || type === 'spiderling') ? 'skeletonRogue' :
    (type === 'hollow') ? 'skeletonWarrior' :
    'skeletonMinion';

  const { model, animations } = await cloneKayKit(key);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const h = Math.max(0.001, size.y);
  const scale = Math.max(0.01, targetHeight / h);
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
  model.rotation.y = 0;
  model.updateMatrixWorld(true);

  // Per-source-rig facing correction. The previous unconditional PI rotation
  // flipped every enemy regardless of its authored forward axis.
  const root = new THREE.Group();
  root.name = 'KayKitEnemyRig';
  const facingCorrection = new THREE.Group();
  facingCorrection.name = 'KayKitFacingCorrection_' + key;
  facingCorrection.rotation.y = KAYKIT_RIG_FACING[key] ?? 0;
  facingCorrection.add(model);
  root.add(facingCorrection);

  if (new URLSearchParams(location.search).get('debug') === 'rigs') {
    console.info('[ARENA][rig-facing]', {
      enemyType: type, rig: key,
      correctionRadians: facingCorrection.rotation.y,
      correctionDegrees: Math.round(facingCorrection.rotation.y * 180 / Math.PI),
    });
  }

  const rig = { root, model, animations, facingCorrection, rigKey: key };
  const animator = new GltfAnimator(rig);
  return { root, model, rig, animator };
}

export class KayKitEnvironment {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'KayKitEnvironment';
    this.game.scene.add(this.root);
    this.ready = false;
    this.torchLights = [];
    this.rankedTorchLights = [];
    this.torchPhase = Math.random() * 10;
    this.floorUnderlay = null;
    this.propColliders = [];
    this.propInteractions = [];
    this.debugCollision = new URLSearchParams(location.search).get('debug') === 'colisao';
  }

  registerSolidPropCollider(prop, kind) {
    const collision = this.game.collision;
    if (!collision?.addOrientedBox || !prop) return;
    // Measure the final scaled model with no placement rotation first. The
    // collision footprint uses these local dimensions plus the prop rotation.
    prop.rotation.y = 0;
    prop.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(prop);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const margin = Math.min(0.18, Math.max(0.06, Math.min(size.x, size.z) * 0.08));
    const halfX = Math.max(0.08, size.x * 0.5 - margin);
    const halfZ = Math.max(0.08, size.z * 0.5 - margin);
    const rotationY = prop.userData.arenaPropRotationY || 0;
    const ox = center.x - prop.position.x, oz = center.z - prop.position.z;
    const cs = Math.cos(rotationY), sn = Math.sin(rotationY);
    const worldX = prop.position.x + ox * cs + oz * sn;
    const worldZ = prop.position.z - ox * sn + oz * cs;
    prop.rotation.y = rotationY;
    prop.updateMatrixWorld(true);
    const collider = collision.addOrientedBox(worldX, worldZ, halfX, halfZ, rotationY, { projectiles: true });
    collider.arenaKayKitProp = kind;
    this.propColliders.push(collider);

    if (this.debugCollision) {
      const debugGroup = new THREE.Group();
      debugGroup.name = 'ARENA_CollisionDebug_' + kind;
      debugGroup.position.copy(prop.position);
      debugGroup.rotation.y = rotationY;
      const geometry = new THREE.BoxGeometry(
        Math.max(0.08, size.x - margin * 2), Math.max(0.12, size.y), Math.max(0.08, size.z - margin * 2)
      );
      const material = new THREE.MeshBasicMaterial({
        color: 0xff32d2, wireframe: true, transparent: true, opacity: 0.95,
        depthTest: false, toneMapped: false,
      });
      const wire = new THREE.Mesh(geometry, material);
      wire.position.set(ox, center.y - prop.position.y, oz);
      wire.renderOrder = 999;
      debugGroup.add(wire);
      this.root.add(debugGroup);
      collider.debugObject = debugGroup;
    }
  }

  clear() {
    // GLB clone geometry/materials are shared with the module asset cache and
    // must remain alive. Dispose only per-rebuild resources owned by this root.
    this.root.traverse((object) => {
      if (object.isSprite && (object.name === 'MinimaTorchGlow' || object.name === 'MinimaCharacterHalo')) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose?.();
      }
    });
    for (const collider of this.propColliders) {
      const index = this.game.collision?.obstacles?.indexOf(collider) ?? -1;
      if (index >= 0) this.game.collision.obstacles.splice(index, 1);
      if (collider.debugObject) {
        collider.debugObject.traverse((object) => {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material?.dispose?.();
        });
        collider.debugObject.parent?.remove(collider.debugObject);
      }
    }
    this.propColliders.length = 0;
    for (const item of this.propInteractions) this.game.interaction?.remove?.(item);
    this.propInteractions.length = 0;
    if (this.floorUnderlay) {
      this.floorUnderlay.geometry?.dispose?.();
      const materials = Array.isArray(this.floorUnderlay.material) ? this.floorUnderlay.material : [this.floorUnderlay.material];
      for (const material of materials) material?.dispose?.();
    }
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.torchLights.length = 0;
    this.rankedTorchLights.length = 0;
    this.floorUnderlay = null;
  }

  update(dt, t) {
    if (!this.torchLights.length) return;
    const p = this.game.player?.pos;
    const ranked = this.rankedTorchLights;
    if (p) {
      for (let i = 0; i < ranked.length; i++) {
        const item = ranked[i];
        const dx = item.light.position.x - p.x, dz = item.light.position.z - p.z;
        item.distanceSq = dx * dx + dz * dz;
      }
      ranked.sort((a, b) => a.distanceSq - b.distanceSq);
      for (let i = 0; i < ranked.length; i++) ranked[i].rank = i;
    }
    const activeCount = this.game.qualityName === 'alta' ? 6 : 4;
    for (let i = 0; i < this.torchLights.length; i++) {
      const item = this.torchLights[i];
      item.light.visible = !p || item.rank < activeCount;
      const wave = Math.sin((t + item.phase) * 8.0) * 0.08 + Math.sin((t + item.phase) * 17.0) * 0.045;
      item.light.intensity = item.base + wave * item.base;
      item.light.position.y = item.y + Math.sin((t + item.phase) * 3.0) * 0.025;
    }
  }

  async rebuild() {
    const collision = this.game.collision;
    if (!collision?.zones?.length) return;
    const [floor, grate, wall, pillar, torch, rubble, chest, banner] = await Promise.all([
      loadKayKitAsset('floor'),
      loadKayKitAsset('grate'),
      loadKayKitAsset('wall'),
      loadKayKitAsset('pillar'),
      loadKayKitAsset('torch'),
      loadKayKitAsset('rubble'),
      loadKayKitAsset('chest'),
      loadKayKitAsset('banner'),
    ]);

    this.clear();

    if (this.game.qualityName === 'minima' || this.game.qualityName === 'leve') {
      for (const asset of [floor, grate, wall, pillar, torch, rubble, chest, banner]) {
        prepareKayKitLowQuality(asset.scene, false);
      }
    }

    const bounds = this.bounds(collision.zones);
    // Measure the real GLB footprint instead of assuming the grid pitch.
    // floor-tile.glb is authored from -2..+2 on X/Z: 4 x 4 world units.
    // Its pivot is centered, so a cell center can be used directly as position.
    const floorBox = new THREE.Box3().setFromObject(floor.scene);
    const floorSize = floorBox.getSize(new THREE.Vector3());
    const floorCenter = floorBox.getCenter(new THREE.Vector3());
    const stepX = Math.max(0.1, floorSize.x);
    const stepZ = Math.max(0.1, floorSize.z);
    const gridMinX = Math.floor(bounds.minX / stepX) * stepX;
    const gridMinZ = Math.floor(bounds.minZ / stepZ) * stepZ;
    console.info('[ARENA] KayKit floor tile footprint:', {
      sizeX: Number(floorSize.x.toFixed(4)),
      sizeY: Number(floorSize.y.toFixed(4)),
      sizeZ: Number(floorSize.z.toFixed(4)),
      centerX: Number(floorCenter.x.toFixed(4)),
      centerZ: Number(floorCenter.z.toFixed(4)),
      previousStep: 4,
      stepX: Number(stepX.toFixed(4)),
      stepZ: Number(stepZ.toFixed(4)),
    });

    // MINIMA/LEVE: continuous cheap underlay prevents black cracks between
    // imported floor tiles without touching gameplay collision.
    if (this.game.qualityName === 'minima' || this.game.qualityName === 'leve') {
      const width = Math.max(4, bounds.maxX - bounds.minX + 8);
      const depth = Math.max(4, bounds.maxZ - bounds.minZ + 8);
      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
      const underlay = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshBasicMaterial({ color: 0x18342d, side: THREE.DoubleSide })
      );
      underlay.rotation.x = -Math.PI * 0.5;
      underlay.position.set(centerX, this.groundY(centerX, centerZ) - 0.12, centerZ);
      underlay.renderOrder = -5;
      this.root.add(underlay);
      this.floorUnderlay = underlay;
    }
    let placed = 0;
    const maxTiles = 700;

    for (let z = gridMinZ; z <= bounds.maxZ && placed < maxTiles; z += stepZ) {
      for (let x = gridMinX; x <= bounds.maxX && placed < maxTiles; x += stepX) {
        const gx = x + stepX * 0.5, gz = z + stepZ * 0.5;
        if (!collision.inside(gx, gz, 0)) continue;

        const tile = SkeletonUtils.clone(floor.scene);
        tile.position.set(gx - floorCenter.x, this.groundY(gx, gz), gz - floorCenter.z);
        this.root.add(tile);
        placed++;

        if (placed % 29 === 0) {
          const r = SkeletonUtils.clone(grate.scene);
          r.position.copy(tile.position);
          r.rotation.y = Math.PI * 0.5;
          this.root.add(r);
        }
        if (placed % 47 === 0) {
          const p = SkeletonUtils.clone(pillar.scene);
          p.position.copy(tile.position);
          p.userData.arenaPropRotationY = 0;
          this.root.add(p);
          this.registerSolidPropCollider(p, 'pillar');
        }
        if (placed % 83 === 0) {
          const c = SkeletonUtils.clone(chest.scene);
          c.position.copy(tile.position);
          c.position.y += 0.02;
          c.userData.arenaPropRotationY = (placed % 4) * Math.PI * 0.5;
          c.rotation.y = c.userData.arenaPropRotationY;
          this.root.add(c);
          this.registerSolidPropCollider(c, 'chest');
          // These KayKit chests are decorative props without loot. Keep them
          // distinct from gameplay chests that already own rewards/interactions.
          const lockedChest = this.game.interaction?.add?.({
            pos: c.position,
            radius: 2.2,
            height: c.position.y + 1.0,
            label: 'Baú trancado',
            onInteract: () => this.game.ui?.toast?.('Está trancado.'),
          });
          if (lockedChest) this.propInteractions.push(lockedChest);
        }
        if (placed % 107 === 0) {
          const b = SkeletonUtils.clone(banner.scene);
          b.position.copy(tile.position);
          b.position.y += 1.6;
          b.userData.arenaPropRotationY = 0;
          this.root.add(b);
          this.registerSolidPropCollider(b, 'banner');
        }
        if (placed % 61 === 0) {
          const rr = SkeletonUtils.clone(rubble.scene);
          rr.position.copy(tile.position);
          rr.rotation.y = (placed % 4) * Math.PI * 0.5;
          this.root.add(rr);
        }

        const edge =
          !collision.inside(gx + stepX, gz, 0) ||
          !collision.inside(gx - stepX, gz, 0) ||
          !collision.inside(gx, gz + stepZ, 0) ||
          !collision.inside(gx, gz - stepZ, 0);
        if (edge && placed % 2 === 0) {
          const w = SkeletonUtils.clone(wall.scene);
          w.position.set(gx, this.groundY(gx, gz), gz);
          w.userData.arenaPropRotationY = !collision.inside(gx + stepX, gz, 0) ? Math.PI * 0.5 : 0;
          w.rotation.y = w.userData.arenaPropRotationY;
          this.root.add(w);
          this.registerSolidPropCollider(w, 'wall');
          if (placed % 6 === 0) {
            const t = SkeletonUtils.clone(torch.scene);
            t.position.copy(w.position);
            t.position.y += 1.1;
            t.rotation.y = w.rotation.y;
            this.root.add(t);

            if (this.game.qualityName === 'minima' || this.game.qualityName === 'leve') {
              addMinimaTorchGlow(t, 1.35);
            }

            // Warm local illumination: the torch model itself is emissive,
            // while this point light gives the surrounding dungeon the ARPG
            // torch-lit look. Only a subset casts shadows to keep the pass cheap.
            const maxTorchLights = this.game.qualityName === 'minima' ? 0 : this.game.qualityName === 'leve' ? 2 : 14;
            if (this.torchLights.length < maxTorchLights) {
              const light = new THREE.PointLight(0xff7a32, this.game.qualityName === 'leve' ? 6.5 : 8.5, 10, 1.8);
              light.position.set(gx, this.groundY(gx, gz) + 1.9, gz);
              light.castShadow = false;
              if (light.castShadow) {
                light.shadow.mapSize.set(256, 256);
                light.shadow.bias = -0.001;
                light.shadow.normalBias = 0.025;
              }
              this.root.add(light);
              const torchRecord = { light, base: 8.5, y: light.position.y, phase: this.torchPhase + placed * 0.37, distanceSq: 0, rank: this.torchLights.length };
              this.torchLights.push(torchRecord);
              this.rankedTorchLights.push(torchRecord);
            }
          }
        }
      }
    }

    if (this.game.qualityName === 'minima' || this.game.qualityName === 'leve') simplifyKayKitMaterials(this.root);
    this.ready = true;
    console.info('[ARENA] KayKit environment ready:', { tiles: placed, objects: this.root.children.length, torchLights: this.torchLights.length });
  }

  groundY(x, z) {
    return Number.isFinite(this.game.collision.groundHeight?.(x, z))
      ? this.game.collision.groundHeight(x, z)
      : 0;
  }

  bounds(zones) {
    const out = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const z of zones) {
      if (z.type === 'rect') {
        out.minX = Math.min(out.minX, z.minX); out.maxX = Math.max(out.maxX, z.maxX);
        out.minZ = Math.min(out.minZ, z.minZ); out.maxZ = Math.max(out.maxZ, z.maxZ);
      } else if (z.type === 'circle') {
        out.minX = Math.min(out.minX, z.x - z.r); out.maxX = Math.max(out.maxX, z.x + z.r);
        out.minZ = Math.min(out.minZ, z.z - z.r); out.maxZ = Math.max(out.maxZ, z.z + z.r);
      } else if (z.type === 'polygon') {
        for (const [x, zz] of z.points) {
          out.minX = Math.min(out.minX, x); out.maxX = Math.max(out.maxX, x);
          out.minZ = Math.min(out.minZ, zz); out.maxZ = Math.max(out.maxZ, zz);
        }
      }
    }
    return out;
  }
}
