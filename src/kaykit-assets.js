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

export function addMinimaTorchGlow(root, scale = 2.4) {
  if (!root || root.userData.minimaTorchGlow) return;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getMinimaTorchGlowTexture(), color: 0xff8a40, transparent: true, opacity: 0.9,
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

export async function preloadKayKitEnemyAssets() {
  const keys = ['skeletonMinion', 'skeletonMage', 'skeletonRogue', 'skeletonWarrior'];
  const results = await Promise.allSettled(keys.map((key) => loadKayKitAsset(key)));
  const failed = results
    .map((result, index) => result.status === 'rejected' ? keys[index] : null)
    .filter(Boolean);

  if (failed.length) {
    console.warn('[ARENA] Some KayKit enemy visuals could not be preloaded:', failed);
  } else {
    console.info('[ARENA] KayKit enemy GLBs preloaded:', keys);
  }

  return results;
}

// Começa o preload assim que este módulo é carregado, antes dos Enemy serem criados.
// A Promise fica no mesmo cache usado pelos inimigos, portanto não há segundo download.
// Enemy GLBs are loaded on demand; the cache still guarantees one network load per URL.
const kayKitEnemyPreload = null;

export function simplifyKayKitMaterials(root) {
  root?.traverse?.((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      if (!m) return m;
      const color = m.color?.clone?.() || new THREE.Color(0xffffff);
      if (!m.map && color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.035) color.set(0x53645e);
      if (m.isMeshBasicMaterial) return m;
      if (m.isMeshLambertMaterial) {
        m.color.copy(color);
        m.emissive = color.clone().multiplyScalar(0.38);
        m.emissiveIntensity = 1;
        m.normalMap = null;
        m.envMap = null;
        if (m.map) m.map.anisotropy = 1;
        return m;
      }
      const next = new THREE.MeshLambertMaterial({
        color,
        map: m.map || null,
        transparent: !!m.transparent,
        opacity: m.opacity ?? 1,
        alphaTest: m.alphaTest ?? 0,
        side: m.side,
        emissive: color.clone().multiplyScalar(0.38),
        emissiveMap: m.emissiveMap || null,
        emissiveIntensity: 1,
        flatShading: !!m.flatShading,
      });
      next.normalMap = null;
      next.envMap = null;
      if (m.map) m.map.anisotropy = 1;
      return next;
    });
    o.castShadow = false;
    o.receiveShadow = false;
  });
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
    simplifyKayKitMaterials(model);
    addMinimaCharacterHalo(model, 1.45);
  }
  model.updateMatrixWorld(true);
  return { model, animations: asset.animations || [] };
}

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
  model.rotation.y = Math.PI;
  model.updateMatrixWorld(true);

  const root = new THREE.Group();
  root.name = 'KayKitEnemyRig';
  root.add(model);

  const rig = { root, model, animations };
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
    this.torchPhase = Math.random() * 10;
    this.floorUnderlay = null;
  }

  clear() {
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.torchLights.length = 0;
    this.floorUnderlay = null;
  }

  update(dt, t) {
    if (!this.torchLights.length) return;
    const p = this.game.player?.pos;
    const ranked = p ? this.torchLights
      .map((item, i) => ({ item, i, d: (item.light.position.x - p.x) ** 2 + (item.light.position.z - p.z) ** 2 }))
      .sort((a, b) => a.d - b.d) : [];
    const activeCount = this.game.qualityName === 'alta' ? 6 : 4;
    for (let i = 0; i < this.torchLights.length; i++) {
      const item = this.torchLights[i];
      const rank = ranked.findIndex((r) => r.i === i);
      const active = !p || rank >= 0 && rank < activeCount;
      item.light.visible = active;
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
    const bounds = this.bounds(collision.zones);
    const step = 4;

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
      underlay.position.set(centerX, this.groundY(centerX, centerZ) - 0.18, centerZ);
      underlay.renderOrder = -5;
      this.root.add(underlay);
      this.floorUnderlay = underlay;
    }
    let placed = 0;
    const maxTiles = 700;

    for (let z = Math.floor(bounds.minZ / step) * step; z <= bounds.maxZ && placed < maxTiles; z += step) {
      for (let x = Math.floor(bounds.minX / step) * step; x <= bounds.maxX && placed < maxTiles; x += step) {
        const gx = x + step * 0.5, gz = z + step * 0.5;
        if (!collision.inside(gx, gz, 0)) continue;

        const tile = SkeletonUtils.clone(floor.scene);
        tile.position.set(gx, this.groundY(gx, gz), gz);
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
          this.root.add(p);
        }
        if (placed % 83 === 0) {
          const c = SkeletonUtils.clone(chest.scene);
          c.position.copy(tile.position);
          c.position.y += 0.02;
          c.rotation.y = (placed % 4) * Math.PI * 0.5;
          this.root.add(c);
        }
        if (placed % 107 === 0) {
          const b = SkeletonUtils.clone(banner.scene);
          b.position.copy(tile.position);
          b.position.y += 1.6;
          this.root.add(b);
        }
        if (placed % 61 === 0) {
          const rr = SkeletonUtils.clone(rubble.scene);
          rr.position.copy(tile.position);
          rr.rotation.y = (placed % 4) * Math.PI * 0.5;
          this.root.add(rr);
        }

        const edge =
          !collision.inside(gx + step, gz, 0) ||
          !collision.inside(gx - step, gz, 0) ||
          !collision.inside(gx, gz + step, 0) ||
          !collision.inside(gx, gz - step, 0);
        if (edge && placed % 2 === 0) {
          const w = SkeletonUtils.clone(wall.scene);
          w.position.set(gx, this.groundY(gx, gz), gz);
          w.rotation.y = !collision.inside(gx + step, gz, 0) ? Math.PI * 0.5 : 0;
          this.root.add(w);
          if (placed % 6 === 0) {
            const t = SkeletonUtils.clone(torch.scene);
            t.position.copy(w.position);
            t.position.y += 1.1;
            t.rotation.y = w.rotation.y;
            this.root.add(t);

            if (this.game.qualityName === 'minima' || this.game.qualityName === 'leve') {
              addMinimaTorchGlow(t, 2.5);
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
              this.torchLights.push({ light, base: 8.5, y: light.position.y, phase: this.torchPhase + placed * 0.37 });
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
