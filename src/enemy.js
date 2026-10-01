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
    } else if (type === 'spider' || type === 'spiderling') {
      const spiderScale = type === 'spiderling' ? 0.62 : 1;
      this.model = createSpiderModel(spiderScale);
      this.root = this.model.root;
      this.spider = true;
    } else {
      const isZombie = type === 'zombie';
      this.rig = createHumanoid({
        skin: isZombie ? 0x64755c : 0x7d8a78,
        body: isZombie ? 0x394238 : 0x33302c,
        legs: isZombie ? 0x252a24 : 0x2a2724,
        accent: isZombie ? 0x59684f : 0x4a4540,
        boots: isZombie ? 0x171b18 : 0x1c1a18,
        eyes: isZombie ? POISON_GREEN : 0x8affd8,
        bareArms: true,
        rags: true,
      });
      this.rig.torso.rotation.x = isZombie ? 0.58 : 0.35;
      if (isZombie) {
        this.rig.root.scale.set(1.12, 1.08, 1.12);
        this.rig.armL.rotation.x = -0.65;
        this.rig.armR.rotation.x = -0.85;
        this.rig.head.rotation.x = 0.28;
        // Distinct undead silhouette: hood, exposed jaw and bone-like hands.
        this.rig.head.add(mesh(new THREE.SphereGeometry(0.265, 7, 5), mat(0x263026, { side: THREE.DoubleSide }), 0, 0.02, -0.035));
        this.rig.head.add(mesh(new THREE.BoxGeometry(0.19, 0.08, 0.12), mat(0x3a3d35), 0, -0.08, 0.18));
        this.rig.handL.add(mesh(new THREE.BoxGeometry(0.055, 0.20, 0.055), mat(0xb8b39a), 0, -0.05, 0));
        this.rig.handR.add(mesh(new THREE.BoxGeometry(0.055, 0.20, 0.055), mat(0xb8b39a), 0, -0.05, 0));
        this.rig.armL.scale.set(1.0, 1.15, 1.0);
        this.rig.armR.scale.set(1.0, 1.15, 1.0);
      } else {
        this.rig.handR.add(createWeapon('blade'));
      }
      this.root = this.rig.root;
      this.anim = new HumanoidAnimator(this.rig);
      if (!isZombie) this.root.scale.setScalar(1.05);
    }
    this.mats = uniqueMaterials(this.root);
    this.pos = this.root.position;
    this.pos.set(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
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
    const c = this.type === 'wisp' ? 0xc07aff : (this.spider ? 0xb85b55 : 0x8affd8);
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
      g.collision.move(this.pos, this.knock.x * dt, this.knock.z * dt, this.radius);
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

    if (spd > 0) g.collision.move(this.pos, mvx * spd * dt, mvz * spd * dt, this.radius);
    if (face !== null) this.facing = lerpAngle(this.facing, face, 1 - Math.exp(-10 * dt));
    this.root.rotation.y = this.facing;

    if (this.anim) {
      this.anim.update(dt, spd / def.speed);
      const e = this.state === 'windup' ? 7 : 3;
      for (const eye of this.rig.eyes) eye.material.emissiveIntensity = this.flash > 0.01 ? eye.material.emissiveIntensity : e;
    } else if (this.spider) this.animateSpider(dt, spd / def.speed);
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
    if (this.alive) this.game.ui.removeAnchor(this.bar);
    this.alive = false;
    this.removed = true;
  }
}
