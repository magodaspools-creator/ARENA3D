import * as THREE from 'three';
import { createHumanoid, uniqueMaterials, applyFlash, HumanoidAnimator, mesh, mat } from './models.js';

const WHITE = new THREE.Color(0xffffff);
const V = new THREE.Vector3();

export class MineBoss {
  constructor(game, x, z, { name, onDefeated }) {
    this.game = game;
    this.name = name;
    this.onDefeated = onDefeated;
    this.isBoss = true;
    this.resistances = { physical: 0.18, magic: -0.05 };

    this.rig = createHumanoid({
      skin: 0x3a3430,
      body: 0x17191b,
      legs: 0x111315,
      accent: 0x6e5540,
      boots: 0x0c0d0e,
      head: 'crown',
      eyes: 0xffb84a,
      shoulder: true,
      cape: 0x1c1612,
    });
    this.root = this.rig.root;
    this.root.scale.set(2.8, 2.8, 2.8);

    // Distinct subterranean silhouette: stone mask, crystal shoulders and a
    // heavy mining hammer. This is intentionally not Morvhal's model.
    this.rig.head.add(mesh(
      new THREE.BoxGeometry(0.62, 0.5, 0.52),
      mat(0x292522, { roughness: 1 }),
      0, -0.02, 0.05
    ));
    for (const side of [-1, 1]) {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({ color: 0x5e7d84, emissive: 0x183237, emissiveIntensity: 0.9, roughness: 0.35 })
      );
      crystal.position.set(side * 0.68, 0.9, 0);
      crystal.rotation.z = side * 0.35;
      this.rig.root.add(crystal);
    }
    const hammerMat = new THREE.MeshStandardMaterial({ color: 0x34383b, metalness: 0.65, roughness: 0.45 });
    const hammerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 8), new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 }));
    hammerHandle.rotation.z = Math.PI / 2;
    hammerHandle.position.set(0, -0.15, 0);
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.42), hammerMat);
    hammerHead.position.set(0.82, -0.15, 0);
    this.rig.handR.add(hammerHandle, hammerHead);

    this.anim = new HumanoidAnimator(this.rig);
    this.mats = uniqueMaterials(this.root);
    this.pos = this.root.position;
    this.home = new THREE.Vector3(x, 0, z);
    this.radius = 1.45;
    this.height = 5.8;
    this.maxHp = 2200;
    this.hp = this.maxHp;
    this.alive = true;
    this.removed = false;
    this.state = 'dormant';
    this.stateT = 0;
    this.facing = Math.PI;
    this.phase = 1;
    this.pendingEnrage = false;
    this.nextAttack = 1.5;
    this.attackT = 0;
    this.struck = false;
    this.chargeFrom = null;
    this.chargeTo = null;
    this.tele = [];
    this.aura = new THREE.PointLight(0xffb84a, 0, 14, 1.5);
    this.aura.position.y = 2.5;
    this.root.add(this.aura);
    game.scene.add(this.root);
    this.root.visible = false;
  }

  get targetable() { return this.alive && this.state !== 'dormant' && this.state !== 'waking'; }

  reset() {
    this.tele.forEach((t) => this.game.fx.remove(t));
    this.tele = [];
    this.pos.copy(this.home);
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'dormant';
    this.stateT = 0;
    this.phase = 1;
    this.pendingEnrage = false;
    this.nextAttack = 1.5;
    this.struck = false;
    this.roared = false;
    this.root.visible = false;
    this.anim.revive();
    this.anim.kneel = 1;
    this.aura.intensity = 0;
    this.aura.color.set(0xffb84a);
  }
  get enraged() { return this.phase === 2; }

  awaken() {
    if (this.state !== 'dormant') return;
    this.root.visible = true;
    this.state = 'waking';
    this.stateT = 0;
    this.pos.copy(this.home);
    this.anim.kneel = 1;
    this.game.ui.showBoss(this.name);
  }

  takeDamage(n, from, crit) {
    if (!this.targetable) return;
    this.hp -= n;
    this.flash = crit ? 1 : 0.6;
    this.game.ui.setBoss(this.hp / this.maxHp, this.enraged);
    if (this.hp <= 0) this.die();
    else if (this.phase === 1 && this.hp < this.maxHp * 0.5) this.pendingEnrage = true;
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.stateT = 0;
    this.tele.forEach((t) => this.game.fx.remove(t));
    this.tele = [];
    this.game.combat.clearEnemyProjectiles();
    this.game.hitstop = 0.25;
    this.game.rig.shake(1.0);
    this.game.ui.setBoss(0);
    this.anim.attack('roar', 1.5);
    this.onDefeated?.();
  }

  enrage() {
    this.phase = 2;
    this.pendingEnrage = false;
    this.game.ui.banner('GORVAK DESPERTA', 'A caverna começa a ruir ao redor do Guardião.', 'boss', 2.4);
    this.game.rig.shake(0.9);
    this.game.fx.ring(this.pos, 0xff8a35, 8, 0.7);
    this.aura.color.set(0xff5b2a);
    this.aura.intensity = 20;
    this.anim.attack('roar', 1.2);
    this.state = 'recover';
    this.stateT = -0.5;
  }

  begin(state) {
    this.state = state;
    this.stateT = 0;
    this.struck = false;
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.stateT += dt;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      applyFlash(this.mats, this.flash, WHITE);
    }
    if (!this.alive) {
      if (this.state === 'dead') {
        this.stateT += dt;
        this.anim.kneel = Math.min(1, this.stateT * 1.3);
        this.pos.y = -Math.min(1.5, this.stateT * 0.35);
        if (this.stateT > 3.2) this.root.visible = false;
      }
      return;
    }

    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    const fast = this.enraged ? 0.72 : 1;

    switch (this.state) {
      case 'dormant':
        return;
      case 'waking':
        this.anim.kneel = Math.max(0, 1 - this.stateT / 2.0);
        this.aura.intensity = Math.min(18, this.stateT * 9);
        if (this.stateT > 1.0 && !this.roared) {
          this.roared = true;
          g.rig.shake(0.8);
          g.fx.emit(V.copy(this.pos).setY(2), { count: 55, color: 0xffb84a, speed: 7, up: 3, life: 1, size: 0.55 });
        }
        if (this.stateT > 2.2) {
          this.state = 'chase';
          this.stateT = 0;
          this.nextAttack = 0.8;
          this.anim.kneel = 0;
        }
        break;

      case 'chase':
        this.facing += Math.atan2(Math.sin(toPlayer - this.facing), Math.cos(toPlayer - this.facing)) * Math.min(1, dt * 5);
        if (this.pendingEnrage) { this.enrage(); break; }
        if (dist > 4.2) {
          const speed = this.enraged ? 3.0 : 2.45;
          g.collision.move(this.pos, Math.sin(this.facing) * speed * dt, Math.cos(this.facing) * speed * dt, this.radius);
        }
        this.nextAttack -= dt;
        if (this.nextAttack <= 0) {
          if (dist > 5.5) this.beginCharge();
          else if (Math.random() < 0.55) this.begin('smash');
          else this.begin('quake');
        }
        break;

      case 'charge': {
        const wind = 0.8 * fast;
        if (this.stateT < wind) {
          this.facing += Math.atan2(Math.sin(toPlayer - this.facing), Math.cos(toPlayer - this.facing)) * dt * 8;
        } else if (!this.struck) {
          this.struck = true;
          const travel = Math.min(7.5, Math.max(3.5, dist));
          this.pos.copy(this.chargeFrom);
          g.collision.move(this.pos, Math.sin(this.facing) * travel, Math.cos(this.facing) * travel, this.radius);
          g.fx.emit(V.copy(this.pos).setY(0.3), { count: 45, color: 0x8f7a64, speed: 6, up: 2, life: 0.7, size: 0.65, gravity: 5 });
          g.fx.ring(this.pos, 0xffb84a, 3.8, 0.45);
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 3.0 + p.radius) p.takeDamage(g.combat.roll([42, 58], 0).amount, this.pos);
        }
        if (this.stateT > wind + 0.65) this.toChase();
        break;
      }

      case 'smash':
        if (this.stateT < 0.75) {
          this.anim.attack('slash', 0.9);
          this.facing += Math.atan2(Math.sin(toPlayer - this.facing), Math.cos(toPlayer - this.facing)) * dt * 6;
        } else if (!this.struck) {
          this.struck = true;
          g.rig.shake(0.65);
          g.fx.ring(this.pos, 0xffb84a, 5.2, 0.55);
          g.fx.emit(V.copy(this.pos).setY(0.25), { count: 60, color: 0x887565, speed: 7, up: 2, life: 0.8, size: 0.65, gravity: 6, flat: true, drag: 2 });
          if (dist < 5.2 + p.radius) p.takeDamage(g.combat.roll([38, 52], 0).amount, this.pos);
        }
        if (this.stateT > 1.45) this.toChase();
        break;

      case 'quake':
        if (this.stateT < 1.0 && Math.random() < 0.15) {
          const a = Math.random() * Math.PI * 2;
          g.fx.particles.spawn(this.pos.x + Math.cos(a) * 2, 0.25, this.pos.z + Math.sin(a) * 2,
            Math.cos(a) * 2, 3, Math.sin(a) * 2, 0x9ab8ba, 0.8, 0.4, 0, 0);
        }
        if (!this.struck && this.stateT >= 1.0) {
          this.struck = true;
          g.rig.shake(0.9);
          g.fx.ring(this.pos, this.enraged ? 0xff5b2a : 0x9ab8ba, this.enraged ? 8.5 : 6.5, 0.9);
          if (dist < (this.enraged ? 8.5 : 6.5) + p.radius) p.takeDamage(g.combat.roll([32, 48], 0).amount, this.pos);
          for (let i = 0; i < (this.enraged ? 10 : 7); i++) {
            const a = (i / (this.enraged ? 10 : 7)) * Math.PI * 2;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            g.combat.spawn({ team: 'enemy', pos: V.copy(this.pos).addScaledVector(dir, 1.4), dir, speed: 5.5, range: 13, damage: [15, 21], damageType: 'physical', visual: 'bigOrb', color: 0x9ab8ba, radius: 0.38 });
          }
        }
        if (this.stateT > 1.9) this.toChase();
        break;

      case 'recover':
        if (this.stateT > 0.8) this.toChase();
        break;
    }

    this.root.rotation.y = this.facing;
    this.anim.update(dt, this.state === 'chase' ? 0.8 : 0);
    this.aura.intensity = this.enraged ? 18 : Math.max(8, Math.sin(g.time * 3) * 3 + 10);
  }

  beginCharge() {
    this.begin('charge');
    this.chargeFrom = this.pos.clone();
    this.facing = Math.atan2(this.game.player.pos.x - this.pos.x, this.game.player.pos.z - this.pos.z);
    this.tele.forEach((t) => this.game.fx.remove(t));
    this.tele = [this.game.fx.telegraphCircle(this.game.player.pos, 2.8, 0.8)];
  }

  toChase() {
    this.tele.forEach((t) => this.game.fx.remove(t));
    this.tele = [];
    this.struck = false;
    this.state = 'chase';
    this.stateT = 0;
    this.nextAttack = this.enraged ? 0.55 : 1.0;
  }
}
