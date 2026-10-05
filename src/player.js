import * as THREE from 'three';
import { VOCATIONS } from './vocations.js';
import { createWeapon, uniqueMaterials, applyFlash, HumanoidAnimator } from './models.js';

const V = new THREE.Vector3();
const F = new THREE.Vector3();
const R = new THREE.Vector3();
const RED = new THREE.Color(0xff2020);
let NEXT_PLAYER_ID = 1;
const ACTIVE_PLAYERS = new Set();

const WEAPON_OFFSETS = {
  sword: {
    position: [0, 0, 0],
    rotation: [Math.PI / 2 - 0.25, 0, 0],
  },

  shield: {
    // Ponto inicial para assentar o escudo no antebraço/mão esquerda.
    // Ajuste estes 3 valores sem mexer na lógica de equipar.
    position: [-0.02, 0.02, 0.06],
    rotation: [0, 0, 0],
  },

  bow: {
    position: [0, 0, 0],
    rotation: [0, Math.PI / 2, 0],
  },

  crossbow: {
    // Empunhadura centralizada na mão esquerda; corpo apontado para frente.
    position: [0, 0, 0],
    rotation: [0, Math.PI / 2, 0],
  },

  staff: {
    // Cajado é criado apontando para +Y. Mantém a ponta para cima
    // e corrige a orientação frontal com 180° no eixo Y local.
    position: [0, 0, 0],
    rotation: [Math.PI, Math.PI, 0],
  },

  blade: {
    position: [0, 0, 0],
    rotation: [Math.PI / 2 - 0.3, 0, 0],
  },

  greatsword: {
    position: [0, 0, 0],
    rotation: [Math.PI / 2 - 0.3, 0, 0],
  },
};

const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Player {
  constructor(game, vocId, finalRig) {
    this.game = game;
    this.id = NEXT_PLAYER_ID++;
    ACTIVE_PLAYERS.add(this);
    this.voc = VOCATIONS[vocId];
    const look = { ...this.voc.look };
    if (look.weapon === 'fists') look.fistGlow = look.glow;

    if (!finalRig) throw new Error('[ARENA] Player requires a final rig before construction.');
    this.rig = finalRig;
    this.rig.camera = game.camera;
    this.root = this.rig.root;
    this.root.userData.arenaPlayerRoot = this.id;
    this.pos = this.root.position;
    this.mats = uniqueMaterials(this.root);
    this.anim = this.rig.makeAnimator ? this.rig.makeAnimator() : new HumanoidAnimator(this.rig);

    const isGltfRig = !!this.rig.model && typeof this.rig.makeAnimator === 'function';

    if (look.weapon !== 'fists') {
      this.weapon = createWeapon(look.weapon, look);
      this.weapon.userData.arenaPlayerWeapon = look.weapon;
      const weaponHand = isGltfRig
        ? (look.weapon === 'bow' ? this.rig.armL : this.rig.armR)
        : (look.weapon === 'bow' ? this.rig.handL : this.rig.handR);
      if (look.weapon === 'bow' && isGltfRig) {
        console.log('[ARENA] PALADIN BOW ATTACH', {
          playerId: this.id,
          anchor: weaponHand.name,
          parentBone: weaponHand.parent?.name || null,
        });
      }
      weaponHand.add(this.weapon);

      this.applyWeaponOffset(this.weapon, look.weapon);
      this.normalizeWeaponScale(this.weapon, weaponHand);
    }
    if (look.offhand) {
      this.offhandWeapon = createWeapon(look.offhand, look);
      this.offhandWeapon.userData.arenaPlayerWeapon = look.offhand;
      const offhand = isGltfRig ? this.rig.armL : this.rig.handL;
      offhand.add(this.offhandWeapon);

      this.applyWeaponOffset(this.offhandWeapon, look.offhand);
      this.normalizeWeaponScale(this.offhandWeapon, offhand);
    }

    this.root.visible = true;
    this.root.updateMatrixWorld(true);
    game.scene.add(this.root);

    this.lightSpellT = 0;
    this.lightSpell = new THREE.PointLight(0x9ec8ff, 0, 32, 1.15);
    this.lightSpell.position.set(0, 3.5, 0);
    this.game.scene.add(this.lightSpell);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.68, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: look.glow, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    );
    ring.position.y = 0.04;
    this.ring = ring;
    this.root.add(ring);

    this.light = new THREE.PointLight(0xffe2b8, 0.8, 5, 1.4);
    this.light.position.set(0, 3, 0.5);
    this.root.add(this.light);

    this.radius = 0.45;
    const initialStats = this.game.character?.stats;
    this.maxHp = initialStats?.maxHp ?? this.voc.hp;
    this.hp = this.maxHp;
    this.maxMana = initialStats?.maxMana ?? 100;
    this.mana = this.maxMana;
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.attackCd = 0; this.abilityCd = 0; this.dashCd = 0;
    this.ultimateCharge = 0;
    this.dashT = 0; this.dashDir = new THREE.Vector3(); this.dashHits = null;
    this.aimFaceT = 0; this.aimAngle = 0; this.slowT = 0;
    this.poisonT = 0; this.poisonTickT = 0;
    this.webbedUntil = 0;
    this.lastHurt = -99;
    this.flash = 0;
    this.dead = false;
    this.passiveRegenT = 0;

    this.logPlayerDiagnostics();
  }

  applyWeaponOffset(weapon, type) {
    const offset = WEAPON_OFFSETS[type] || WEAPON_OFFSETS.sword;
    weapon.position.set(...offset.position);
    weapon.rotation.set(...offset.rotation);
  }

  normalizeWeaponScale(weapon, hand) {
    this.root.updateMatrixWorld(true);
    hand.updateMatrixWorld(true);
    const handScale = new THREE.Vector3();
    hand.getWorldScale(handScale);
    const safe = (v) => Number.isFinite(v) && Math.abs(v) > 0.00001 ? v : 1;
    const sx = 1 / safe(handScale.x);
    const sy = 1 / safe(handScale.y);
    const sz = 1 / safe(handScale.z);
    // Nunca permitir escala zero, NaN ou infinita no grupo da arma.
    weapon.scale.set(
      Number.isFinite(sx) && Math.abs(sx) > 0.00001 ? sx : 1,
      Number.isFinite(sy) && Math.abs(sy) > 0.00001 ? sy : 1,
      Number.isFinite(sz) && Math.abs(sz) > 0.00001 ? sz : 1,
    );
    weapon.updateMatrixWorld(true);
    const worldScale = new THREE.Vector3();
    weapon.getWorldScale(worldScale);
    console.log('[ARENA] PLAYER WEAPON SCALE', {
      playerId: this.id,
      weapon: weapon.userData.arenaPlayerWeapon,
      hand: hand.name || '(unnamed)',
      handWorldScale: handScale.toArray().map((v) => Number(v.toFixed(5))),
      weaponWorldScale: worldScale.toArray().map((v) => Number(v.toFixed(5))),
      parent: weapon.parent?.name || '(unnamed)',
    });
  }

  logPlayerDiagnostics() {
    this.root.updateMatrixWorld(true);
    let skinned = [];
    const weapons = [];
    this.game.scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        const p = new THREE.Vector3();
        o.getWorldPosition(p);
        skinned.push({ name: o.name || '(unnamed)', world: p.toArray().map((v) => Number(v.toFixed(5))) });
      }
      if (o.userData?.arenaPlayerWeapon) {
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        o.getWorldPosition(p);
        o.getWorldScale(s);
        weapons.push({
          name: o.userData.arenaPlayerWeapon,
          playerId: this.id,
          world: p.toArray().map((v) => Number(v.toFixed(5))),
          worldScale: s.toArray().map((v) => Number(v.toFixed(5))),
          parent: o.parent?.name || '(unnamed)',
        });
      }
    });
    const playersInScene = [];
    this.game.scene.traverse((o) => {
      if (o.userData?.arenaPlayerRoot) playersInScene.push(o.userData.arenaPlayerRoot);
    });
    console.log('[ARENA] PLAYER INSTANCE', {
      id: this.id,
      activePlayers: ACTIVE_PLAYERS.size,
      playerRootsInScene: playersInScene.length,
      proceduralFallback: !!this.rig.isProceduralFallback,
      rootParent: this.root.parent?.type || null,
      animator: this.anim.constructor.name,
      oldProceduralRigCreated: false,
      oldProceduralRigParent: null,
      oldHumanoidAnimatorUpdated: false,
      swapToGltfRigCalls: 0,
      createdDuringClassSelection: false,
      oldProceduralRigExists: false,
    });
    console.log('[ARENA] SCENE SKINNED MESHES', {
      playerId: this.id,
      count: skinned.length,
      meshes: skinned,
    });
    console.log('[ARENA] SCENE PLAYER WEAPONS', { playerId: this.id, count: weapons.length, weapons });
    this.anim.diagnostic?.();
  }

  dispose() {
    const wasInScene = !!this.root.parent;
    const root = this.root;
    this.game.scene.remove(root);
    this.game.scene.remove(this.lightSpell);
    ACTIVE_PLAYERS.delete(this);
    console.log('[ARENA] PLAYER DISPOSE', { id: this.id, wasInScene, rootParentAfter: root.parent?.type || null, activePlayers: ACTIVE_PLAYERS.size });
  }

  place(x, z, facing) {
    this.pos.set(x, 0, z);
    this.facing = facing;
    this.root.rotation.y = facing;
    this.vel.set(0, 0, 0);
    this.webbedUntil = 0;
  }

  aimDir(target) {
    V.set(target.x - this.pos.x, 0, target.z - this.pos.z);
    if (V.lengthSq() < 0.01) V.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    return V.normalize().clone();
  }

  /** Nearest living enemy within `range`, used by Space and auto-aim. */
  nearestEnemy(range) {
    let best = null, bd = range;
    for (const e of this.game.enemies) {
      if (!e.targetable) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - e.radius;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  aimTarget(useMouse) {
    if (useMouse) return this.game.aimPoint();
    const a = this.voc.attack;
    const e = this.nearestEnemy(a.kind === 'melee' ? a.range + 2.5 : a.range);
    if (e) return e.pos.clone();
    return this.pos.clone().add(V.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(5));
  }

  update(dt) {
    const g = this.game, input = g.input;
    const characterStats = this.game.character?.stats;
    if (characterStats && characterStats.maxHp !== this.maxHp) {
      const hpDelta = characterStats.maxHp - this.maxHp;
      this.maxHp = characterStats.maxHp;
      if (hpDelta > 0 && !this.dead) this.hp += hpDelta;
      this.hp = Math.min(this.hp, this.maxHp);
    }
    if (characterStats && characterStats.maxMana !== this.maxMana) {
      const manaDelta = characterStats.maxMana - this.maxMana;
      this.maxMana = characterStats.maxMana;
      if (manaDelta > 0 && !this.dead) this.mana += manaDelta;
      this.mana = Math.min(this.mana, this.maxMana);
    }
    this.attackCd -= dt; this.abilityCd -= dt; this.dashCd -= dt; this.aimFaceT -= dt; this.slowT -= dt;

    // Regeneração passiva leve: ajuda a recuperar entre trocas sem substituir poções.
    this.passiveRegenT += dt;
    if (this.passiveRegenT >= 1) {
      const regenDt = this.passiveRegenT;
      this.passiveRegenT = 0;
      if (this.hp > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.005 * regenDt);
      if (this.mana < this.maxMana) this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.01 * regenDt);
    }
    if (this.poisonT > 0) {
      this.poisonT = Math.max(0, this.poisonT - dt);
      this.poisonTickT -= dt;
      if (this.poisonTickT <= 0 && !this.dead) {
        this.poisonTickT = 1;
        this.takeDamage(this.poisonDamage, this.poisonSource);
        this.game.ui.floatText(V.copy(this.pos).setY(2.3), `-${this.poisonDamage}`, 'damage', 0.7);
      }
      if (this.poisonT <= 0) this.game.ui.toast('O envenenamento passou.');
    }

    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 5); applyFlash(this.mats, this.flash, RED); }
    this.ring.material.opacity = 0.4 + Math.sin(g.time * 3) * 0.12;

    if (this.lightSpellT > 0) {
      // The spell light is intentionally detached from the player rig so it illuminates
      // the dungeon around the character instead of making the character glow.
      this.lightSpell.position.set(this.pos.x, 3.5, this.pos.z);
      this.lightSpellT = Math.max(0, this.lightSpellT - dt);
      if (this.lightSpellT <= 0) {
        this.lightSpell.intensity = 0;
        this.game.ui.toast('A Luz Arcana se apagou.');
      }
    }

    if (this.dead) { this.anim.update(dt, 0); return; }
    const webbed = this.webbedUntil > g.time;
    if (this.webbedUntil > 0 && !webbed) {
      this.webbedUntil = 0;
      g.ui.toast('Você se soltou da teia.');
    }
    const locked = g.inputLocked || g.state !== 'play' || webbed;
    if (!locked && input.wasPressed('KeyL')) this.castLightSpell();
    if (!locked && input.wasPressed('KeyR')) this.useUltimate();

    // --- movement (camera relative) ---
    let mx = 0, mz = 0;
    if (!locked) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    }
    g.rig.forward(F); g.rig.right(R);
    const dir = new THREE.Vector3().addScaledVector(F, mz).addScaledVector(R, mx);
    if (dir.lengthSq() > 0) dir.normalize();

    if (!locked && (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight')) && this.dashCd <= 0) {
      this.dashDir.copy(dir.lengthSq() > 0 ? dir : V.set(Math.sin(this.facing), 0, Math.cos(this.facing)));
      this.startDash(0.2, 17, 1.1);
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.copy(this.dashDir).multiplyScalar(this.dashSpeed);
      if (Math.random() < 0.7) g.fx.emit(V.copy(this.pos).setY(0.2), { count: 1, color: 0x8a7a66, speed: 1, life: 0.5, size: 0.5, drag: 2 });
      if (this.dashHits) {
        const dashDamage = characterStats ? [characterStats.abilityMin, characterStats.abilityMax] : this.voc.ability.damage;
        g.combat.aoe(this.pos, 1.7, dashDamage, this.voc.ability.color, this.dashHits, this.damageContext('physical', characterStats));
      }
      if (this.dashT <= 0) this.dashHits = null;
    } else {
      const speed = (characterStats?.speed ?? this.voc.speed) * (this.slowT > 0 ? 0.55 : 1);
      this.vel.lerp(V.copy(dir).multiplyScalar(speed), 1 - Math.exp(-12 * dt));
    }
    if (webbed) {
      this.vel.set(0, 0, 0);
    } else {
      g.collision.move(this.pos, this.vel.x * dt, this.vel.z * dt, this.radius);
    }

    // --- facing ---
    let want = null;
    if (this.aimFaceT > 0) want = this.aimAngle;
    else if (this.vel.lengthSq() > 0.5) want = Math.atan2(this.vel.x, this.vel.z);
    if (want !== null) this.facing = lerpAngle(this.facing, want, 1 - Math.exp(-18 * dt));
    this.root.rotation.y = this.facing;

    // --- combat ---
    if (!locked) {
      const mouseAtk = input.mouse.left;
      if ((mouseAtk || input.down('Space')) && this.attackCd <= 0) this.attack(this.aimTarget(mouseAtk));
      if (input.wasPressed('KeyQ') && this.abilityCd <= 0) this.useAbility();
    }

    this.anim.update(dt, Math.hypot(this.vel.x, this.vel.z) / (characterStats?.speed ?? this.voc.speed));
    g.ui.setHP(this.hp, this.maxHp);
    g.ui.setMana?.(this.mana, this.maxMana);
    g.ui.setCooldown('attack', this.attackCd / (characterStats?.attackCooldown ?? this.voc.attack.cooldown));
    g.ui.setCooldown('ability', this.abilityCd / (characterStats?.abilityCooldown ?? this.voc.ability.cooldown));
    g.ui.setCooldown('dash', this.dashCd / 1.1);
    g.ui.setUltimate?.(this.ultimateCharge / 100);
  }

  castLightSpell() {
    this.lightSpellT = 20;
    this.lightSpell.intensity = 30;
    this.game.ui.toast('Luz Arcana lançada por 20 segundos.');
    this.game.fx.ring(this.pos, 0x9ec8ff, 1.4, 0.35, 0.45);
  }

  startDash(duration, speed, cooldown) {
    this.dashT = duration;
    this.dashSpeed = speed;
    this.dashCd = Math.max(this.dashCd, cooldown);
    this.game.fx.emit(V.copy(this.pos).setY(0.3), { count: 12, color: 0xbba88a, speed: 3, life: 0.5, size: 0.5, flat: true });
  }

  face(dir, t = 0.35) {
    this.aimAngle = Math.atan2(dir.x, dir.z);
    this.aimFaceT = t;
    this.facing = lerpAngle(this.facing, this.aimAngle, 0.6);
  }

  muzzle(dir) {
    return this.pos.clone().addScaledVector(dir, 0.7);
  }

  damageContext(damageType, stats) {
    return {
      damageType,
      critChance: stats?.critChance ?? 0.12,
      critMultiplier: stats?.critMultiplier ?? 1.6,
      bonus: damageType === 'magic' ? (stats?.magicPower ?? 0) : (stats?.physicalPower ?? 0),
    };
  }

  attack(target) {
    const g = this.game, a = this.voc.attack, s = g.character?.stats;
    this.attackCd = s?.attackCooldown ?? a.cooldown;
    const dir = this.aimDir(target);
    this.face(dir);
    this.slowT = 0.25;
    this.anim.attack(a.style, a.style === 'punch' ? 0.26 : a.style === 'slash' ? 0.5 : 0.42);
    if (a.kind === 'melee') {
      g.schedule(a.style === 'punch' ? 0.07 : 0.16, () => {
        if (this.dead) return;
        const range = s?.attackRange ?? a.range;
        const damage = s ? [s.attackMin, s.attackMax] : a.damage;
        g.fx.slash(this.pos, dir, range, a.arc, a.color);
        g.combat.meleeArc(this.pos, dir, range, a.arc, damage, a.color, this.damageContext('physical', s));
      });
    } else {
      g.schedule(0.14, () => {
        if (this.dead) return;
        const range = s?.attackRange ?? a.range;
        const damage = s ? [s.attackMin, s.attackMax] : a.damage;
        g.combat.spawn({
          team: 'player', pos: this.muzzle(dir), dir, speed: a.speed, range, damage,
          visual: a.visual, color: a.color, splash: a.splash,
          ...this.damageContext('physical', s),
        });
      });
    }
  }

  gainUltimate(amount) {
    if (!['sorcerer', 'knight', 'druid', 'paladin', 'monk'].includes(this.voc.id) || this.dead) return;
    this.ultimateCharge = Math.min(100, this.ultimateCharge + Math.max(0, Number(amount) || 0));
  }

  useUltimate() {
    if (!['sorcerer', 'knight', 'druid', 'paladin', 'monk'].includes(this.voc.id) || this.ultimateCharge < 100 || this.dead) return;
    const ultimateManaCost = this.voc.ultimate?.manaCost ?? 60;
    if (this.mana < ultimateManaCost) {
      this.game.ui.floatText(V.copy(this.pos).setY(2.75), '- MANA INSUFICIENTE', 'mana insufficient', 1.25);
      return;
    }
    this.mana -= ultimateManaCost;

    const g = this.game, u = this.voc.ultimate, s = g.character?.stats;

    if (this.voc.id === 'sorcerer') {
      const target = g.input.mouse.onCanvas ? g.aimPoint() : this.aimTarget(false);
      const t = target.clone().setY(0);
      const offset = t.clone().sub(this.pos);
      if (offset.length() > 12) t.copy(this.pos).addScaledVector(offset.normalize(), 12);

      this.ultimateCharge = 0;
      this.face(t.clone().sub(this.pos), 0.6);
      this.anim.attack('cast', 0.9);
      g.ui.toast('CATACLISMA ARCANO!');
      g.fx.telegraphCircle(t, u.radius, 0.75, u.color);
      g.fx.ring(t, u.color, u.radius * 0.9, 0.9);

      for (let i = 0; i < 3; i++) {
        g.schedule(0.75 + i * 0.28, () => {
          if (this.dead) return;
          const radius = u.radius * (i === 2 ? 1.08 : 1);
          g.fx.ring(t, u.color, radius, 0.32);
          g.fx.emit(V.copy(t).setY(0.5), {
            count: 22, color: u.color, speed: 8 + i * 1.5, up: 2.2,
            life: 0.55, size: 0.38, gravity: 5, drag: 3
          });
          g.combat.aoe(
            t, radius, s ? [s.abilityMin * 1.1, s.abilityMax * 1.1] : u.damage,
            u.color, undefined, this.damageContext('magic', s)
          );
          g.rig.shake(0.28 + i * 0.1);
        });
      }
      return;
    }

    if (this.voc.id === 'monk') {
      const target = g.input.mouse.onCanvas ? g.aimPoint() : this.aimTarget(false);
      const center = target.clone().setY(0);
      const offset = center.clone().sub(this.pos);
      if (offset.length() > 9) center.copy(this.pos).addScaledVector(offset.normalize(), 9);

      this.ultimateCharge = 0;
      this.face(center.clone().sub(this.pos), 0.7);
      this.anim.attack('punch', 0.8);
      this.slowT = 1.0;
      g.ui.toast('MIL MÃOS!');

      g.fx.telegraphCircle(center, 2.1, 0.55, u.color);
      g.fx.ring(center, u.color, 2.1, 0.45);

      const hits = 8;
      for (let i = 0; i < hits; i++) {
        g.schedule(0.28 + i * 0.14, () => {
          if (this.dead) return;

          const angle = (i % 2 === 0 ? -1 : 1) * (0.16 + (i % 4) * 0.11);
          const dir = center.clone().sub(this.pos).setY(0);
          if (dir.lengthSq() < 0.01) dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
          dir.normalize();

          const side = new THREE.Vector3(-dir.z, 0, dir.x);
          const punchPoint = center.clone()
            .addScaledVector(side, Math.sin(i * 2.4) * 0.75)
            .addScaledVector(dir, Math.cos(i * 1.7) * 0.35);

          g.fx.ring(punchPoint, i % 2 ? 0xffffff : u.color, 0.85, 0.16);
          g.fx.emit(V.copy(punchPoint).setY(0.7), {
            count: 10,
            color: i % 2 ? 0xffffff : u.color,
            speed: 5.5,
            up: 1.8,
            life: 0.28,
            size: 0.22,
            gravity: 2.5,
            drag: 4,
          });

          const fistDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
          g.fx.slash(this.pos, fistDir, 2.5, 0.65, u.color);
          g.combat.aoe(
            punchPoint,
            1.45,
            s ? [s.abilityMin * 0.34, s.abilityMax * 0.34] : [52, 66],
            u.color,
            undefined,
            this.damageContext('physical', s)
          );
          g.rig.shake(0.08);
        });
      }

      g.schedule(1.55, () => {
        if (this.dead) return;

        g.fx.ring(center, 0xffffff, 2.4, 0.28);
        g.fx.ring(center, u.color, u.radius, 0.5);
        g.fx.emit(V.copy(center).setY(0.35), {
          count: 48,
          color: u.color,
          speed: 8,
          up: 2.8,
          life: 0.7,
          size: 0.36,
          gravity: 4,
          drag: 3,
        });

        g.combat.aoe(
          center,
          u.radius,
          s ? [s.abilityMin * 1.45, s.abilityMax * 1.45] : u.damage,
          u.color,
          undefined,
          this.damageContext('physical', s)
        );
        g.rig.shake(0.6);
        g.hitstop = 0.08;
      });
      return;
    }

    if (this.voc.id === 'paladin') {
      const target = g.input.mouse.onCanvas ? g.aimPoint() : this.aimTarget(false);
      const center = target.clone().setY(0);
      const offset = center.clone().sub(this.pos);
      if (offset.length() > 14) center.copy(this.pos).addScaledVector(offset.normalize(), 14);

      this.ultimateCharge = 0;
      this.face(center.clone().sub(this.pos), 0.6);
      this.anim.attack('shoot', 0.9);
      this.slowT = 0.7;
      g.ui.toast('CHUVA DIVINA!');

      // Visual-only rebuild: one sacred seal, a vertical divine beam,
      // ordered light pillars around the impact zone, then a final burst.
      const sealMat = new THREE.MeshBasicMaterial({
        color: u.color,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const seal = new THREE.Group();

      const outer = new THREE.Mesh(
        new THREE.RingGeometry(u.radius * 0.72, u.radius * 0.78, 48),
        sealMat
      );
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = 0.045;
      seal.add(outer);

      const inner = new THREE.Mesh(
        new THREE.RingGeometry(u.radius * 0.32, u.radius * 0.37, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.05;
      seal.add(inner);

      for (let i = 0; i < 4; i++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(u.radius * 1.35, 0.035, 0.055),
          sealMat
        );
        line.position.y = 0.06;
        line.rotation.y = i * Math.PI / 4;
        seal.add(line);
      }

      seal.position.copy(center);
      g.scene.add(seal);

      g.fx.telegraphCircle(center, u.radius, 0.75, u.color);
      g.fx.ring(center, u.color, u.radius * 0.78, 0.75);

      // Divine light descends vertically into the center.
      g.schedule(0.58, () => {
        if (this.dead) return;

        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.7, 1.45, 9, 20, 1, true),
          new THREE.MeshBasicMaterial({
            color: u.color,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          })
        );
        beam.position.set(center.x, 4.5, center.z);
        g.scene.add(beam);

        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.55, 8.5, 12, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          })
        );
        core.position.set(center.x, 4.5, center.z);
        g.scene.add(core);

        g.fx.ring(center, 0xffffff, 1.7, 0.3);
        g.fx.emit(V.copy(center).setY(0.55), {
          count: 24,
          color: u.color,
          speed: 5.5,
          up: 3,
          life: 0.65,
          size: 0.3,
          gravity: 3,
          drag: 3,
        });
        g.rig.shake(0.35);

        g.schedule(0.42, () => {
          g.scene.remove(beam);
          g.scene.remove(core);
          beam.geometry.dispose();
          beam.material.dispose();
          core.geometry.dispose();
          core.material.dispose();
        });
      });

      // Small radial pillars make the area read as a single sacred strike,
      // without spawning a cloud of individual projectiles.
      const pillars = 8;
      for (let i = 0; i < pillars; i++) {
        const delay = 0.82 + i * 0.08;
        g.schedule(delay, () => {
          if (this.dead) return;

          const a = (i / pillars) * Math.PI * 2 + Math.PI / 8;
          const r = u.radius * (0.42 + (i % 2) * 0.18);
          const hit = center.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));

          g.fx.ring(hit, u.color, 0.9, 0.2);
          g.fx.emit(V.copy(hit).setY(0.35), {
            count: 8,
            color: 0xffffff,
            speed: 3.5,
            up: 2.4,
            life: 0.42,
            size: 0.22,
            gravity: 3,
          });
        });
      }

      // Final burst reuses the existing combat/damage behaviour exactly;
      // only the presentation is being replaced here.
      g.schedule(1.55, () => {
        if (this.dead) return;

        g.fx.ring(center, 0xffffff, u.radius * 0.95, 0.45);
        g.fx.ring(center, u.color, u.radius, 0.55);
        g.fx.emit(V.copy(center).setY(0.8), {
          count: 42,
          color: u.color,
          speed: 7,
          up: 3.5,
          life: 0.75,
          size: 0.34,
          gravity: 4,
        });
        g.rig.shake(0.5);
        g.combat.aoe(
          center,
          u.radius,
          s ? [s.abilityMin * 2.5, s.abilityMax * 2.5] : u.damage,
          u.color,
          undefined,
          this.damageContext('physical', s)
        );
      });

      g.schedule(2.0, () => {
        g.scene.remove(seal);
        seal.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      });
      return;
    }

    if (this.voc.id === 'druid') {
      this.ultimateCharge = 0;
      this.anim.attack('cast', 0.9);
      this.slowT = 0.55;
      g.ui.toast('TEMPESTADE GLACIAL!');
      g.fx.telegraphCircle(this.pos, u.radius, 0.8, u.color);
      g.fx.ring(this.pos, u.color, u.radius, 0.8);

      const stormDuration = 2.4;
      const vortexes = 8;
      const vortexMeshes = [];

      for (let i = 0; i < vortexes; i++) {
        const angle = (i / vortexes) * Math.PI * 2;
        const distance = 2.2 + (i % 2) * 2.1;
        const mesh = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
          color: u.color,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        for (let j = 0; j < 3; j++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.42 + j * 0.13, 0.055, 7, 18),
            mat
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.7 + j * 0.48;
          ring.rotation.z = j * 0.8;
          mesh.add(ring);
        }

        const core = new THREE.Mesh(
          new THREE.ConeGeometry(0.42, 2.4, 8, 1, true),
          mat
        );
        core.position.y = 1.25;
        mesh.add(core);

        mesh.position.set(
          this.pos.x + Math.sin(angle) * distance,
          0,
          this.pos.z + Math.cos(angle) * distance
        );
        g.scene.add(mesh);
        vortexMeshes.push({ mesh, angle, distance, phase: i * 0.8 });
      }

      let pulseT = 0;
      const tick = 0.22;
      const ticks = Math.ceil(stormDuration / tick);
      for (let i = 0; i < ticks; i++) {
        g.schedule(0.35 + i * tick, () => {
          if (this.dead) return;
          const pulse = i / Math.max(1, ticks - 1);
          const radius = u.radius * (0.72 + pulse * 0.18);
          g.combat.aoe(
            this.pos,
            radius,
            s ? [s.abilityMin * 0.55, s.abilityMax * 0.55] : u.damage,
            u.color,
            undefined,
            this.damageContext('magic', s)
          );
          g.fx.emit(V.copy(this.pos).setY(0.8), {
            count: 12,
            color: u.color,
            speed: 4.5,
            up: 2.4,
            life: 0.5,
            size: 0.28,
            drag: 3,
          });
        });
      }

      g.schedule(0.35, () => {
        const start = g.time;
        const animateStorm = () => {
          if (!vortexMeshes.length) return;
          const elapsed = g.time - start;
          for (const v of vortexMeshes) {
            const a = v.angle + elapsed * (v.phase % 2 ? -0.7 : 0.7);
            const wobble = Math.sin(elapsed * 4 + v.phase) * 0.35;
            v.mesh.position.x = this.pos.x + Math.sin(a) * (v.distance + wobble);
            v.mesh.position.z = this.pos.z + Math.cos(a) * (v.distance + wobble);
            v.mesh.rotation.y += 0.18;
            v.mesh.rotation.x = Math.sin(elapsed * 5 + v.phase) * 0.18;
          }
          if (elapsed < stormDuration && !this.dead) {
            requestAnimationFrame(animateStorm);
          } else {
            for (const v of vortexMeshes) {
              g.scene.remove(v.mesh);
              v.mesh.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
              });
            }
            vortexMeshes.length = 0;
          }
        };
        animateStorm();
      });
      return;
    }

    // Knight: a single committed frontal strike. It uses the player's facing
    // instead of the mouse point so the ultimate reads as a heavy melee finisher.
    const dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.ultimateCharge = 0;
    this.face(dir, 0.5);
    this.anim.attack('slash', 0.7);
    this.slowT = 0.45;
    g.ui.toast('GOLPE COLOSSAL!');
    g.fx.telegraphCircle(this.pos, u.radius, 0.55, u.color);

    g.schedule(0.45, () => {
      if (this.dead) return;
      const center = this.pos.clone().addScaledVector(dir, 2.0);
      center.y = 0;

      g.fx.slash(this.pos, dir, u.radius, u.arc, u.color);
      g.fx.ring(center, u.color, u.radius, 0.35);
      g.fx.ring(this.pos, 0xffffff, 2.0, 0.22, 0.75);
      g.fx.emit(V.copy(center).setY(0.35), {
        count: 38, color: u.color, speed: 8, up: 2.8,
        life: 0.6, size: 0.42, gravity: 5, drag: 4, flat: true
      });

      g.combat.meleeArc(
        this.pos,
        dir,
        u.radius,
        u.arc,
        s ? [s.abilityMin * 2.25, s.abilityMax * 2.25] : u.damage,
        u.color,
        this.damageContext('physical', s)
      );
      g.rig.shake(0.55);
      g.hitstop = 0.1;
    });
  }

  useAbility() {
    const g = this.game, ab = this.voc.ability, s = g.character?.stats;
    const manaCost = ab.manaCost ?? 20;
    if (this.mana < manaCost) {
      g.ui.floatText(V.copy(this.pos).setY(2.75), '- MANA INSUFICIENTE', 'mana insufficient', 1.25);
      return;
    }
    this.mana -= manaCost;
    this.abilityCd = s?.abilityCooldown ?? ab.cooldown;
    const target = g.input.mouse.onCanvas ? g.aimPoint() : this.aimTarget(false);
    const dir = this.aimDir(target);
    switch (ab.kind) {
      case 'whirl':
        this.anim.attack('whirl', 0.5);
        g.schedule(0.15, () => {
          g.fx.ring(this.pos, ab.color, ab.radius, 0.45, 1);
          g.fx.ring(this.pos, 0xffffff, ab.radius * 0.8, 0.3, 0.6);
          g.fx.emit(V.copy(this.pos).setY(1), { count: 40, color: ab.color, speed: 9, life: 0.4, flat: true, size: 0.35, drag: 5 });
          if (g.combat.aoe(this.pos, ab.radius, s ? [s.abilityMin, s.abilityMax] : ab.damage, ab.color, undefined, this.damageContext('physical', s))) g.hitstop = 0.08;
          g.rig.shake(0.3);
        });
        break;
      case 'volley':
        this.face(dir, 0.5);
        this.anim.attack('shoot', 0.45);
        g.schedule(0.14, () => {
          for (let i = 0; i < ab.count; i++) {
            const ang = Math.atan2(dir.x, dir.z) + (i / (ab.count - 1) - 0.5) * ab.spread;
            const d = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
            g.combat.spawn({
              team: 'player', pos: this.muzzle(d), dir: d, speed: 30, range: 20,
              damage: s ? [s.abilityMin, s.abilityMax] : ab.damage,
              visual: 'arrow', color: ab.color,
              ...this.damageContext('physical', s),
            });
          }
          g.fx.emit(V.copy(this.pos).setY(1.3), { count: 20, color: ab.color, speed: 3, life: 0.5 });
        });
        break;
      case 'meteor': {
        this.face(dir, 0.6);
        this.anim.attack('cast', 0.7);
        const t = target.clone().setY(0);
        const off = t.clone().sub(this.pos);
        if (off.length() > 15) t.copy(this.pos).addScaledVector(off.normalize(), 15);
        g.fx.telegraphCircle(t, ab.radius, ab.delay, 0xff7a1a);
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5a10, emissiveIntensity: 3, flatShading: true }));
        g.fx.add(rock, ab.delay, (it, p) => {
          rock.position.set(t.x - 6 * (1 - p), 18 * (1 - p) + 0.5, t.z - 3 * (1 - p));
          rock.rotation.x += 0.2;
          g.fx.particles.spawn(rock.position.x, rock.position.y, rock.position.z, 0, 1, 0, 0xff7a1a, 0.5, 1.1, 0, 1);
        });
        g.schedule(ab.delay, () => {
          g.fx.ring(t, 0xff7a1a, ab.radius * 1.2, 0.6);
          g.fx.emit(V.copy(t).setY(0.5), { count: 80, color: 0xff6a1a, speed: 11, up: 3, life: 0.8, size: 0.6, gravity: 8, drag: 2 });
          g.fx.emit(V.copy(t).setY(0.5), { count: 20, color: 0x442211, speed: 3, up: 2, life: 1.6, size: 1.2, drag: 1 });
          g.combat.aoe(t, ab.radius, s ? [s.abilityMin, s.abilityMax] : ab.damage, ab.color, undefined, this.damageContext('magic', s));
          g.rig.shake(0.7);
        });
        break;
      }
      case 'bloom':
        this.anim.attack('cast', 0.7);
        this.heal(this.maxHp * ab.heal, true);
        g.fx.beam(this.pos, ab.color, 6, 1.0, 1.0);
        g.fx.ring(this.pos, ab.color, ab.radius, 0.7);
        g.fx.emit(V.copy(this.pos).setY(0.5), { count: 50, color: ab.color, speed: 4, up: 2.5, life: 1.2, size: 0.4, drag: 2 });
        g.combat.aoe(this.pos, ab.radius, s ? [s.abilityMin, s.abilityMax] : ab.damage, ab.color, undefined, this.damageContext('magic', s));
        break;
      case 'palmStrike':
        this.face(dir, 0.45);
        this.anim.attack('punch', 0.42);
        this.slowT = 0.35;
        g.schedule(0.16, () => {
          if (this.dead) return;

          g.fx.ring(this.pos, ab.color, ab.radius * 0.75, 0.22);
          g.fx.slash(this.pos, dir, ab.radius, ab.arc, ab.color);
          g.fx.emit(V.copy(this.pos).addScaledVector(dir, 1.0).setY(0.75), {
            count: 28,
            color: ab.color,
            speed: 6,
            up: 2.2,
            life: 0.5,
            size: 0.28,
            gravity: 3,
            drag: 4,
            flat: true,
          });

          g.combat.meleeArc(
            this.pos,
            dir,
            ab.radius,
            ab.arc,
            s ? [s.abilityMin, s.abilityMax] : ab.damage,
            ab.color,
            this.damageContext('physical', s)
          );
          g.rig.shake(0.22);
        });
        break;
    }
  }

  applyPoison(effect, from) {
    const duration = Number(effect?.duration ?? 5);
    const damage = Math.max(1, Math.round((effect?.damage?.[0] ?? 3) + Math.random() * ((effect?.damage?.[1] ?? 5) - (effect?.damage?.[0] ?? 3))));
    this.poisonT = Math.max(this.poisonT, duration);
    this.poisonTickT = Math.min(this.poisonTickT || 0, 0.35);
    this.poisonDamage = Math.max(this.poisonDamage || 0, damage);
    this.poisonSource = from?.clone ? from.clone() : from;
    this.game.fx.emit(V.copy(this.pos).setY(0.8), { count: 10, color: 0x65d66f, speed: 1.2, up: 1.2, life: 0.55, size: 0.22, drag: 2 });
    this.game.ui.floatText(V.copy(this.pos).setY(2.5), 'ENVENENADO', 'damage', 0.9);
  }

  heal(amount, show) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (show && this.hp > before) this.game.ui.floatText(V.copy(this.pos).setY(2.3), `+${Math.round(this.hp - before)}`, 'heal', 1.1);
  }

  takeDamage(amount, from) {
    if (this.dead || this.game.state !== 'play') return;
    if (this.invulnerable) { this.game.ui.floatText(V.copy(this.pos).setY(2.2), 'Esquiva!', 'info'); return; }
    amount = Math.round(amount * (this.game.character?.stats.damageMultiplier ?? this.voc.armor));
    this.hp -= amount;
    this.gainUltimate(2);
    this.lastHurt = this.game.time;
    this.flash = 1;
    this.anim.hit();
    this.game.ui.damageNumber(V.copy(this.pos).setY(2.2), amount, 'player');
    this.game.ui.hurtFlash();
    this.game.rig.shake(0.25);
    if (from) {
      const k = V.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize().multiplyScalar(0.35);
      this.game.collision.move(this.pos, k.x, k.z, this.radius);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.anim.die();
      this.game.ui.setHP(0, this.maxHp);
      this.game.onPlayerDied();
    }
  }

  revive(x, z, facing) {
    this.dead = false;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.webbedUntil = 0;
    this.attackCd = 0;
    this.abilityCd = 0;
    this.dashCd = 0;
    this.ultimateCharge = 0;
    this.dashT = 0;
    this.dashHits = null;
    this.slowT = 0;
    this.poisonT = 0;
    this.poisonTickT = 0;
    this.poisonDamage = 0;
    this.poisonSource = null;
    this.lastHurt = this.game.time;
    this.passiveRegenT = 0;
    this.lightSpellT = 0;
    this.lightSpell.intensity = 0;
    this.vel.set(0, 0, 0);
    this.anim.revive();
    this.place(x, z, facing);
    this.game.ui.setHP(this.hp, this.maxHp);
    this.game.ui.setMana?.(this.mana, this.maxMana);
  }
}
