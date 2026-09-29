import * as THREE from 'three';
import { glow } from './models.js';

// Damage resolution for melee arcs, area hits and projectiles.
// `game.enemies` holds everything the player can hit (including the boss).

const PROJ_Y = 1.25;
const V = new THREE.Vector3();

const GEO = {
  shaft: new THREE.CylinderGeometry(0.022, 0.022, 0.8, 4).rotateX(Math.PI / 2),
  tip: new THREE.ConeGeometry(0.06, 0.18, 4).rotateX(Math.PI / 2).translate(0, 0, 0.45),
  fire: new THREE.IcosahedronGeometry(0.24, 1),
  thorn: new THREE.ConeGeometry(0.1, 0.65, 5).rotateX(Math.PI / 2),
  orb: new THREE.IcosahedronGeometry(0.22, 1),
  bigOrb: new THREE.IcosahedronGeometry(0.34, 1),
};

function makeVisual(kind, color) {
  const g = new THREE.Group();
  if (kind === 'arrow') {
    g.add(new THREE.Mesh(GEO.shaft, glow(0xfff1c8, 1.6)));
    g.add(new THREE.Mesh(GEO.tip, glow(color, 3)));
  } else if (kind === 'thorn') g.add(new THREE.Mesh(GEO.thorn, glow(color, 2.5)));
  else if (kind === 'bigOrb') g.add(new THREE.Mesh(GEO.bigOrb, glow(color, 3)));
  else g.add(new THREE.Mesh(kind === 'fire' ? GEO.fire : GEO.orb, glow(color, 3.2)));
  return g;
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
  }

  roll([a, b], critChance = 0.12, critMultiplier = 1.6) {
    let n = a + Math.random() * (b - a);
    const crit = Math.random() < critChance;
    if (crit) n *= critMultiplier;
    return { amount: Math.round(n), crit };
  }

  resolveDamage(range, { target = null, damageType = 'physical', critChance = 0.12, critMultiplier = 1.6, bonus = 0 } = {}) {
    const rolled = this.roll(range, critChance, critMultiplier);
    const resistance = Math.max(0, Math.min(0.9, Number(target?.resistances?.[damageType] ?? 0)));
    const rawAmount = Math.max(1, rolled.amount + Number(bonus || 0));
    return {
      amount: Math.max(1, Math.round(rawAmount * (1 - resistance))),
      crit: rolled.crit,
      damageType,
      resistance,
    };
  }

  hitEnemy(e, dmg, from, color = 0xffffff, context = {}) {
    const { amount, crit } = this.resolveDamage(dmg, { target: e, ...context });
    e.takeDamage(amount, from, crit);
    const impactPos = V.copy(e.pos).setY(e.height * 0.55);
    this.game.ui.damageNumber(V.copy(e.pos).setY(e.height), amount, crit ? 'crit' : '');
    this.game.fx.damageImpact(impactPos, { color, type: context.damageType || 'physical', crit });
    this.game.stats.damage += amount;
    return amount;
  }

  /** Hits every target in front of `origin` within range and angle. */
  meleeArc(origin, dir, range, arc, dmg, color, context = {}) {
    let hits = 0;
    for (const e of this.game.enemies) {
      if (!e.targetable) continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist - e.radius > range) continue;
      const cos = (dx * dir.x + dz * dir.z) / (dist || 1);
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > arc / 2 && dist > e.radius + 0.7) continue;
      this.hitEnemy(e, dmg, origin, color, context);
      hits++;
    }
    if (hits) { this.game.hitstop = 0.055; this.game.rig.shake(0.12); }
    return hits;
  }

  aoe(center, radius, dmg, color, exclude, context = {}) {
    let hits = 0;
    for (const e of this.game.enemies) {
      if (!e.targetable || exclude?.has(e)) continue;
      if (Math.hypot(e.pos.x - center.x, e.pos.z - center.z) - e.radius > radius) continue;
      exclude?.add(e);
      this.hitEnemy(e, dmg, center, color, context);
      hits++;
    }
    return hits;
  }

  /** p: { team, pos, dir, speed, range, damage, visual, color, splash, radius, damageType, critChance, critMultiplier } */
  spawn(p) {
    const pr = {
      team: p.team, damage: p.damage, color: p.color, splash: p.splash || 0,
      damageType: p.damageType || 'physical',
      critChance: p.critChance ?? 0.12,
      critMultiplier: p.critMultiplier ?? 1.6,
      radius: p.radius ?? 0.35, visual: p.visual,
      pos: new THREE.Vector3(p.pos.x, PROJ_Y, p.pos.z),
      vel: new THREE.Vector3(p.dir.x, 0, p.dir.z).normalize().multiplyScalar(p.speed),
      life: p.range / p.speed,
      mesh: makeVisual(p.visual, p.color),
    };
    pr.mesh.position.copy(pr.pos);
    pr.mesh.lookAt(V.copy(pr.pos).add(pr.vel));
    this.game.scene.add(pr.mesh);
    this.projectiles.push(pr);
    return pr;
  }

  explode(p) {
    const fx = this.game.fx;
    const big = p.splash > 0;
    fx.emit(p.pos, { count: big ? 34 : 12, color: p.color, speed: big ? 7 : 4, life: big ? 0.6 : 0.35, size: big ? 0.5 : 0.3, drag: 3 });
    if (big) {
      fx.ring(p.pos, p.color, p.splash * 1.2, 0.35);
      fx.emit(p.pos, { count: 10, color: 0x552211, speed: 2, up: 1.5, life: 1.2, size: 0.8, drag: 1 });
    }
    this.game.scene.remove(p.mesh);
    p.dead = true;
  }

  update(dt) {
    const { collision, player, fx } = this.game;
    for (const p of this.projectiles) {
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.visual === 'fire' || p.visual === 'orb' || p.visual === 'bigOrb') p.mesh.rotation.z += dt * 8;
      p.life -= dt;
      if (Math.random() < 0.9) {
        fx.particles.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6,
          p.color, p.visual === 'arrow' ? 0.2 : 0.4, p.visual === 'fire' ? 0.55 : 0.3, 0, 1);
      }
      if (p.life <= 0 || !collision.inside(p.pos.x, p.pos.z, 0.3) || collision.blocked(p.pos.x, p.pos.z, 0.1)) {
        this.explode(p);
        continue;
      }
      if (p.team === 'player') {
        for (const e of this.game.enemies) {
          if (!e.targetable) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.radius + p.radius) {
            if (p.splash) this.aoe(p.pos, p.splash, p.damage, p.color, undefined, {
              damageType: p.damageType,
              critChance: p.critChance,
              critMultiplier: p.critMultiplier,
            });
            else this.hitEnemy(e, p.damage, V.copy(p.pos).sub(p.vel), p.color, {
              damageType: p.damageType,
              critChance: p.critChance,
              critMultiplier: p.critMultiplier,
            });
            this.explode(p);
            break;
          }
        }
      } else if (player && !player.dead && !p.dodged) {
        if (Math.hypot(player.pos.x - p.pos.x, player.pos.z - p.pos.z) < player.radius + p.radius) {
          if (player.invulnerable) { p.dodged = true; this.game.ui.floatText(V.copy(player.pos).setY(2.2), 'Esquiva!', 'info'); }
          else { player.takeDamage(this.roll(p.damage, 0).amount, p.pos); this.explode(p); }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  clearEnemyProjectiles() {
    for (const p of this.projectiles) if (p.team === 'enemy') this.explode(p);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }
}
