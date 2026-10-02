import * as THREE from 'three';
import { createHumanoid, createWeapon, uniqueMaterials, applyFlash, HumanoidAnimator } from './models.js';

const WHITE = new THREE.Color(0xffffff);
const V = new THREE.Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function distancePointToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / len2)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export class SunGodBoss {
  constructor(game, x, z, { name = 'Azhur, Deus Sol', onDefeated } = {}) {
    this.game = game;
    this.name = name;
    this.onDefeated = onDefeated;
    this.isBoss = true;
    this.variant = 'sun';
    this.resistances = { physical: 0.08, magic: 0.0, ice: -0.30, water: -0.30 };

    this.rig = createHumanoid({
      skin: 0xd8a96a, body: 0xc47a2f, legs: 0x8a4a24, accent: 0xffd45c,
      boots: 0x4a2b18, head: 'crown', eyes: 0xffd45c, shoulder: true, cape: 0x6b2c18,
    });
    this.staff = createWeapon('staff', { orb: 0xffd45c });
    this.rig.handR.add(this.staff);
    this.root = this.rig.root;
    this.root.scale.setScalar(2.15);
    this.mats = uniqueMaterials(this.root);
    this.anim = new HumanoidAnimator(this.rig);
    this.pos = this.root.position;
    this.home = new THREE.Vector3(x, 0, z);
    game.scene.add(this.root);

    this.aura = new THREE.PointLight(0xffd45c, 0, 14, 1.5);
    this.aura.position.set(0, 2.5, 0);
    this.root.add(this.aura);

    this.radius = 1.15;
    this.height = 4.6;
    this.maxHp = 1800;
    this.arena = null;
    this.orbitRadius = 5.2;
    this.orbitAngle = 0;
    this.orbitSpeed = 0.48;
    this.tele = [];
    this.projectiles = [];
    this.burnZones = [];
    this.flash = 0;
    this.reset();
  }

  reset() {
    this.pos.copy(this.home);
    this.pos.y = 1.2;
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'dormant';
    this.stateT = 0;
    this.phase = 1;
    this.pendingAttack = null;
    this.struck = false;
    this.lastAttack = null;
    this.orbitAngle = 0;
    this.nextDecision = 0.8;
    // Watchdog: guarantees the boss cannot remain in an inactive combat state.
    this.combatStallT = 0;
    this.attackCooldowns = { dawn: 1.8, orb: 3.2, rain: 5.0 };
    this.phase1BoundaryShown = false;
    this.wakeFx = false;
    this.root.rotation.y = 0;
    this.root.visible = true;
    this.anim.revive();
    this.anim.kneel = 0;
    this.setEyes(0xffd45c);
    this.aura.intensity = 0;
    this.clearTelegraphs();
    this.clearHazards();
  }

  get targetable() {
    return this.alive && this.state !== 'dormant' && this.state !== 'waking' && this.state !== 'dead';
  }

  setEyes(color) {
    for (const e of this.rig.eyes) {
      e.material.color.set(color);
      e.material.emissive.set(color);
      e.material.userData.baseEmissive?.set(color);
    }
    this.staff.userData.tip?.material?.emissive?.set(color);
    this.aura.color.set(color);
  }

  awaken() {
    if (this.state !== 'dormant') return;
    this.state = 'waking';
    this.stateT = 0;
    this.pos.y = 0.2;
    this.game.ui.showBoss(this.name);
  }

  takeDamage(n, from, crit) {
    if (!this.targetable) return;
    this.hp -= n;
    this.flash = crit ? 1 : 0.6;
    this.game.ui.setBoss(this.hp / this.maxHp, false);
    if (this.hp <= 0) return this.die();
    if (this.hp <= this.maxHp * 0.65 && !this.phase1BoundaryShown) {
      this.phase1BoundaryShown = true;
      this.game.ui.toast('Azhur enfraquece, mas o Sol ainda não foi eclipsado.');
    }
  }

  die() {
    const g = this.game;
    this.alive = false;
    this.hp = 0;
    this.state = 'dead';
    this.stateT = 0;
    this.clearTelegraphs();
    this.clearHazards();
    g.combat.clearEnemyProjectiles();
    g.hitstop = 0.25;
    g.rig.shake(1.0);
    g.ui.setBoss(0);
    this.onDefeated?.();
  }

  clearTelegraphs() {
    for (const t of this.tele) this.game.fx.remove(t);
    this.tele.length = 0;
  }

  clearHazards() {
    for (const h of this.burnZones) if (h.fx) this.game.fx.remove(h.fx);
    this.burnZones.length = 0;
    this.projectiles.length = 0;
  }

  begin(state) {
    this.clearTelegraphs();
    this.state = state;
    this.stateT = 0;
    this.struck = false;
    this.lastAttack = state;
    this.combatStallT = 0;
  }

  finishAttack() {
    this.clearTelegraphs();
    this.state = 'recover';
    this.stateT = 0;
    this.struck = false;
    this.nextDecision = 0.45;
  }

  chooseAttack() {
    const ready = [];
    if (this.attackCooldowns.dawn <= 0) ready.push('dawn', 'dawn');
    if (this.attackCooldowns.orb <= 0) ready.push('orb', 'orb');
    if (this.attackCooldowns.rain <= 0) ready.push('rain');
    if (!ready.length) return null;
    let pick = ready[Math.floor(Math.random() * ready.length)];
    if (pick === this.lastAttack && ready.length > 1) {
      const alternatives = ready.filter((a) => a !== pick);
      pick = alternatives[Math.floor(Math.random() * alternatives.length)];
    }
    return pick;
  }

  startAttack(name) {
    this.begin(name);
    if (name === 'dawn') {
      this.attackCooldowns.dawn = 3.8;
      const dx = this.game.player.pos.x - this.pos.x;
      const dz = this.game.player.pos.z - this.pos.z;
      this.attackYaw = Math.atan2(dx, dz);
      this.dashFrom = this.pos.clone();
      const dir = new THREE.Vector3(Math.sin(this.attackYaw), 0, Math.cos(this.attackYaw));
      this.dashTo = this.dashFrom.clone().addScaledVector(dir, 8.5);
      if (this.arena) {
        const dx2 = this.dashTo.x - this.arena.x, dz2 = this.dashTo.z - this.arena.z;
        const max = this.arena.r - this.radius;
        const d = Math.hypot(dx2, dz2);
        if (d > max) {
          this.dashTo.x = this.arena.x + dx2 / d * max;
          this.dashTo.z = this.arena.z + dz2 / d * max;
        }
      }
      this.tele.push(this.game.fx.telegraphLine(this.dashFrom, this.dashTo, 0.8, 0xffd21f));
      this.anim.attack('cast', 0.9);
    } else if (name === 'orb') {
      this.attackCooldowns.orb = 5.0;
      this.anim.attack('cast', 0.9);
    } else if (name === 'rain') {
      this.attackCooldowns.rain = 7.0;
      this.anim.attack('cast', 1.0);
      this.rainTargets = [];
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2.0 + Math.random() * 5.0;
        let x = this.game.player.pos.x + Math.cos(a) * r;
        let z = this.game.player.pos.z + Math.sin(a) * r;
        if (this.arena) {
          const dx = x - this.arena.x, dz = z - this.arena.z;
          const d = Math.hypot(dx, dz);
          const max = this.arena.r - 1.1;
          if (d > max) { x = this.arena.x + dx / d * max; z = this.arena.z + dz / d * max; }
        }
        this.rainTargets.push(new THREE.Vector3(x, 0, z));
        this.tele.push(this.game.fx.telegraphCircle(new THREE.Vector3(x, 0, z), 1.25, 1.0, 0xff2a1a));
      }
    }
  }

  fireDawnRay() {
    const g = this.game;
    const dir = new THREE.Vector3(Math.sin(this.attackYaw), 0, Math.cos(this.attackYaw));
    g.fx.emit(V.copy(this.pos).setY(1.2), { count: 40, color: 0xffd45c, speed: 8, up: 2, life: 0.6, size: 0.5 });
    if (distancePointToSegment(g.player.pos.x, g.player.pos.z, this.dashFrom.x, this.dashFrom.z, this.dashTo.x, this.dashTo.z) < g.player.radius + 0.9) {
      g.player.takeDamage(g.combat.roll([72, 94], 0).amount, this.pos);
    }
    return dir;
  }

  fireSolarOrb() {
    const g = this.game;
    const dir = V.set(g.player.pos.x - this.pos.x, 0, g.player.pos.z - this.pos.z).normalize();
    const p = g.combat.spawn({
      team: 'enemy',
      pos: V.copy(this.pos).setY(1.6),
      dir, speed: 5.2, range: 22, damage: [42, 58], damageType: 'magic',
      visual: 'fire', color: 0xffa51f, radius: 0.5, splash: 2.2,
      homing: true, homingStrength: 2.8, homingLife: 3.0,
      onExplode: (proj) => this.createBurnZone(proj.pos),
    });
    this.projectiles.push(p);
    g.fx.emit(V.copy(this.pos).setY(2), { count: 25, color: 0xffd45c, speed: 4, life: 0.45, size: 0.4 });
  }

  createBurnZone(pos) {
    const g = this.game;
    const center = new THREE.Vector3(pos.x, 0, pos.z);
    const fx = g.fx.telegraphCircle(center, 2.2, 3.0, 0xff6a16);
    this.burnZones.push({ pos: center, radius: 2.2, life: 3.0, tick: 0.2, fx });
    g.fx.emit(V.copy(center).setY(0.25), { count: 20, color: 0xff7a1a, speed: 2.5, up: 1.2, life: 0.8, size: 0.45 });
  }

  resolveLightning() {
    const g = this.game;
    for (const zone of this.rainTargets || []) {
      g.fx.beam(V.copy(zone).setY(0), 0xffd45c, 6, 0.22, 0.22);
      g.fx.emit(V.copy(zone).setY(1), { count: 20, color: 0xffe9a0, speed: 6, life: 0.45, size: 0.45 });
      if (Math.hypot(g.player.pos.x - zone.x, g.player.pos.z - zone.z) <= 1.25 + g.player.radius) {
        g.player.takeDamage(g.combat.roll([38, 52], 0).amount, zone);
      }
    }
    this.rainTargets = [];
  }

  updateHazards(dt) {
    const g = this.game;
    for (const h of this.burnZones) {
      h.life -= dt;
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        if (!g.player.dead && Math.hypot(g.player.pos.x - h.pos.x, g.player.pos.z - h.pos.z) <= h.radius + g.player.radius) {
          g.player.takeDamage(g.combat.roll([12, 18], 0).amount, h.pos);
        }
      }
      if (Math.random() < 0.22) {
        g.fx.particles.spawn(h.pos.x + (Math.random() - 0.5) * h.radius, 0.25,
          h.pos.z + (Math.random() - 0.5) * h.radius, (Math.random() - 0.5) * 0.6,
          0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6, 0xff7a1a, 0.7, 0.3, 0, 2);
      }
    }
    this.burnZones = this.burnZones.filter((h) => {
      if (h.life > 0) return true;
      if (h.fx) g.fx.remove(h.fx);
      return false;
    });
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.stateT += dt;
    if (this.state !== 'dormant' && this.state !== 'dead') this.combatStallT += dt;
    if (this.combatStallT > 6) {
      this.combatStallT = 0;
      this.clearTelegraphs();
      this.clearHazards();
      this.state = 'idle';
      this.stateT = 0;
      this.nextDecision = 0;
      this.attackCooldowns.dawn = 0;
      this.attackCooldowns.orb = 0;
      this.attackCooldowns.rain = 0;
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      applyFlash(this.mats, this.flash, WHITE);
    }

    if (!this.alive) {
      if (this.state === 'dead') {
        const k = Math.min(1, this.stateT / 2.6);
        this.pos.y = 1.2 + 2.0 * k;
        this.root.rotation.y += dt * 1.8;
        this.aura.intensity = 10 * (1 - k);
        if (this.stateT > 2.6 && this.root.visible) {
          this.root.visible = false;
          g.fx.emit(V.copy(this.pos).setY(2), { count: 100, color: 0xffd45c, speed: 10, life: 1.0, size: 0.6, drag: 2 });
        }
      }
      return;
    }

    this.attackCooldowns.dawn -= dt;
    this.attackCooldowns.orb -= dt;
    this.attackCooldowns.rain -= dt;
    this.updateHazards(dt);

    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const toPlayer = Math.atan2(dx, dz);

    switch (this.state) {
      case 'idle':
        this.pos.y = 1.2 + Math.sin(g.time * 2.2) * 0.18;
        this.facing = lerpAngle(this.facing || 0, toPlayer, 1 - Math.exp(-5 * dt));
        this.orbitAngle += this.orbitSpeed * dt;
        {
          const playerDist = Math.hypot(dx, dz);
          const desiredR = Math.max(3.8, Math.min(this.orbitRadius, playerDist * 0.72));
          const targetX = this.home.x + Math.cos(this.orbitAngle) * desiredR;
          const targetZ = this.home.z + Math.sin(this.orbitAngle) * desiredR;
          const move = Math.min(1, dt * 1.5);
          this.pos.x += (targetX - this.pos.x) * move;
          this.pos.z += (targetZ - this.pos.z) * move;
          this.constrainToArena();
        }
        this.nextDecision -= dt;
        if (this.nextDecision <= 0) {
          const attack = this.chooseAttack();
          if (attack) this.startAttack(attack);
          else this.nextDecision = 0.25;
        }
        break;

      case 'waking': {
        const k = clamp01(this.stateT / 1.8);
        this.pos.y = 0.2 + k * 1.0;
        this.aura.intensity = k * 9;
        this.facing = lerpAngle(this.facing || 0, toPlayer, 1 - Math.exp(-5 * dt));
        if (this.stateT > 0.65 && !this.wakeFx) {
          this.wakeFx = true;
          g.fx.ring(this.pos, 0xffd45c, 7, 0.8);
          g.fx.emit(V.copy(this.pos).setY(1.5), { count: 70, color: 0xffd45c, speed: 8, up: 2, life: 1, size: 0.5 });
          g.rig.shake(0.6);
        }
        if (this.stateT > 1.8) { this.state = 'recover'; this.stateT = 0; this.nextDecision = 0.5; }
        break;
      }

      case 'recover':
        this.pos.y = 1.2;
        this.facing = lerpAngle(this.facing || 0, toPlayer, 1 - Math.exp(-6 * dt));
        if (this.stateT > 0.45) { this.state = 'idle'; this.stateT = 0; }
        break;

      case 'dawn':
        this.pos.y = 1.2;
        this.facing = this.attackYaw;
        if (this.stateT >= 0.8 && !this.struck) {
          this.struck = true;
          this.fireDawnRay();
          this.pos.copy(this.dashTo).setY(1.2);
          g.fx.ring(this.pos, 0xffd45c, 3.0, 0.35);
          g.fx.emit(V.copy(this.pos).setY(1.2), { count: 50, color: 0xffd45c, speed: 9, up: 2, life: 0.7, size: 0.45 });
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 2.0 + p.radius) {
            p.takeDamage(g.combat.roll([30, 42], 0).amount, this.pos);
          }
        }
        if (this.stateT > 1.2) this.finishAttack();
        break;

      case 'orb':
        this.pos.y = 1.2;
        this.facing = lerpAngle(this.facing || 0, toPlayer, 1 - Math.exp(-5 * dt));
        if (this.stateT >= 0.75 && !this.struck) { this.struck = true; this.fireSolarOrb(); }
        if (this.stateT > 1.15) this.finishAttack();
        break;

      case 'rain':
        this.pos.y = 1.2;
        this.facing = lerpAngle(this.facing || 0, toPlayer, 1 - Math.exp(-5 * dt));
        if (this.stateT >= 1.0 && !this.struck) { this.struck = true; this.resolveLightning(); }
        if (this.stateT > 1.25) this.finishAttack();
        break;
    }

    this.root.rotation.y = this.facing || 0;
    this.anim.update(dt, 0);
    if (this.state !== 'idle' && this.state !== 'dead') this.aura.intensity = 7 + Math.sin(g.time * 7) * 1.5;
    else this.aura.intensity = 5.5 + Math.sin(g.time * 4);
  }

  constrainToArena() {
    if (!this.arena) return;
    const dx = this.pos.x - this.arena.x, dz = this.pos.z - this.arena.z;
    const max = Math.max(0, this.arena.r - this.radius);
    const d = Math.hypot(dx, dz);
    if (d > max && d > 0.0001) {
      this.pos.x = this.arena.x + dx / d * max;
      this.pos.z = this.arena.z + dz / d * max;
    }
  }

  dispose() {
    this.clearTelegraphs();
    this.clearHazards();
  }
}
