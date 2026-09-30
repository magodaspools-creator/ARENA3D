import * as THREE from 'three';
import { createHumanoid, createWeapon, createWispModel, uniqueMaterials, applyFlash, HumanoidAnimator } from './models.js';
import { rollLoot } from './loot.js';

// Regular enemies. Two archetypes share one state machine:
//   hollow — undead melee brute, telegraphs an overhead chop
//   wisp   — floating caster, keeps distance and fires slow orbs

const WHITE = new THREE.Color(0xffffff);
const POISON_GREEN = 0x65d66f;
const V = new THREE.Vector3();

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

  aggro() {
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
    const c = this.type === 'wisp' ? 0xc07aff : 0x8affd8;
    fx.emit(V.copy(this.pos).setY(1.2), { count: 40, color: c, speed: 5, up: 1, life: 0.9, size: 0.4, drag: 2 });
    fx.emit(V.copy(this.pos).setY(1.0), { count: 16, color: c, speed: 0.6, up: 3, life: 1.6, size: 0.5, drag: 0.5 });
    this.game.onEnemyKilled(this, rollLoot(this.lootTable));
  }

  strike() {
    const g = this.game, p = g.player;
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

    const playerOK = p && !p.dead && g.state === 'play';
    const dx = p ? p.pos.x - this.pos.x : 0, dz = p ? p.pos.z - this.pos.z : 0;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    let mvx = 0, mvz = 0, spd = 0, face = null;
    const def = this.def;

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
    } else this.animateWisp(dt);

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
