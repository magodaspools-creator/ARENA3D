import * as THREE from 'three';
import { uniqueMaterials, applyFlash, mesh, mat, glow } from './models.js';

const WHITE = new THREE.Color(0xffffff);
const V = new THREE.Vector3();

function segmentBetween(a, b, material, radius = 0.11) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.08, d.length(), 7),
    material
  );
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class MineBoss {
  constructor(game, x, z, { name, onDefeated }) {
    this.game = game;
    this.name = name || 'A Aranha da Mina';
    this.onDefeated = onDefeated;
    this.isBoss = true;
    this.resistances = { physical: 0.10, magic: 0.02 };

    // Boss 2 is deliberately a completely different silhouette from Morvhal:
    // a colossal cave spider built from procedural primitives.
    this.root = new THREE.Group();
    this.root.scale.setScalar(1.65);
    this.pos = this.root.position;
    this.home = new THREE.Vector3(x, 0, z);
    this.radius = 1.55;
    this.height = 3.6;

    const bodyMat = mat(0x171217, { rough: 0.72 });
    const abdomenMat = mat(0x241824, { rough: 0.62 });
    const armorMat = mat(0x39263b, { metal: 0.18, rough: 0.55 });
    const legMat = mat(0x100d12, { rough: 0.82 });
    const venomMat = glow(0x7cff5b, 0.9);
    const eyeMat = glow(0xff3448, 1.0);

    this.body = new THREE.Group();
    this.root.add(this.body);

    const abdomen = mesh(new THREE.SphereGeometry(1.0, 12, 8), abdomenMat, 0, 1.05, -0.72);
    abdomen.scale.set(1.22, 0.82, 1.35);
    this.body.add(abdomen);

    const thorax = mesh(new THREE.SphereGeometry(0.72, 12, 8), bodyMat, 0, 0.72, 0.25);
    thorax.scale.set(1.05, 0.72, 1.05);
    this.body.add(thorax);

    const head = new THREE.Group();
    head.position.set(0, 0.64, 0.92);
    this.body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.55, 10, 7), armorMat));
    head.add(mesh(new THREE.SphereGeometry(0.30, 8, 6), bodyMat, 0, 0.05, 0.42));

    for (const y of [0.08, 0.20]) {
      for (const s of [-1, 1]) {
        head.add(mesh(new THREE.SphereGeometry(0.065, 7, 5), eyeMat, s * 0.19, y, 0.48));
      }
    }

    // Fangs.
    for (const s of [-1, 1]) {
      const fang = mesh(new THREE.ConeGeometry(0.09, 0.42, 7), venomMat, s * 0.20, -0.22, 0.48);
      fang.rotation.x = Math.PI;
      head.add(fang);
    }

    // Eight articulated-looking legs. Each pair is a pivot group so the
    // walking cycle can alternate without depending on the humanoid animator.
    this.legs = [];
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const pair = Math.floor(i / 2);
      const z = 0.56 - pair * 0.42;
      const pivot = new THREE.Group();
      pivot.position.set(side * (0.42 + pair * 0.035), 0.48, z);
      this.body.add(pivot);

      const upper = new THREE.Group();
      pivot.add(upper);
      upper.rotation.z = side * 0.18;

      const upperMesh = mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.85, 7), legMat, 0, -0.38, side * 0.05);
      upperMesh.rotation.z = side * 0.82;
      upper.add(upperMesh);

      const knee = new THREE.Group();
      knee.position.set(side * 0.52, -0.68, 0);
      upper.add(knee);

      const lowerMesh = mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.95, 7), legMat, 0, -0.43, 0);
      lowerMesh.rotation.z = -side * 0.72;
      knee.add(lowerMesh);

      this.legs.push({ pivot, upper, knee, side, phase: i % 2 ? Math.PI : 0 });
    }

    // Small venom glands on the rear make the projectile attacks readable.
    for (const s of [-1, 1]) {
      this.body.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), venomMat, s * 0.28, 1.18, -1.58));
    }

    this.mats = uniqueMaterials(this.root);
    this.maxHp = 2400;
    this.hp = this.maxHp;
    this.alive = true;
    this.removed = false;
    this.state = 'dormant';
    this.stateT = 0;
    this.facing = Math.PI;
    this.phase = 1;
    this.nextAttack = 1.2;
    this.attackT = 0;
    this.struck = false;
    this.combatStallT = 0;
    this.ambushTarget = null;
    this.pounceTarget = null;
    this.pounceStart = null;
    this.pounceDistance = 0;
    this.pounceHit = false;
    this.orbitDir = 1;
    this.orbitT = 0;
    this.tele = [];
    this.webs = [];
    this.eggs = [];
    this.webCooldown = 0;
    this.eggCooldown = 0;
    this.ambushCooldown = 0;
    this.pounceCooldown = 0;
    this.root.visible = false;

    this.game.scene.add(this.root);
  }

  get targetable() {
    return this.alive && this.state !== 'dormant' && this.state !== 'waking' && this.state !== 'ambushHidden';
  }

  get enraged() {
    return this.phase >= 2;
  }

  reset() {
    this.clearHazards();
    this.pos.copy(this.home);
    this.hp = this.maxHp;
    this.alive = true;
    this.removed = false;
    this.state = 'dormant';
    this.stateT = 0;
    this.phase = 1;
    this.nextAttack = 1.2;
    this.struck = false;
    this.combatStallT = 0;
    this.webCooldown = 0;
    this.eggCooldown = 0;
    this.ambushCooldown = 0;
    this.pounceCooldown = 0;
    this.orbitDir = 1;
    this.orbitT = 0;
    this.root.visible = false;
    this.root.rotation.set(0, Math.PI, 0);
    this.root.scale.setScalar(1.65);
  }

  awaken() {
    if (this.state !== 'dormant') return;
    this.root.visible = true;
    this.state = 'waking';
    this.stateT = 0;
    this.pos.copy(this.home);
    this.game.ui.showBoss(this.name);
    this.game.ui.banner('A ARANHA DA MINA DESPERTA', 'A caverna se enche de teias. Não fique parado.', 'boss', 2.4);
  }

  takeDamage(n, from, crit) {
    if (!this.targetable) return;
    this.hp -= n;
    this.flash = crit ? 1 : 0.65;
    this.game.ui.setBoss(this.hp / this.maxHp, this.enraged);

    if (this.hp <= 0) {
      this.die();
      return;
    }

    if (this.phase === 1 && this.hp <= this.maxHp * 0.70) this.enterPhase(2);
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.35) this.enterPhase(3);
  }

  enterPhase(phase) {
    this.phase = phase;
    this.clearTelegraphs();

    const title = phase === 2 ? 'A ARANHA ENFURECE' : 'A ARANHA ENTRA EM FRENESI';
    const text = phase === 2
      ? 'Ela começa a subir pelas paredes e espalha ovos pela caverna.'
      : 'As teias cobrem a arena. A criatura ficou muito mais agressiva.';

    this.game.ui.banner(title, text, 'boss', 2.2);
    this.game.rig.shake(phase === 3 ? 1.0 : 0.7);
    this.game.fx.ring(this.pos, phase === 3 ? 0xff3450 : 0x8b5cff, phase === 3 ? 7 : 5, 0.65);
    this.game.fx.emit(V.copy(this.pos).setY(1), {
      count: phase === 3 ? 70 : 45,
      color: phase === 3 ? 0xff3450 : 0x8b5cff,
      speed: 6,
      up: 3,
      life: 0.9,
      size: 0.5,
    });

    this.state = 'recover';
    this.stateT = -0.35;
    this.nextAttack = phase === 3 ? 0.35 : 0.65;
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.stateT = 0;
    this.clearHazards();
    this.game.combat.clearEnemyProjectiles();
    this.game.hitstop = 0.25;
    this.game.rig.shake(1.1);
    this.game.ui.setBoss(0);
    this.game.ui.banner('A ARANHA CAIU', 'O silêncio volta à mina.', 'boss', 1.8);
    this.game.fx.emit(V.copy(this.pos).setY(1), {
      count: 90,
      color: 0x8b5cff,
      speed: 8,
      up: 4,
      life: 1.2,
      size: 0.65,
      gravity: 4,
    });
    this.onDefeated?.();
  }

  begin(state) {
    this.state = state;
    this.stateT = 0;
    this.struck = false;
    this.combatStallT = 0;
    this.clearTelegraphs();
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.stateT += dt;

    if (this.state !== 'dormant' && this.state !== 'dead') this.combatStallT += dt;
    if (this.combatStallT > 7) {
      // Defensive recovery only: if a telegraph/attack ever stalls, return
      // to the chase state instead of leaving the boss harmless.
      this.combatStallT = 0;
      this.clearTelegraphs();
      this.struck = false;
      this.state = 'chase';
      this.stateT = 0;
      this.nextAttack = 0.35;
      this.root.visible = true;
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      applyFlash(this.mats, this.flash, WHITE);
    }

    this.updateHazards(dt);

    if (!this.alive) {
      if (this.state === 'dead') {
        this.stateT += dt;
        this.body.position.y = Math.min(0.35, this.stateT * 0.08);
        this.body.rotation.z += dt * 0.45;
        this.root.scale.multiplyScalar(Math.max(0, 1 - dt * 0.035));
        if (this.stateT > 3.0) this.root.visible = false;
      }
      return;
    }

    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);

    switch (this.state) {
      case 'dormant':
        return;

      case 'waking':
        this.body.position.y = Math.sin(this.stateT * 5) * 0.06;
        if (this.stateT > 1.0) {
          g.rig.shake(0.6);
          g.fx.emit(V.copy(this.pos).setY(0.6), {
            count: 35, color: 0x8b5cff, speed: 5, up: 2.5, life: 0.8, size: 0.45,
          });
        }
        if (this.stateT > 2.2) {
          this.state = 'chase';
          this.stateT = 0;
          this.nextAttack = 0.6;
        }
        break;

      case 'chase': {
        this.orbitT += dt;
        if (this.orbitT > 1.8) {
          this.orbitT = 0;
          this.orbitDir *= -1;
        }

        // The spider should never just park beside the player. It approaches,
        // circles and briefly backs off, making its movement readable but
        // unpredictable instead of behaving like a stationary turret.
        const preferred = this.phase === 1 ? 3.2 : this.phase === 2 ? 3.6 : 4.0;
        let moveAngle = toPlayer;
        if (dist < preferred + 1.1) {
          moveAngle = toPlayer + this.orbitDir * (Math.PI * 0.48);
          if (dist < 2.25) moveAngle = toPlayer + Math.PI;
        }

        this.facing += Math.atan2(
          Math.sin(moveAngle - this.facing),
          Math.cos(moveAngle - this.facing)
        ) * Math.min(1, dt * 9);

        const speed = this.phase === 3 ? 4.25 : this.phase === 2 ? 3.75 : 3.15;
        const moveScale = dist < 2.0 ? 0.92 : 1;
        g.collision.move(
          this.pos,
          Math.sin(this.facing) * speed * moveScale * dt,
          Math.cos(this.facing) * speed * moveScale * dt,
          this.radius
        );

        this.nextAttack -= dt;
        if (this.nextAttack <= 0) this.chooseAttack(dist);
        break;
      }

      case 'web':
        this.attackWeb(dt);
        break;

      case 'ambush':
        this.attackAmbush(dt);
        break;

      case 'pounce':
        this.attackPounce(dt);
        break;

      case 'egg':
        this.attackEggs(dt);
        break;

      case 'poison':
        this.attackPoison(dt);
        break;

      case 'recover':
        if (this.stateT > 0.75) {
          this.state = 'chase';
          this.stateT = 0;
          this.nextAttack = this.phase === 3 ? 0.35 : 0.7;
        }
        break;
    }

    this.animate(dt, g.time);
  }

  chooseAttack(dist) {
    const phase = this.phase;
    const choices = [];

    if (this.webCooldown <= 0) choices.push('web');
    if (this.pounceCooldown <= 0) choices.push('pounce');
    if (phase >= 2 && this.ambushCooldown <= 0) choices.push('ambush');
    if (phase >= 2 && this.eggCooldown <= 0) choices.push('egg');
    if (phase >= 2) choices.push('poison');

    // Phase 1 is intentionally active: the spider can already pressure the
    // player with poison and a pounce instead of waiting for later phases.
    if (dist < 4.2) choices.push('poison');
    if (dist < 5.5 && this.pounceCooldown <= 0) choices.push('pounce');

    const state = choices[Math.floor(Math.random() * choices.length)] || 'web';
    this.begin(state);

    if (state === 'web') this.webCooldown = this.phase === 3 ? 4.5 : this.phase === 2 ? 5.5 : 6.0;
    if (state === 'ambush') this.ambushCooldown = this.phase === 3 ? 4.5 : 7.0;
    if (state === 'egg') this.eggCooldown = this.phase === 3 ? 6.0 : 8.5;
    if (state === 'pounce') this.pounceCooldown = this.phase === 3 ? 2.8 : 4.2;
  }

  attackWeb(dt) {
    const g = this.game;
    if (this.stateT < 0.55) {
      if (!this.tele.length) {
        const dx = g.player.pos.x - this.pos.x;
        const dz = g.player.pos.z - this.pos.z;
        const dist = Math.max(2.4, Math.hypot(dx, dz));
        const angle = Math.atan2(dx, dz);
        const dirX = Math.sin(angle);
        const dirZ = Math.cos(angle);
        const count = this.phase === 3 ? 4 : 3;

        // Instead of dropping random circular patches around the player, the
        // spider now throws a readable web line from itself toward the player.
        // Standing still is dangerous because one of the strands deliberately
        // crosses the player's current position.
        this._pendingWebPositions = [];
        for (let i = 0; i < count; i++) {
          const t = (i + 1) / count;
          const side = i === count - 1 ? 0 : (i % 2 ? -0.72 : 0.72);
          const px = this.pos.x + dirX * dist * t + Math.cos(angle) * side;
          const pz = this.pos.z + dirZ * dist * t - Math.sin(angle) * side;
          const pos = new THREE.Vector3(px, 0, pz);
          this.tele.push(g.fx.telegraphCircle(pos, i === count - 1 ? 1.15 : 0.9, 0.55, 0xd7a6ff));
          this._pendingWebPositions.push({ pos, angle, length: i === count - 1 ? 2.4 : 2.7, width: 1.0 });
        }
      }
    } else if (!this.struck) {
      this.struck = true;
      const pending = this._pendingWebPositions || [];
      for (const web of pending) this.createWeb(web.pos, web.angle, web.length, web.width);
      this._pendingWebPositions = [];
      g.fx.emit(V.copy(this.pos).setY(0.7), {
        count: 30, color: 0xd7a6ff, speed: 4, up: 1.5, life: 0.7, size: 0.35,
      });
    }

    if (this.stateT > 1.0) {
      this.state = 'recover';
      this.stateT = 0;
    }
  }

  createWeb(pos, angle, length = 2.6, width = 1.0) {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.075, pos.z);
    group.rotation.y = angle;

    const m = new THREE.MeshBasicMaterial({
      color: 0xd7a6ff,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // A flattened, elongated web: two crossing strands and a few horizontal
    // threads. It reads as a patch of real webbing rather than a magic circle.
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2),
      m
    );
    group.add(sheet);

    for (const offset of [-0.42, 0, 0.42]) {
      const thread = new THREE.Mesh(
        new THREE.PlaneGeometry(0.028, length * 0.92).rotateX(-Math.PI / 2),
        m
      );
      thread.position.x = offset;
      group.add(thread);
    }

    for (const offset of [-0.35, 0.35]) {
      const thread = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.92, 0.025).rotateX(-Math.PI / 2),
        m
      );
      thread.position.z = offset * (length / 2.2);
      group.add(thread);
    }

    this.game.scene.add(group);
    this.webs.push({
      group,
      pos: pos.clone(),
      angle,
      length,
      width,
      life: this.phase === 3 ? 9 : 7,
      damageT: 0
    });
  }

  attackAmbush(dt) {
    const g = this.game;

    if (this.stateT < 0.65) {
      if (!this.ambushTarget) {
        this.ambushTarget = g.player.pos.clone();
        this.tele.push(g.fx.telegraphCircle(this.ambushTarget, 2.5, 1.25, 0xff3450));
      }
      this.root.visible = false;
      return;
    }

    if (!this.struck) {
      this.struck = true;
      this.root.visible = true;
      this.pos.set(this.ambushTarget.x, 0, this.ambushTarget.z);
      this.facing = Math.atan2(
        g.player.pos.x - this.pos.x,
        g.player.pos.z - this.pos.z
      );

      g.rig.shake(0.9);
      g.fx.ring(this.pos, 0xff3450, 5.5, 0.5);
      g.fx.emit(V.copy(this.pos).setY(0.8), {
        count: 65, color: 0x5d334e, speed: 8, up: 3.5, life: 0.9, size: 0.55, gravity: 5,
      });

      if (Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z) < 3.3 + g.player.radius) {
        g.player.takeDamage(g.combat.roll([48, 66], 0).amount, this.pos);
      }
      this.ambushTarget = null;
    }

    if (this.stateT > 1.45) this.toChase();
  }

  attackPounce(dt) {
    const g = this.game;

    if (this.stateT < 0.42) {
      if (!this.pounceTarget) {
        this.pounceTarget = g.player.pos.clone();
        this.pounceStart = this.pos.clone();
        this.pounceDistance = Math.min(
          this.pounceStart.distanceTo(this.pounceTarget),
          5.8
        );
        this.tele.push(g.fx.telegraphCircle(this.pounceTarget, 2.15, 0.42, 0xffa43b));
        this.facing = Math.atan2(
          this.pounceTarget.x - this.pos.x,
          this.pounceTarget.z - this.pos.z
        );
      }

      // Crouch before jumping. The actual leap is animated over several
      // frames so it never snaps several meters in one update.
      this.body.position.y = 0.18 + Math.sin(this.stateT * 7) * 0.04;
      return;
    }

    if (!this.struck) {
      this.struck = true;
      this.pounceStart = this.pounceStart || this.pos.clone();
      this.pounceTarget = this.pounceTarget || g.player.pos.clone();
    }

    // Smoothly interpolate the leap instead of teleporting with one large
    // collision.move(). Collision is checked along the path in small steps.
    const leapT = Math.min(1, (this.stateT - 0.42) / 0.32);
    const eased = leapT < 0.5
      ? 2 * leapT * leapT
      : 1 - Math.pow(-2 * leapT + 2, 2) / 2;
    const targetX = THREE.MathUtils.lerp(this.pounceStart.x, this.pounceTarget.x, eased);
    const targetZ = THREE.MathUtils.lerp(this.pounceStart.z, this.pounceTarget.z, eased);
    const moveX = targetX - this.pos.x;
    const moveZ = targetZ - this.pos.z;

    if (Math.abs(moveX) + Math.abs(moveZ) > 0.001) {
      const maxStep = 0.42;
      const stepLen = Math.hypot(moveX, moveZ);
      const scale = Math.min(1, maxStep / stepLen);
      g.collision.move(
        this.pos,
        moveX * scale,
        moveZ * scale,
        this.radius
      );
    }

    // Lift the spider during the leap and settle it back down.
    this.body.position.y = Math.sin(Math.min(1, leapT) * Math.PI) * 0.85;

    if (leapT >= 1 && !this.pounceHit) {
      this.pounceHit = true;
      g.rig.shake(0.55);
      g.fx.ring(this.pos, 0xffa43b, 4.3, 0.42);
      g.fx.emit(V.copy(this.pos).setY(0.65), {
        count: 32,
        color: 0xffa43b,
        speed: 6,
        up: 2.4,
        life: 0.65,
        size: 0.38,
      });

      if (Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z) < 2.45 + g.player.radius) {
        g.player.takeDamage(g.combat.roll(
          this.phase === 3 ? [42, 58] : this.phase === 2 ? [34, 48] : [28, 40],
          0
        ).amount, this.pos);
      }

      this.pounceTarget = null;
    }

    if (this.stateT > 0.92) this.toChase();
  }

  attackEggs(dt) {
    const g = this.game;

    if (this.stateT < 0.7) {
      if (!this.struck) {
        this.struck = true;
        const count = this.phase === 3 ? 4 : 3;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + 0.3;
          const r = 2.2 + Math.random() * 2.2;
          this.createEgg(new THREE.Vector3(
            this.pos.x + Math.sin(a) * r,
            0.16,
            this.pos.z + Math.cos(a) * r
          ));
        }
        g.fx.emit(V.copy(this.pos).setY(0.6), {
          count: 35, color: 0xffd7ee, speed: 3, up: 2, life: 0.8, size: 0.45,
        });
      }
    }

    if (this.stateT > 1.15) this.toChase();
  }

  createEgg(pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const shell = mat(0xe9d9e3, { rough: 0.62 });
    const vein = glow(0xb74b7d, 0.75);
    group.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), shell, 0, 0.28, 0));
    group.add(mesh(new THREE.SphereGeometry(0.13, 7, 6), vein, 0, 0.30, 0.28));
    this.game.scene.add(group);
    this.eggs.push({ group, pos: pos.clone(), life: this.phase === 3 ? 4.2 : 5.0, pulse: 0 });
  }

  hatchEgg(egg) {
    const g = this.game;
    const p = egg.pos;
    this.game.scene.remove(egg.group);
    egg.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });

    g.fx.emit(V.copy(p).setY(0.3), {
      count: 25, color: 0xff5d9c, speed: 4, up: 2, life: 0.65, size: 0.3,
    });

    // The hatchlings are represented as a short venom burst instead of a new
    // enemy entity. This keeps the boss encounter self-contained and cheap.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      g.combat.spawn({
        team: 'enemy',
        pos: V.copy(p).addScaledVector(dir, 0.45),
        dir,
        speed: 4.5,
        range: 8,
        damage: [12, 18],
        damageType: 'poison',
        visual: 'bigOrb',
        color: 0xff5d9c,
        radius: 0.25,
      });
    }
  }

  attackPoison(dt) {
    const g = this.game;

    if (this.stateT < 0.65) {
      const targetAngle = Math.atan2(
        g.player.pos.x - this.pos.x,
        g.player.pos.z - this.pos.z
      );
      this.facing += Math.atan2(
        Math.sin(targetAngle - this.facing),
        Math.cos(targetAngle - this.facing)
      ) * dt * 9;

      // Venom is a close-range spider attack now: small droplets expelled
      // from the fangs in a short cone, not long green energy bolts.
      if (!this.struck) {
        this.struck = true;
        const count = this.phase === 3 ? 3 : 2;
        const origin = new THREE.Vector3(
          this.pos.x + Math.sin(this.facing) * 1.0,
          0.85,
          this.pos.z + Math.cos(this.facing) * 1.0
        );

        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 0.28;
          const dir = new THREE.Vector3(
            Math.sin(this.facing + spread),
            0,
            Math.cos(this.facing + spread)
          );

          g.combat.spawn({
            team: 'enemy',
            pos: origin,
            dir,
            speed: 5.2,
            range: this.phase === 3 ? 7 : 5.5,
            damage: this.phase === 3 ? [16, 23] : [11, 17],
            damageType: 'poison',
            visual: 'orb',
            color: 0x79a84b,
            radius: 0.20,
          });
        }

        g.fx.emit(V.copy(origin), {
          count: this.phase === 3 ? 14 : 9,
          color: 0x79a84b,
          speed: 1.8,
          up: 0.6,
          life: 0.35,
          size: 0.18,
        });
      }
    }

    if (this.stateT > 1.15) this.toChase();
  }

  updateHazards(dt) {
    this.webCooldown = Math.max(0, this.webCooldown - dt);
    this.eggCooldown = Math.max(0, this.eggCooldown - dt);
    this.ambushCooldown = Math.max(0, this.ambushCooldown - dt);
    this.pounceCooldown = Math.max(0, this.pounceCooldown - dt);

    const p = this.game.player;

    for (let i = this.webs.length - 1; i >= 0; i--) {
      const web = this.webs[i];
      web.life -= dt;
      web.damageT -= dt;

      // Test the player against the rotated rectangular web instead of a
      // circular radius. This matches the new elongated visual and prevents
      // the web from feeling like an arbitrary magic AoE.
      const dx = p.pos.x - web.pos.x;
      const dz = p.pos.z - web.pos.z;
      const ca = Math.cos(web.angle);
      const sa = Math.sin(web.angle);
      const localX = dx * ca - dz * sa;
      const localZ = dx * sa + dz * ca;
      const inside = Math.abs(localX) <= web.width * 0.5 + p.radius &&
        Math.abs(localZ) <= web.length * 0.5 + p.radius;

      if (inside && web.damageT <= 0) {
        web.damageT = 0.8;
        p.takeDamage(this.game.combat.roll([7, 11], 0).amount, web.pos);
      }

      web.group.children.forEach((child) => {
        if (child.material) child.material.opacity = 0.25 + Math.min(0.35, web.life / 14);
      });

      if (web.life <= 0) {
        this.game.scene.remove(web.group);
        web.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
        this.webs.splice(i, 1);
      }
    }

    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const egg = this.eggs[i];
      egg.life -= dt;
      egg.pulse += dt * 7;
      egg.group.scale.setScalar(1 + Math.sin(egg.pulse) * 0.08);

      const d = Math.hypot(p.pos.x - egg.pos.x, p.pos.z - egg.pos.z);
      if (d < 0.9 + p.radius && egg.life > 0.5) {
        egg.life = 0.45;
      }

      if (egg.life <= 0) {
        this.hatchEgg(egg);
        this.eggs.splice(i, 1);
      }
    }
  }

  animate(dt, time) {
    const moving = this.state === 'chase' || this.state === 'ambush';
    const speed = moving ? 7.5 : 3.5;
    for (const leg of this.legs) {
      const swing = Math.sin(time * speed + leg.phase) * (moving ? 0.22 : 0.06);
      leg.pivot.rotation.y = leg.side * 0.16 + swing;
      leg.knee.rotation.y = -leg.side * 0.10 - swing * 0.6;
    }

    if (this.state === 'chase') {
      this.body.position.y = Math.sin(time * 8) * 0.035;
    } else if (this.state === 'web' || this.state === 'poison') {
      this.body.position.y = Math.sin(time * 12) * 0.055;
    } else {
      this.body.position.y *= Math.max(0, 1 - dt * 5);
    }

    this.root.rotation.y = this.facing;
  }

  toChase() {
    this.clearTelegraphs();
    this.struck = false;
    this.state = 'chase';
    this.stateT = 0;
    this.nextAttack = this.phase === 3 ? 0.45 : this.phase === 2 ? 0.65 : 0.95;
    this.combatStallT = 0;
    this.ambushTarget = null;
    this.root.visible = true;
  }

  clearTelegraphs() {
    this.tele.forEach((t) => this.game.fx.remove(t));
    this.tele = [];
  }

  clearHazards() {
    this.clearTelegraphs();
    this.webs.forEach((web) => {
      this.game.scene.remove(web.group);
      web.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
    });
    this.webs = [];

    this.eggs.forEach((egg) => {
      this.game.scene.remove(egg.group);
      egg.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
    });
    this.eggs = [];
    this._pendingWebPositions = [];
    this.ambushTarget = null;
    this.pounceTarget = null;
    this.pounceStart = null;
    this.pounceDistance = 0;
    this.pounceHit = false;
    this.orbitT = 0;
  }
}
