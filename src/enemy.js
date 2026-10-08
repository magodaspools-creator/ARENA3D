import * as THREE from 'three';
import { createHumanoid, createWeapon, createWispModel, uniqueMaterials, applyFlash, HumanoidAnimator, mesh, mat } from './models.js';
import { rollLoot } from './loot.js';

// Regular enemies. Two archetypes share one state machine:
//   hollow — undead melee brute, telegraphs an overhead chop
//   wisp   — floating caster, keeps distance and fires slow orbs

const WHITE = new THREE.Color(0xffffff);
const POISON_GREEN = 0x65d66f;
const V = new THREE.Vector3();

const SPIDER_LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x211816, roughness: 1, flatShading: true });
const SPIDER_BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x4a2d27, roughness: 0.92, flatShading: true });
const SPIDER_ABDOMEN_MAT = new THREE.MeshStandardMaterial({ color: 0x2c2020, roughness: 1, flatShading: true });
const SPIDER_EYE_MAT = new THREE.MeshStandardMaterial({ color: 0x6b1518, emissive: 0x3a080b, emissiveIntensity: 1.6, roughness: 0.8 });

// Local CC0 scorpion sprite sheet. The source package includes real walk
// and attack artwork; we keep the PNG inside ARENA3D so GitHub Pages never
// depends on a third-party CDN.
const SCORPION_SPRITE_URL = new URL('../assets/scorpion/scorpion.png', import.meta.url).href;
const SCORPION_SHEET_COLS = 4;
const SCORPION_SHEET_ROWS = 3;
// The source sheet is arranged as one attack pose in cell 0 plus the walk
// poses in cells 4,5,6,8,9,10,11.
const SCORPION_WALK_FRAMES = [4, 5, 6, 8, 9, 10, 11];
const SCORPION_IDLE_FRAME = 4;
const SCORPION_ATTACK_FRAMES = [0, 4, 0, 4, 0];
const scorpionTextureLoader = new THREE.TextureLoader();
let scorpionTexture = null;
let scorpionTexturePromise = null;
const scorpionInstances = new Set();

const ZOMBIE_SPRITE_URL = new URL('../uploads/zombie.jpeg', import.meta.url).href;
const ZOMBIE_SHEET_COLS = 10;
const ZOMBIE_SHEET_ROWS = 4;
const ZOMBIE_IDLE_FRAMES = [0, 1, 2, 3];
const ZOMBIE_WALK_FRAMES = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const ZOMBIE_ATTACK_FRAMES = [20, 21, 22, 23, 24, 25, 26];
const ZOMBIE_HURT_FRAMES = [30, 31, 32, 33];
const ZOMBIE_DEATH_FRAMES = [34, 35, 36, 37, 38, 39];
const zombieTextureLoader = new THREE.TextureLoader();
let zombieTexture = null;
let zombieTexturePromise = null;
const zombieInstances = new Set();

function setZombieFrame(model, frame, flipped = model?.spriteFlipped ?? false) {
  const texture = model?.sprite?.material?.map;
  if (!texture) return;

  const col = frame % ZOMBIE_SHEET_COLS;
  const row = Math.floor(frame / ZOMBIE_SHEET_COLS);
  const tileW = 1 / ZOMBIE_SHEET_COLS;
  const tileH = 1 / ZOMBIE_SHEET_ROWS;

  // Keep the UV region just inside the authored cell so the black grid
  // lines between frames never become part of the sprite.
  const epsX = 2 / 1376;
  const epsY = 2 / 768;
  const u0 = col * tileW + epsX;
  const u1 = (col + 1) * tileW - epsX;
  const v0 = 1 - (row + 1) * tileH + epsY;
  const v1 = 1 - row * tileH - epsY;

  texture.repeat.set(flipped ? -(u1 - u0) : (u1 - u0), v1 - v0);
  texture.offset.set(flipped ? u1 : u0, v0);
  texture.needsUpdate = true;
}

function setZombieScreenDirection(model, mvx, mvz, camera) {
  if (!model?.sprite || !camera) return;
  const lenSq = mvx * mvx + mvz * mvz;
  if (lenSq <= 1e-8) return;

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  right.y = 0;
  if (right.lengthSq() <= 1e-8) return;
  right.normalize();

  const horizontal = mvx * right.x + mvz * right.z;
  // Ignore nearly screen-vertical movement. Without this dead zone, tiny
  // projection changes can rapidly alternate between front/back.
  if (Math.abs(horizontal) < 0.12) return;

  const movingRight = horizontal > 0;
  // The authored zombie poses face screen-right. Mirror when moving left
  // so the face follows the actual travel direction.
  const flipped = !movingRight;
  if (flipped === model.spriteFlipped) return;
  model.spriteFlipped = flipped;
  setZombieFrame(model, model.spriteFrame, model.spriteFlipped);
}

function attachZombieSprite(model) {
  if (!model?.root || !zombieTexture || model.sprite) return;

  const material = new THREE.SpriteMaterial({
    map: zombieTexture.clone(),
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false,
    toneMapped: false,
  });

  // The source is a JPEG with a bright green background. Key only the
  // strongly saturated green; the zombie's darker olive/gray pixels remain.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float zombieGreenExcess = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
      float zombieGreenKey = step(0.12, diffuseColor.g) * step(0.11, zombieGreenExcess);
      if (zombieGreenKey > 0.5) discard;`,
    );
  };

  const sprite = new THREE.Sprite(material);
  sprite.name = 'zombie-sprite';
  sprite.center.set(0.5, 0.02);
  sprite.scale.set(1.65, 2.05, 1);
  sprite.position.y = 0.02;
  model.root.add(sprite);
  model.sprite = sprite;
  model.spriteFlipped = false;
  const spriteMap = material.map;
  spriteMap.wrapS = THREE.RepeatWrapping;
  spriteMap.wrapT = THREE.ClampToEdgeWrapping;
  setZombieFrame(model, ZOMBIE_IDLE_FRAMES[0], false);
}

function loadZombieTexture() {
  if (zombieTexture) return Promise.resolve(zombieTexture);
  if (zombieTexturePromise) return zombieTexturePromise;

  zombieTexturePromise = new Promise((resolve, reject) => {
    zombieTextureLoader.load(
      ZOMBIE_SPRITE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        zombieTexture = texture;
        for (const model of zombieInstances) attachZombieSprite(model);
        console.info('[ARENA] zombie sprite loaded:', ZOMBIE_SPRITE_URL);
        resolve(texture);
      },
      undefined,
      (error) => {
        console.warn('[ARENA] zombie sprite failed to load, using fallback', error);
        reject(error);
      },
    );
  }).catch((error) => {
    zombieTexturePromise = null;
    return null;
  });

  return zombieTexturePromise;
}

function createZombieSpriteModel(scale = 1) {
  const root = new THREE.Group();
  const model = {
    root,
    sprite: null,
    spriteFrame: ZOMBIE_IDLE_FRAMES[0],
    spriteFrameT: 0,
    spriteWalkDistance: 0,
    spriteActionT: 0,
    spriteFlipped: true,
    spriteAction: 'locomotion',
    spriteActionDuration: 0,
  };
  zombieInstances.add(model);
  loadZombieTexture();
  attachZombieSprite(model);
  root.scale.setScalar(scale);
  return model;
}

function createZombieSpriteAnimator(model, def) {
  return {
    update(dt, stride = 0) {
      if (!model?.sprite) return;
      model.spriteActionT += dt;

      let frames = ZOMBIE_IDLE_FRAMES;
      let fps = 2.5;

      if (model.spriteAction === 'death') {
        frames = ZOMBIE_DEATH_FRAMES;
        fps = 7;
      } else if (model.spriteAction === 'attack') {
        frames = ZOMBIE_ATTACK_FRAMES;
        fps = Math.max(7, frames.length / Math.max(0.18, def.windup));
        if (model.spriteActionT >= model.spriteActionDuration) {
          model.spriteAction = 'locomotion';
          model.spriteActionT = 0;
          model.spriteFrameT = 0;
          model.spriteWalkDistance = 0;
        }
      } else if (model.spriteAction === 'hurt') {
        frames = ZOMBIE_HURT_FRAMES;
        fps = 12;
        if (model.spriteActionT >= 0.32) {
          model.spriteAction = 'locomotion';
          model.spriteActionT = 0;
          model.spriteFrameT = 0;
          model.spriteWalkDistance = 0;
        }
      } else if (stride > 0.05) {
        frames = ZOMBIE_WALK_FRAMES;

        // Advance the walk cycle from actual world movement rather than from
        // a generic timer. One complete 9-frame cycle represents about 1.15
        // world units of travel, so the feet stay visually planted.
        const strideLength = 1.15;
        const distance = def.speed * stride * dt;
        model.spriteWalkDistance = (model.spriteWalkDistance + distance) % strideLength;
        const walkPhase = (model.spriteWalkDistance / strideLength) * frames.length;
        model.spriteFrameT = walkPhase;
        fps = 0;

        const frameIndex = Math.floor(walkPhase) % frames.length;
        const frame = frames[frameIndex];
        if (frame !== model.spriteFrame) {
          model.spriteFrame = frame;
          setZombieFrame(model, frame, model.spriteFlipped);
        }
      }

      if (fps > 0) {
        const frameIndex = Math.min(frames.length - 1, Math.floor(model.spriteFrameT)) % frames.length;
        const frame = frames[frameIndex];
        if (frame !== model.spriteFrame) {
          model.spriteFrame = frame;
          setZombieFrame(model, frame, model.spriteFlipped);
        }
        model.spriteFrameT += dt * fps;
      }

      if (model.spriteAction === 'death') {
        model.spriteFrameT = Math.min(model.spriteFrameT, ZOMBIE_DEATH_FRAMES.length - 1);
      }
    },

    hit() {
      if (model.spriteAction === 'death') return;
      model.spriteAction = 'hurt';
      model.spriteActionT = 0;
      model.spriteFrameT = 0;
      model.spriteFrame = ZOMBIE_HURT_FRAMES[0];
      setZombieFrame(model, model.spriteFrame, model.spriteFlipped);
    },

    attack() {
      if (model.spriteAction === 'death') return;
      model.spriteAction = 'attack';
      model.spriteActionT = 0;
      model.spriteActionDuration = Math.max(0.18, def.windup);
      model.spriteFrameT = 0;
      model.spriteFrame = ZOMBIE_ATTACK_FRAMES[0];
      setZombieFrame(model, model.spriteFrame, model.spriteFlipped);
    },

    die() {
      model.spriteAction = 'death';
      model.spriteActionT = 0;
      model.spriteFrameT = 0;
      model.spriteFrame = ZOMBIE_DEATH_FRAMES[0];
      setZombieFrame(model, model.spriteFrame, model.spriteFlipped);
    },
  };
}


function setScorpionFrame(model, frame, flipped = model?.spriteFlipped ?? false) {
  const texture = model?.sprite?.material?.map;
  if (!texture) return;
  const col = frame % SCORPION_SHEET_COLS;
  const row = Math.floor(frame / SCORPION_SHEET_COLS);
  const tileW = 1 / SCORPION_SHEET_COLS;
  const tileH = 1 / SCORPION_SHEET_ROWS;
  const u0 = col * tileW;
  const u1 = u0 + tileW;

  // The atlas is shared by the source image, but each sprite gets its own
  // Texture wrapper so repeat/offset can differ without changing another
  // scorpion. Flipping is confined to this tile: repeat.x=-tileW and
  // offset.x=u1 reverses only the current frame, with no atlas bleed.
  texture.repeat.set(flipped ? -tileW : tileW, tileH);
  texture.offset.set(flipped ? u1 : u0, 1 - (row + 1) * tileH);
  texture.needsUpdate = true;
}

function setScorpionScreenDirection(model, mvx, mvz, camera) {
  if (!model?.sprite || !camera) return;
  const lenSq = mvx * mvx + mvz * mvz;
  if (lenSq <= 1e-8) return;

  // Camera local +X is screen-right. Project it onto XZ so camera pitch does
  // not affect the left/right decision.
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  right.y = 0;
  if (right.lengthSq() <= 1e-8) return;
  right.normalize();

  const movingRight = mvx * right.x + mvz * right.z > 0;
  if (movingRight === model.spriteFlipped) return;
  model.spriteFlipped = movingRight;
  setScorpionFrame(model, model.spriteFrame, model.spriteFlipped);
}

function attachScorpionSprite(model) {
  if (!model?.root || !scorpionTexture || model.sprite) return;
  const material = new THREE.SpriteMaterial({
    map: scorpionTexture.clone(),
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'scorpion-sprite';
  sprite.center.set(0.5, 0.08);
  sprite.scale.set(2.45, 1.38, 1);
  sprite.position.y = 0.69;
  model.root.add(sprite);
  model.sprite = sprite;
  model.spriteFlipped = false;
  const spriteMap = material.map;
  spriteMap.wrapS = THREE.RepeatWrapping;
  spriteMap.wrapT = THREE.ClampToEdgeWrapping;
  setScorpionFrame(model, SCORPION_IDLE_FRAME, false);
}

function loadScorpionTexture() {
  if (scorpionTexture) return Promise.resolve(scorpionTexture);
  if (scorpionTexturePromise) return scorpionTexturePromise;

  scorpionTexturePromise = new Promise((resolve, reject) => {
    scorpionTextureLoader.load(
      SCORPION_SPRITE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        scorpionTexture = texture;
        for (const model of scorpionInstances) attachScorpionSprite(model);
        console.info('[ARENA] scorpion sprite loaded:', SCORPION_SPRITE_URL);
        resolve(texture);
      },
      (xhr) => {
        if (xhr?.total) console.info('[ARENA] scorpion sprite loading:', Math.round((xhr.loaded / xhr.total) * 100) + '%');
      },
      (error) => {
        console.warn('[ARENA] scorpion sprite failed to load, using fallback', error);
        reject(error);
      },
    );
  }).catch((error) => {
    scorpionTexturePromise = null;
    return null;
  });
  return scorpionTexturePromise;
}

function createScorpionModel(scale = 1) {
  const root = new THREE.Group();
  const model = {
    root,
    sprite: null,
    spriteFrame: SCORPION_IDLE_FRAME,
    spriteFrameT: 0,
    spriteAttackT: 0,
    spriteFlipped: false,
  };
  scorpionInstances.add(model);
  loadScorpionTexture();
  attachScorpionSprite(model);
  root.scale.setScalar(scale);
  return model;
}

function createSpiderModel(scale = 1) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), SPIDER_BODY_MAT);
  body.position.y = 0.58;
  body.scale.set(1.15, 0.72, 1.25);
  root.add(body);

  const abdomen = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), SPIDER_ABDOMEN_MAT);
  abdomen.position.set(0, 0.66, -0.38);
  abdomen.scale.set(1.0, 0.82, 1.25);
  root.add(abdomen);

  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), SPIDER_BODY_MAT);
  head.position.set(0, 0.55, 0.55);
  head.scale.set(1.05, 0.82, 0.9);
  root.add(head);

  const eyes = [];
  for (const [x, y, z, s] of [
    [-0.18,0.66,0.80,0.07],[0.18,0.66,0.80,0.07],
    [-0.28,0.57,0.74,0.045],[0.28,0.57,0.74,0.045],
  ]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), SPIDER_EYE_MAT);
    eye.position.set(x,y,z);
    root.add(eye);
    eyes.push(eye);
  }

  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const row = i % 4;
    const z = 0.48 - row * 0.36;
    const leg = new THREE.Group();
    leg.position.set(side * 0.26, 0.52, z);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.82, 5), SPIDER_LEG_MAT);
    upper.position.set(side * 0.30, 0.02, side * 0.05);
    upper.rotation.z = side * 0.95;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.72, 5), SPIDER_LEG_MAT);
    lower.position.set(side * 0.70, -0.16, side * 0.08);
    lower.rotation.z = -side * 0.72;
    leg.add(upper, lower);
    root.add(leg);
    legs.push(leg);
  }

  root.scale.setScalar(scale);
  return { root, body, abdomen, legs, eyes };
}

export const ENEMY_TYPES = {
  zombie: { name: 'Zumbi', hp: 105, speed: 2.7, resistances: { physical: 0.05, magic: 0 }, rewards: { xp: 42, gold: 14 }, loot: [
    { itemId: 'iron_scrap', chance: 0.55, min: 1, max: 2 },
    { itemId: 'moon_herb', chance: 0.14 },
    { itemId: 'red_potion', chance: 0.05 },
  ], aggro: 8.5, range: 1.65, damage: [11, 15], windup: 0.65, cooldown: 1.8, radius: 0.5, height: 2.0, knock: 4, poison: { damage: [3, 5], duration: 5, tick: 1 } },
  hollow: { name: 'Oco', hp: 90, speed: 3.3, resistances: { physical: 0.08, magic: 0 }, rewards: { xp: 35, gold: 12 }, loot: [
    { itemId: 'iron_scrap', chance: 0.65, min: 1, max: 2 },
    { itemId: 'worn_cap', chance: 0.08 },
    { itemId: 'worn_leggings', chance: 0.06 },
    { itemId: 'worn_boots', chance: 0.07 },
    { itemId: 'crude_buckler', chance: 0.025 },
    { itemId: 'red_potion', chance: 0.05 },
  ], aggro: 8.5, range: 1.7, damage: [12, 16], windup: 0.5, cooldown: 1.6, radius: 0.5, height: 2.0, knock: 5 },
  wisp: { name: 'Fogo-Fátuo', hp: 55, speed: 2.8, resistances: { physical: 0.18, magic: 0.04 }, rewards: { xp: 28, gold: 16 }, loot: [
    { itemId: 'wisp_essence', chance: 0.65, min: 1, max: 2 },
    { itemId: 'simple_amulet', chance: 0.055 },
    { itemId: 'worn_boots', chance: 0.04 },
    { itemId: 'moon_herb', chance: 0.2 },
  ], aggro: 11, range: 9, keep: 6.5, damage: [10, 13], windup: 0.75, cooldown: 2.3, radius: 0.45, height: 2.1, ranged: true, knock: 7 },
  scorpion: { name: 'Escorpião das Dunas', hp: 78, speed: 3.35, resistances: { physical: 0.04, magic: 0 }, rewards: { xp: 40, gold: 17 }, loot: [
    { itemId: 'moon_herb', chance: 0.20, min: 1, max: 1 },
    { itemId: 'iron_scrap', chance: 0.42, min: 1, max: 2 },
    { itemId: 'red_potion', chance: 0.04 },
  ], aggro: 9.5, range: 1.5, damage: [10, 14], windup: 0.48, cooldown: 1.55, radius: 0.5, height: 1.15, knock: 3, poison: { damage: [2, 4], duration: 5, tick: 1 } },
  spider: { name: 'Aranha da Mina', hp: 72, speed: 3.65, resistances: { physical: 0.03, magic: 0 }, rewards: { xp: 38, gold: 15 }, loot: [
    { itemId: 'moon_herb', chance: 0.20, min: 1, max: 1 },
    { itemId: 'iron_scrap', chance: 0.38, min: 1, max: 2 },
    { itemId: 'red_potion', chance: 0.035 },
  ], aggro: 9.5, range: 1.45, damage: [9, 13], windup: 0.42, cooldown: 1.45, radius: 0.48, height: 1.2, knock: 3, poison: { damage: [2, 4], duration: 4, tick: 1 } },
  spiderling: { name: 'Filhote de Aranha', hp: 38, speed: 4.5, resistances: { physical: 0 }, rewards: { xp: 18, gold: 6 }, loot: [
    { itemId: 'iron_scrap', chance: 0.20, min: 1, max: 1 },
  ], aggro: 7.5, range: 1.05, damage: [5, 8], windup: 0.28, cooldown: 1.1, radius: 0.28, height: 0.75, knock: 2, poison: { damage: [1, 2], duration: 3, tick: 1 } },
};

const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Enemy {
  constructor(game, type, x, z, opts = {}) {
    this.game = game;
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.rewards = { ...this.def.rewards };
    this.resistances = { physical: 0, magic: 0, ...(this.def.resistances || {}) };
    this.lootTable = [...(this.def.loot ?? [])];
    this.group = opts.group ?? null;
    if (type === 'wisp') {
      this.model = createWispModel();
      this.root = this.model.root;
    } else if (type === 'scorpion') {
      this.model = createScorpionModel();
      this.root = this.model.root;
      this.scorpion = true;
    } else if (type === 'spider' || type === 'spiderling') {
      const spiderScale = type === 'spiderling' ? 0.62 : 1;
      this.model = createSpiderModel(spiderScale);
      this.root = this.model.root;
      this.spider = true;
    } else if (type === 'zombie') {
      this.model = createZombieSpriteModel();
      this.root = this.model.root;
      this.anim = createZombieSpriteAnimator(this.model, this.def);
      this.zombieSprite = true;
    } else {
      this.rig = createHumanoid({
        skin: 0x7d8a78,
        body: 0x33302c,
        legs: 0x2a2724,
        accent: 0x4a4540,
        boots: 0x1c1a18,
        eyes: 0x8affd8,
        bareArms: true,
        rags: true,
      });
      this.rig.torso.rotation.x = 0.35;
      this.rig.handR.add(createWeapon('blade'));
      this.root = this.rig.root;
      this.anim = new HumanoidAnimator(this.rig);
      this.root.scale.setScalar(1.05);
    }
    this.mats = uniqueMaterials(this.root);
    this.pos = this.root.position;
    // Area 2 can have several meters of procedural dune height. Enemies must
    // spawn on the same terrain surface as the player instead of starting at
    // world Y=0 and becoming buried inside a dune.
    const groundY = Number.isFinite(game.collision.groundHeight?.(x, z))
      ? game.collision.groundHeight(x, z)
      : 0;
    this.pos.set(x, groundY, z);
    this.home = new THREE.Vector3(x, groundY, z);
    this.facing = Math.random() * Math.PI * 2;
    game.scene.add(this.root);

    this.radius = this.def.radius;
    this.height = this.def.height;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.stateT = 0;
    this.cd = Math.random();
    this.knock = new THREE.Vector3();
    this.flash = 0;
    this.t = Math.random() * 10;
    this.wanderT = Math.random() * 3;
    this.wanderTo = this.home.clone();
    this.alive = true;
    this.removed = false;
    this.bar = game.ui.createBar();
    this.barT = 0;
  }

  get targetable() { return this.alive; }

  isInProtectionZone(pos = this.pos) {
    const zones = this.game.protectionZones;
    if (!zones?.length) return false;
    return zones.some((zone) => Math.hypot(pos.x - zone.x, pos.z - zone.z) <= zone.radius);
  }

  aggro() {
    // Protection zones are safe from enemy aggression. This is gameplay logic,
    // not a collision layer, so the player can still walk freely through them.
    if (this.isInProtectionZone(this.game.player?.pos)) {
      this.state = 'return';
      return;
    }
    if (!this.alive || this.state === 'chase' || this.state === 'windup' || this.state === 'recover') return;
    this.state = 'chase';
    this.game.ui.floatText(V.copy(this.pos).setY(this.height + 0.4), '!', 'alert', 0.8);
    for (const e of this.game.enemies) {
      if (e !== this && !e.isBoss && e.state === 'idle' && e.pos.distanceTo(this.pos) < 7) e.aggro();
    }
  }

  takeDamage(n, from, crit) {
    if (!this.alive) return;
    this.hp -= n;
    this.flash = 1;
    this.barT = 4;
    V.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    this.knock.addScaledVector(V, this.def.knock * (crit ? 1.5 : 1));
    this.anim?.hit();
    if (this.hp <= 0) this.die();
    else this.aggro();
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.stateT = 0;
    this.anim?.die();
    this.game.ui.removeAnchor(this.bar);
    const fx = this.game.fx;
    const c = this.type === 'wisp' ? 0xc07aff : (this.spider ? 0xb85b55 : (this.scorpion ? 0xd58a3f : 0x8affd8));
    fx.emit(V.copy(this.pos).setY(1.2), { count: 40, color: c, speed: 5, up: 1, life: 0.9, size: 0.4, drag: 2 });
    fx.emit(V.copy(this.pos).setY(1.0), { count: 16, color: c, speed: 0.6, up: 3, life: 1.6, size: 0.5, drag: 0.5 });
    this.game.onEnemyKilled(this, rollLoot(this.lootTable));
  }

  strike() {
    const g = this.game, p = g.player;
    // Fail-safe: an attack can never land while the player is inside a PZ.
    if (this.isInProtectionZone(p?.pos)) {
      this.state = 'return';
      this.stateT = 0;
      return;
    }
    if (this.def.ranged) {
      const dir = V.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize().clone();
      g.combat.spawn({ team: 'enemy', pos: V.copy(this.pos).addScaledVector(dir, 0.6), dir, speed: 9, range: 14, damage: this.def.damage, damageType: 'magic', visual: 'orb', color: 0xc07aff, radius: 0.35 });
    } else {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - this.facing), Math.cos(Math.atan2(dx, dz) - this.facing)));
      const fdir = V.set(Math.sin(this.facing), 0, Math.cos(this.facing)).clone();
      g.fx.slash(this.pos, fdir, this.def.range + 0.6, 1.6, 0x8affd8);
      if (dist < this.def.range + p.radius + 0.35 && ang < 1.0) {
        p.takeDamage(g.combat.roll(this.def.damage, 0).amount, this.pos);
        if (this.def.poison) p.applyPoison(this.def.poison, this.pos);
      }
    }
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 6); applyFlash(this.mats, this.flash, WHITE); }

    if (this.state === 'dead') {
      this.stateT += dt;
      if (this.anim) {
        this.anim.update(dt, 0);
        if (this.stateT > 1.4) this.pos.y = -(this.stateT - 1.4) * 0.9;
      } else {
        const k = Math.max(0, 1 - this.stateT * 2.5);
        this.root.scale.setScalar(k + 0.001);
      }
      if (this.stateT > 2.6) { g.scene.remove(this.root); this.removed = true; }
      return;
    }

    this.cd -= dt;
    if (this.knock.lengthSq() > 0.01) {
      g.collision.move(this.pos, this.knock.x * dt, this.knock.z * dt, this.radius, 0.9);
      this.knock.multiplyScalar(Math.exp(-10 * dt));
    }

    const playerOK = p && !p.dead && g.state === 'play' && !this.isInProtectionZone(p.pos);
    const dx = p ? p.pos.x - this.pos.x : 0, dz = p ? p.pos.z - this.pos.z : 0;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    let mvx = 0, mvz = 0, spd = 0, face = null;
    const def = this.def;

    // If an enemy somehow crosses the visual boundary, immediately send it back.
    // This prevents mobs from standing inside the safe plaza and attacking from it.
    if (this.isInProtectionZone(this.pos)) this.state = 'return';

    switch (this.state) {
      case 'idle': {
        if (playerOK && dist < def.aggro) { this.aggro(); break; }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 3 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
          this.wanderTo.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        const wx = this.wanderTo.x - this.pos.x, wz = this.wanderTo.z - this.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 0.3) { mvx = wx / wd; mvz = wz / wd; spd = def.speed * 0.3; face = Math.atan2(wx, wz); }
        break;
      }
      case 'return': {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * dt * 0.5);
        if (hd < 0.5) { this.state = 'idle'; break; }
        mvx = hx / hd; mvz = hz / hd; spd = def.speed * 1.2; face = Math.atan2(hx, hz);
        if (playerOK && dist < def.aggro * 0.6) this.aggro();
        break;
      }
      case 'chase': {
        if (!playerOK || this.pos.distanceTo(this.home) > 22) { this.state = 'return'; break; }
        face = toPlayer;
        if (def.ranged) {
          if (dist > def.range * 0.9) { mvx = dx / dist; mvz = dz / dist; spd = def.speed; }
          else if (dist < def.keep - 1.5) { mvx = -dx / dist; mvz = -dz / dist; spd = def.speed * 0.7; }
          else { mvx = -dz / dist; mvz = dx / dist; spd = def.speed * 0.35 * Math.sin(this.t * 0.7); }
          if (dist <= def.range && this.cd <= 0) this.startWindup();
        } else {
          if (dist > def.range * 0.8) { mvx = dx / dist; mvz = dz / dist; spd = def.speed; }
          if (dist <= def.range + 0.3 && this.cd <= 0) this.startWindup();
        }
        break;
      }
      case 'windup':
        this.stateT += dt;
        if (this.stateT < def.windup * 0.6) face = toPlayer;
        if (!playerOK) { this.state = 'return'; break; }
        if (this.stateT >= def.windup) { this.strike(); this.state = 'recover'; this.stateT = 0; this.cd = def.cooldown; }
        break;
      case 'recover':
        this.stateT += dt;
        if (this.stateT > 0.4) this.state = 'chase';
        break;
    }

    if (spd > 0) g.collision.move(this.pos, mvx * spd * dt, mvz * spd * dt, this.radius, 0.9);
    if (face !== null) this.facing = lerpAngle(this.facing, face, 1 - Math.exp(-10 * dt));
    // THREE.Sprite already billboards toward the camera. A scorpion must not
    // inherit the enemy's world-facing rotation, or its screen-space sprite
    // direction becomes coupled to camera/world yaw.
    if (!this.scorpion && !this.zombieSprite) this.root.rotation.y = this.facing;
    if (this.scorpion) setScorpionScreenDirection(this.model, mvx, mvz, g.camera);
    if (this.zombieSprite) setZombieScreenDirection(this.model, mvx, mvz, g.camera);
    if (this.scorpion && typeof g.collision.groundHeight === 'function') {
      const terrainY = g.collision.groundHeight(this.pos.x, this.pos.z);
      if (Number.isFinite(terrainY)) this.pos.y = terrainY;
    }

    if (this.anim) {
      this.anim.update(dt, spd / def.speed);
      const e = this.state === 'windup' ? 7 : 3;
      if (this.rig?.eyes) for (const eye of this.rig.eyes) eye.material.emissiveIntensity = this.flash > 0.01 ? eye.material.emissiveIntensity : e;
    } else if (this.spider) this.animateSpider(dt, spd / def.speed);
    else if (this.scorpion) this.animateScorpion(dt, spd);
    else this.animateWisp(dt);

    this.barT -= dt;
    const showBar = this.barT > 0 || this.state === 'chase' || this.state === 'windup';
    if (showBar) { g.ui.showAnchor(this.bar, V.copy(this.pos).setY(this.height + 0.25)); g.ui.setBar(this.bar, this.hp / this.maxHp); }
    else g.ui.hideAnchor(this.bar);
  }

  startWindup() {
    this.state = 'windup';
    this.stateT = 0;
    if (this.anim) this.anim.attack('slash', this.def.windup / 0.5);
    if (this.scorpion) {
      this.model.spriteAttackT = 0;
      this.model.spriteFrameT = 0;
      this.model.spriteFrame = SCORPION_ATTACK_FRAMES[0];
      setScorpionFrame(this.model, this.model.spriteFrame, this.model.spriteFlipped);
    }
  }

  animateSpider(dt, stride = 0) {
    if (!this.model?.legs) return;
    const moving = stride > 0.05 && this.state !== 'windup';
    const phase = this.t * (moving ? 11 : 3);
    this.model.body.position.y = 0.58 + Math.sin(this.t * 4.5) * (moving ? 0.025 : 0.012);
    this.model.abdomen.rotation.y = Math.sin(this.t * 1.7) * 0.04;
    this.model.legs.forEach((leg, i) => {
      const side = i < 4 ? -1 : 1;
      const row = i % 4;
      const swing = moving ? Math.sin(phase + row * 1.45 + side * 0.7) * 0.16 : Math.sin(phase + row) * 0.025;
      leg.rotation.y = swing * side;
      leg.rotation.x = Math.cos(phase + row * 1.2) * (moving ? 0.08 : 0.02);
    });
  }

  animateScorpion(dt, speed = 0) {
    const m = this.model;
    if (!m?.sprite) return;

    const moving = speed > 0.05 && this.state !== 'windup';

    if (this.state === 'windup') {
      m.spriteAttackT += dt;
      const attackDuration = Math.max(0.18, this.def.windup);
      const p = THREE.MathUtils.clamp(m.spriteAttackT / attackDuration, 0, 0.999);
      const index = Math.min(SCORPION_ATTACK_FRAMES.length - 1, Math.floor(p * SCORPION_ATTACK_FRAMES.length));
      const frame = SCORPION_ATTACK_FRAMES[index];
      if (frame !== m.spriteFrame) {
        m.spriteFrame = frame;
        setScorpionFrame(m, frame);
      }
      m.sprite.scale.x = 2.52 + Math.sin(p * Math.PI) * 0.12;
      m.sprite.scale.y = 1.42 + Math.sin(p * Math.PI) * 0.06;
      m.sprite.position.y = 0.70 + Math.sin(p * Math.PI) * 0.035;
      return;
    }

    const frames = moving ? SCORPION_WALK_FRAMES : [SCORPION_IDLE_FRAME];

    // One complete authored walk cycle is calibrated to about 1.2 world
    // units. Recalibrate this value if a foot visibly slides: increase it if
    // the legs move too fast for the ground distance, decrease it if they
    // move too slowly. The accumulator uses real dt, so animation speed is
    // independent of the browser/render FPS.
    const strideLength = 1.2;
    const frameRate = moving
      ? THREE.MathUtils.clamp(speed * SCORPION_WALK_FRAMES.length / strideLength, 4, 24)
      : 2.2;
    m.spriteFrameT += dt * frameRate;
    const frameIndex = Math.floor(m.spriteFrameT) % frames.length;
    const frame = frames[frameIndex];
    if (frame !== m.spriteFrame) {
      m.spriteFrame = frame;
      setScorpionFrame(m, frame);
    }

    m.sprite.scale.x = moving ? 2.45 : 2.38;
    m.sprite.scale.y = moving ? 1.38 : 1.34;
    m.sprite.position.y = 0.69 + Math.sin(this.t * (moving ? 10 : 3)) * (moving ? 0.018 : 0.008);
  }

  animateWisp(dt) {
    const m = this.model;
    const bob = Math.sin(this.t * 2.2) * 0.15;
    const charge = this.state === 'windup' ? this.stateT / this.def.windup : 0;
    m.core.position.y = m.shell.position.y = 1.4 + bob;
    m.tail.position.y = 0.8 + bob;
    m.core.scale.setScalar(1 + charge * 0.7);
    m.shell.rotation.y += dt * 1.5;
    m.shell.rotation.x += dt * 0.7;
    m.shards.forEach((s, i) => {
      const a = this.t * (2 + charge * 6) + (i * Math.PI * 2) / 3;
      s.position.set(Math.cos(a) * 0.65, 1.4 + bob + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.65);
      s.rotation.y += dt * 4;
    });
    if (charge > 0 && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      this.game.fx.particles.spawn(this.pos.x + Math.cos(a) * 1.2, 1.4 + bob, this.pos.z + Math.sin(a) * 1.2,
        -Math.cos(a) * 2.2, 0, -Math.sin(a) * 2.2, 0xd9a0ff, 0.5, 0.3, 0, 0);
    }
    if (Math.random() < 0.25) this.game.fx.particles.spawn(this.pos.x, 0.9 + bob, this.pos.z, (Math.random() - 0.5) * 0.3, -0.4, (Math.random() - 0.5) * 0.3, 0x8a4ac0, 1, 0.35, 0, 0);
  }

  dispose() {
    this.game.scene.remove(this.root);
    if (this.scorpion) {
      scorpionInstances.delete(this.model);
    }
    if (this.zombieSprite) {
      zombieInstances.delete(this.model);
    }
    if (this.alive) this.game.ui.removeAnchor(this.bar);
    this.alive = false;
    this.removed = true;
  }
}
