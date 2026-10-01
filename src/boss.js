import * as THREE from 'three';
import { createHumanoid, createWeapon, uniqueMaterials, applyFlash, HumanoidAnimator } from './models.js';

// Morvhal, the Hollow Warden. Attack pattern:
//   cleave — cone in front, telegraphed on the ground
//   slam   — leaps onto the player's position (circle telegraph)
//   ring   — (phase 2) radial burst of slow orbs to weave through
//   summon — at 66% and 33% HP, calls two Hollows
// Enrages below 50%: faster telegraphs, red eyes, second orb wave.

const WHITE = new THREE.Color(0xffffff);
const V = new THREE.Vector3();
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Boss {
  constructor(game, x, z, { name, onDefeated, onSummon }) {
    this.game = game;
    this.name = name;
    this.onDefeated = onDefeated;
    this.onSummon = onSummon;
    this.isBoss = true;
    this.resistances = { physical: 0.12, magic: 0.08 };
    this.rig = createHumanoid({
      skin: 0x3c4248, body: 0x23262c, legs: 0x1a1c20, accent: 0x5a5f68, boots: 0x121316,
      head: 'crown', eyes: 0x9dffe0, shoulder: true, cape: 0x3a1420,
    });
    this.sword = createWeapon('greatsword');
    this.rig.handR.add(this.sword);
    this.root = this.rig.root;
    this.root.scale.setScalar(2.4);
    this.mats = uniqueMaterials(this.root);
    this.anim = new HumanoidAnimator(this.rig);
    this.pos = this.root.position;
    this.home = new THREE.Vector3(x, 0, z);
    game.scene.add(this.root);

    this.aura = new THREE.PointLight(0x9dffe0, 0, 12, 1.5);
    this.aura.position.set(0, 2, 0);
    this.root.add(this.aura);

    this.radius = 1.25;
    this.height = 4.8;
    this.arena = null;
    this.maxHp = 1500;
    this.reset();
  }

  reset() {
    this.pos.copy(this.home);
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'dormant';
    this.stateT = 0;
    this.phase = 1;
    this.pendingEnrage = false;
    this.leapFrom = null;
    this.slamAt = null;
    this.summoned = 0;
    this.roared = false;
    this.struck = false;
    this.waves = 0;
    this.facing = 0;
    this.root.rotation.y = 0;
    this.root.visible = true;
    this.nextAttack = 1.5;
    this.lastAttack = null;
    this.flash = 0;
    this.tele?.forEach((t) => this.game.fx.remove(t));
    this.tele = [];
    this.anim.revive();
    this.anim.kneel = 1;
    this.setEyes(0x9dffe0);
    this.aura.intensity = 0;
  }

  get targetable() { return this.alive && this.state !== 'dormant' && this.state !== 'waking'; }
  get enraged() { return this.phase === 2; }

  setEyes(color) {
    for (const e of this.rig.eyes) { e.material.color.set(color); e.material.emissive.set(color); e.material.userData.baseEmissive.set(color); }
    this.sword.userData.rune.material.emissive.set(color);
    this.sword.userData.rune.material.userData.baseEmissive.set(color);
    this.aura.color.set(color);
  }

  awaken() {
    if (this.state !== 'dormant') return;
    this.state = 'waking';
    this.stateT = 0;
  }

  takeDamage(n, from, crit) {
    if (!this.targetable) return;
    this.hp -= n;
    this.flash = crit ? 1 : 0.6;
    this.game.ui.setBoss(this.hp / this.maxHp, this.enraged);
    if (this.hp <= 0) return this.die();
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) this.pendingEnrage = true;
  }

  enrage() {
    this.phase = 2;
    this.pendingEnrage = false;
    this.pos.y = 0;
    this.leapFrom = null;
    const g = this.game;
    this.setEyes(0xff3b2a);
    g.ui.banner(`${this.name.toUpperCase()} ENFURECE`, 'Cuidado com as ondas de almas', 'boss', 2.2);
    g.rig.shake(0.8);
    g.fx.ring(this.pos, 0xff3b2a, 9, 0.8);
    g.fx.emit(V.copy(this.pos).setY(3), { count: 70, color: 0xff3b2a, speed: 9, life: 0.9, size: 0.6 });
    this.anim.attack('roar', 1.1);
    this.state = 'recover';
    this.stateT = -0.6;
  }

  die() {
    const g = this.game;
    this.alive = false;
    this.hp = 0;
    this.state = 'dead';
    this.stateT = 0;
    this.tele.forEach((t) => g.fx.remove(t));
    this.anim.attack('roar', 1.4);
    g.combat.clearEnemyProjectiles();
    g.hitstop = 0.25;
    g.rig.shake(1.1);
    g.ui.setBoss(0);
    this.onDefeated?.();
  }

  // --------------------------------------------------------------------------

  update(dt) {
    const g = this.game, p = g.player;
    this.stateT += dt;
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 6); applyFlash(this.mats, this.flash, WHITE); }
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    let speed = 0;
    const fast = this.enraged ? 0.75 : 1;

    // Safety net: every combat state must eventually return to chase.
    // If an animation/effect/timing edge case prevents the normal transition,
    // the boss must not become permanently passive.
    const attackState = this.state === 'cleave' || this.state === 'slam' || this.state === 'ring' || this.state === 'summon' || this.state === 'recover';
    if (attackState && this.stateT > 4.5) {
      this.toChase();
    }

    switch (this.state) {
      case 'dormant':
        this.anim.kneel = 1;
        break;
      case 'waking': {
        const k = Math.min(1, this.stateT / 2.2);
        this.anim.kneel = 1 - k * k;
        this.aura.intensity = k * 8;
        this.facing = lerpAngle(this.facing, toPlayer, dt * 2);
        if (this.stateT > 1.2 && !this.roared) {
          this.roared = true;
          this.anim.attack('roar', 1.2);
          g.rig.shake(0.9);
          g.fx.ring(this.pos, 0x9dffe0, 10, 0.9);
          g.fx.emit(V.copy(this.pos).setY(2), { count: 60, color: 0x9dffe0, speed: 8, life: 1, size: 0.5 });
        }
        if (this.stateT > 2.6) { this.state = 'chase'; this.roared = false; this.nextAttack = 0.8; }
        break;
      }
      case 'chase':
        if (this.pendingEnrage) { this.enrage(); break; }
        this.facing = lerpAngle(this.facing, toPlayer, 1 - Math.exp(-5 * dt));
        if (dist > 3.4) speed = this.enraged ? 4.2 : 3.2;
        this.nextAttack -= dt;
        if (this.summoned < 1 && this.hp < this.maxHp * 0.66) this.beginSummon();
        else if (this.summoned < 2 && this.hp < this.maxHp * 0.33) this.beginSummon();
        else if (this.nextAttack <= 0) this.pickAttack(dist);
        break;
      case 'cleave': {
        const wind = 0.9 * fast;
        if (this.stateT < wind * 0.5) this.facing = lerpAngle(this.facing, toPlayer, 1 - Math.exp(-6 * dt));
        if (!this.struck && this.stateT >= wind) {
          this.struck = true;
          const dir = V.set(Math.sin(this.facing), 0, Math.cos(this.facing)).clone();
          g.fx.slash(this.pos, dir, 6, 2.0, 0xff5a3a);
          g.rig.shake(0.5);
          const ang = Math.abs(Math.atan2(Math.sin(toPlayer - this.facing), Math.cos(toPlayer - this.facing)));
          if (dist < 6.2 + p.radius && ang < 1.0) p.takeDamage(g.combat.roll([48, 62], 0).amount, this.pos);
        }
        if (this.stateT > wind + 0.6) this.toChase();
        break;
      }
      case 'slam': {
        const wind = 1.25 * fast, crouch = 0.45 * fast;
        if (this.stateT < crouch) this.anim.kneel = Math.min(0.5, this.stateT / crouch * 0.5);
        else if (this.stateT < wind) {
          if (!this.leapFrom) { this.leapFrom = this.pos.clone(); this.anim.kneel = 0; this.anim.attack('slam', wind - crouch + 0.3); }
          const k = (this.stateT - crouch) / (wind - crouch);
          this.pos.lerpVectors(this.leapFrom, this.slamAt, k);
          this.pos.y = Math.sin(k * Math.PI) * 5;
          this.facing = lerpAngle(this.facing, Math.atan2(this.slamAt.x - this.leapFrom.x, this.slamAt.z - this.leapFrom.z), dt * 8);
        } else if (!this.struck) {
          this.struck = true;
          this.pos.copy(this.slamAt).setY(0);
          g.collision.move(this.pos, 0, 0, this.radius);
          g.rig.shake(1.0);
          g.fx.ring(this.slamAt, 0xff5a3a, 5.5, 0.5);
          g.fx.ring(this.slamAt, 0xffffff, 3.5, 0.3);
          g.fx.emit(V.copy(this.slamAt).setY(0.3), { count: 60, color: 0x9a8a78, speed: 8, up: 2, life: 0.9, size: 0.7, gravity: 6, flat: true, drag: 2 });
          g.fx.emit(V.copy(this.slamAt).setY(0.3), { count: 30, color: this.enraged ? 0xff3b2a : 0x9dffe0, speed: 6, up: 3, life: 0.8, size: 0.5 });
          if (Math.hypot(p.pos.x - this.slamAt.x, p.pos.z - this.slamAt.z) < 3.8 + p.radius) p.takeDamage(g.combat.roll([58, 74], 0).amount, this.slamAt);
        }
        if (this.stateT > wind + 0.9 * fast) { this.leapFrom = null; this.toChase(); }
        break;
      }
      case 'ring': {
        const charge = 0.9 * fast;
        this.facing = lerpAngle(this.facing, toPlayer, dt * 2);
        if (this.stateT < charge && Math.random() < 0.9) {
          const a = Math.random() * Math.PI * 2;
          g.fx.particles.spawn(this.pos.x + Math.cos(a) * 4, 2.5, this.pos.z + Math.sin(a) * 4, -Math.cos(a) * 7, 0, -Math.sin(a) * 7, 0xff5a3a, 0.55, 0.5, 0, 0);
        }
        if (this.waves === 0 && this.stateT >= charge) this.fireRing(0);
        if (this.waves === 1 && this.enraged && this.stateT >= charge + 0.55) this.fireRing(0.5);
        if (this.stateT > charge + 1.3) this.toChase();
        break;
      }
      case 'summon':
        if (!this.struck && this.stateT > 0.8) {
          this.struck = true;
          g.rig.shake(0.7);
          g.fx.ring(this.pos, 0x8affd8, 8, 0.7);
          this.onSummon?.();
        }
        if (this.stateT > 1.8) this.toChase();
        break;
      case 'recover':
        this.facing = lerpAngle(this.facing, toPlayer, dt * 3);
        if (this.stateT > 0.8) this.toChase();
        break;
      case 'dead': {
        const k = Math.min(1, this.stateT / 3);
        this.anim.kneel = Math.min(1, this.stateT * 1.5);
        this.pos.y = -k * k * 1.5;
        this.aura.intensity = 8 * (1 - k);
        if (Math.random() < 0.8) {
          g.fx.particles.spawn(this.pos.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, this.pos.z + (Math.random() - 0.5) * 3,
            0, 2 + Math.random() * 2, 0, Math.random() < 0.5 ? 0x9dffe0 : 0xffe39a, 1.4, 0.6, 0, 0.5);
        }
        if (this.stateT > 3.2 && this.root.visible) {
          this.root.visible = false;
          g.fx.emit(V.copy(this.pos).setY(2), { count: 120, color: 0xffe39a, speed: 10, life: 1.2, size: 0.6, drag: 2 });
          g.fx.beam(this.home, 0xffe39a, 20, 2.5, 1.6);
        }
        break;
      }
    }

    if (speed > 0) {
      g.collision.move(this.pos, Math.sin(this.facing) * speed * dt, Math.cos(this.facing) * speed * dt, this.radius);
      this.constrainToArena();
      if (Math.random() < 0.08) g.fx.emit(V.copy(this.pos).setY(0.2), { count: 3, color: 0x6a5f55, speed: 1.2, life: 0.6, size: 0.6 });
    }
    this.root.rotation.y = this.facing;
    this.anim.update(dt, speed / 3.2);
    if (this.state !== 'dormant' && this.state !== 'dead') this.aura.intensity = 6 + Math.sin(g.time * 6) * 1.5;
  }

  constrainToArena() {
    if (!this.arena) return;
    const dx = this.pos.x - this.arena.x;
    const dz = this.pos.z - this.arena.z;
    const max = Math.max(0, this.arena.r - this.radius);
    const d = Math.hypot(dx, dz);
    if (d > max && d > 0.0001) {
      this.pos.x = this.arena.x + (dx / d) * max;
      this.pos.z = this.arena.z + (dz / d) * max;
    }
  }

  toChase() {
    // Always clean old telegraphs when an attack finishes or is recovered.
    this.tele?.forEach((t) => this.game.fx.remove(t));
    this.tele = [];
    this.leapFrom = null;
    this.struck = false;

    if (this.pendingEnrage) return this.enrage();
    this.state = 'chase';
    this.stateT = 0;
    this.nextAttack = this.enraged ? 0.7 : 1.3;
  }

  begin(state) {
    this.state = state;
    this.stateT = 0;
    this.struck = false;
    this.lastAttack = state;
  }

  pickAttack(dist) {
    const opts = [];
    if (dist < 6) opts.push('cleave', 'cleave', 'cleave');
    opts.push('slam');
    if (dist > 7) opts.push('slam');
    if (this.enraged) opts.push('ring', 'ring');
    let choice = opts[Math.floor(Math.random() * opts.length)];
    if (choice === this.lastAttack && opts.length > 1 && Math.random() < 0.6) choice = opts.find((o) => o !== choice);
    const g = this.game, p = g.player;
    const fast = this.enraged ? 0.75 : 1;
    this.begin(choice);
    if (choice === 'cleave') {
      this.facing = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      this.anim.attack('slash', 0.9 * fast / 0.45);
      this.tele.push(g.fx.telegraphCone(this.pos, this.facing, 6.2, 2.0, 0.9 * fast));
    } else if (choice === 'slam') {
      this.slamAt = p.pos.clone().setY(0);
      if (this.arena) {
        const dx = this.slamAt.x - this.arena.x, dz = this.slamAt.z - this.arena.z;
        const max = Math.max(0, this.arena.r - 3.8);
        const d = Math.hypot(dx, dz);
        if (d > max && d > 0.0001) {
          this.slamAt.x = this.arena.x + (dx / d) * max;
          this.slamAt.z = this.arena.z + (dz / d) * max;
        }
      }
      this.tele.push(g.fx.telegraphCircle(this.slamAt, 3.8, 1.25 * fast));
    } else if (choice === 'ring') {
      this.waves = 0;
      this.anim.attack('cast', 1.1 * fast);
    }
  }

  fireRing(offset) {
    const g = this.game;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = ((i + offset) / n) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      g.combat.spawn({ team: 'enemy', pos: V.copy(this.pos).addScaledVector(dir, 1.5), dir, speed: 7.5, range: 22, damage: [20, 26], damageType: 'magic', visual: 'bigOrb', color: 0xff5a3a, radius: 0.45 });
    }
    g.rig.shake(0.4);
    g.fx.ring(this.pos, 0xff5a3a, 4, 0.4);
    this.waves++;
  }

  beginSummon() {
    this.summoned++;
    this.begin('summon');
    this.anim.attack('roar', 1.4);
    this.game.ui.toast(`${this.name} convoca os Ocos!`);
  }

  dispose() {}
}
