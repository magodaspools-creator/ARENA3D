// 2D XZ collision for the Arena prototype.
//
// Design:
// - zones define the actual walkable footprint;
// - obstacles are explicit solid colliders;
// - movement is swept in small substeps, so diagonal movement does not get
//   incorrectly rejected at corners and fast movement cannot jump through walls;
// - axis sliding is used when the full movement vector is blocked;
// - circle-vs-box tests use the real circle/AABB distance instead of a coarse
//   expanded-rectangle test.
//
// There is intentionally no physics engine here: the dungeon is static and
// deterministic, so explicit collision geometry is easier to inspect and tune.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Collision {
  constructor() {
    this.zones = [];
    this.obstacles = [];
    this.maxStep = 0.18;
  }

  addRectZone(minX, maxX, minZ, maxZ) {
    this.zones.push({ type: 'rect', minX, maxX, minZ, maxZ });
  }

  addCircleZone(x, z, r) {
    this.zones.push({ type: 'circle', x, z, r });
  }

  addCircle(x, z, r, opts = {}) {
    const o = {
      type: 'circle',
      x, z, r,
      enabled: opts.enabled ?? true,
      projectiles: opts.projectiles ?? true,
    };
    this.obstacles.push(o);
    return o;
  }

  addBox(minX, maxX, minZ, maxZ, opts = {}) {
    const o = {
      type: 'box',
      minX, maxX, minZ, maxZ,
      enabled: opts.enabled ?? true,
      projectiles: opts.projectiles ?? true,
    };
    this.obstacles.push(o);
    return o;
  }

  /** Signed distance to the walkable area (negative = inside). */
  sdf(x, z) {
    let d = Infinity;

    for (const zn of this.zones) {
      let v;
      if (zn.type === 'rect') {
        const dx = Math.max(zn.minX - x, x - zn.maxX);
        const dz = Math.max(zn.minZ - z, z - zn.maxZ);
        v = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
      } else {
        v = Math.hypot(x - zn.x, z - zn.z) - zn.r;
      }
      if (v < d) d = v;
    }

    return d;
  }

  inside(x, z, pad = 0) {
    return this.sdf(x, z) <= pad;
  }

  /** Exact circle-vs-obstacle test for a body of radius r. */
  obstacleHit(x, z, r, o) {
    if (!o.enabled) return false;

    if (o.type === 'circle') {
      const rr = o.r + r;
      return (x - o.x) ** 2 + (z - o.z) ** 2 < rr * rr;
    }

    const cx = clamp(x, o.minX, o.maxX);
    const cz = clamp(z, o.minZ, o.maxZ);
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
  }

  /** True when a body can occupy this XZ position. */
  canOccupy(x, z, r) {
    if (!this.inside(x, z, -r)) return false;

    for (const o of this.obstacles) {
      if (this.obstacleHit(x, z, r, o)) return false;
    }

    return true;
  }

  /** True if a circle at (x,z) overlaps an obstacle that blocks projectiles. */
  blocked(x, z, r) {
    for (const o of this.obstacles) {
      if (!o.enabled || !o.projectiles) continue;
      if (this.obstacleHit(x, z, r, o)) return true;
    }
    return false;
  }

  /**
   * Resolve a body that is already intersecting an obstacle.
   * This is mainly used for knockback/body separation; normal movement goes
   * through canOccupy() and therefore never enters the obstacle in the first place.
   */
  resolveObstacles(x, z, r) {
    let nx = x;
    let nz = z;

    for (let pass = 0; pass < 3; pass++) {
      let changed = false;

      for (const o of this.obstacles) {
        if (!o.enabled || !this.obstacleHit(nx, nz, r, o)) continue;

        if (o.type === 'circle') {
          let ox = nx - o.x;
          let oz = nz - o.z;
          let d = Math.hypot(ox, oz);

          if (d < 1e-6) {
            ox = 1;
            oz = 0;
            d = 1;
          }

          const push = o.r + r - d;
          nx += (ox / d) * push;
          nz += (oz / d) * push;
          changed = true;
          continue;
        }

        const cx = clamp(nx, o.minX, o.maxX);
        const cz = clamp(nz, o.minZ, o.maxZ);
        let ox = nx - cx;
        let oz = nz - cz;
        const d2 = ox * ox + oz * oz;

        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          nx += (ox / d) * push;
          nz += (oz / d) * push;
        } else {
          // Center is inside the box. Leave through the nearest face.
          const left = nx - o.minX;
          const right = o.maxX - nx;
          const bottom = nz - o.minZ;
          const top = o.maxZ - nz;
          const m = Math.min(left, right, bottom, top);

          if (m === left) nx = o.minX - r;
          else if (m === right) nx = o.maxX + r;
          else if (m === bottom) nz = o.minZ - r;
          else nz = o.maxZ + r;
        }

        changed = true;
      }

      if (!changed) break;
    }

    return { x: nx, z: nz };
  }

  /**
   * Move a circular body in XZ.
   *
   * The old implementation tested the final diagonal position once and,
   * when that corner was outside, often rejected the whole movement. That
   * creates the characteristic "invisible wall" feeling around dungeon
   * corners and narrow passages.
   *
   * We now sweep in short deterministic steps. Each step tries:
   *   1. full movement;
   *   2. X-only slide;
   *   3. Z-only slide;
   *   4. a binary-search partial move if the full vector is blocked.
   */
  move(pos, dx, dz, r) {
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-8) {
      const resolved = this.resolveObstacles(pos.x, pos.z, r);
      if (this.canOccupy(resolved.x, resolved.z, r)) {
        pos.x = resolved.x;
        pos.z = resolved.z;
      }
      return;
    }

    const steps = Math.max(1, Math.ceil(distance / this.maxStep));
    const sx = dx / steps;
    const sz = dz / steps;

    for (let step = 0; step < steps; step++) {
      const ox = pos.x;
      const oz = pos.z;
      const tx = ox + sx;
      const tz = oz + sz;

      // Preferred path: full vector.
      if (this.canOccupy(tx, tz, r)) {
        pos.x = tx;
        pos.z = tz;
        continue;
      }

      // Slide along the individual axes. This is important at wall corners.
      if (this.canOccupy(tx, oz, r)) pos.x = tx;
      if (this.canOccupy(pos.x, tz, r)) pos.z = tz;

      // If neither axis could advance, move as far as possible along the
      // original vector instead of stopping an entire frame early.
      if (pos.x === ox && pos.z === oz) {
        let lo = 0;
        let hi = 1;

        for (let i = 0; i < 8; i++) {
          const t = (lo + hi) * 0.5;
          if (this.canOccupy(ox + sx * t, oz + sz * t, r)) lo = t;
          else hi = t;
        }

        if (lo > 1e-3) {
          pos.x = ox + sx * lo;
          pos.z = oz + sz * lo;
        }
      }
    }

    // Knockback/body separation can start from an overlap. Keep this final
    // correction, but only accept it if it remains inside the walkable area.
    const resolved = this.resolveObstacles(pos.x, pos.z, r);
    if (this.canOccupy(resolved.x, resolved.z, r)) {
      pos.x = resolved.x;
      pos.z = resolved.z;
    }
  }
}
