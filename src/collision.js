// Simple 2D (XZ) collision: walkable zones can be rects/circles/polygons.
// Obstacles (circles/boxes) push entities out. No physics engine needed.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const pointInPolygon = (x, z, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], zi = points[i][1];
    const xj = points[j][0], zj = points[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
};

const distanceToSegment = (x, z, x1, z1, x2, z2) => {
  const vx = x2 - x1, vz = z2 - z1;
  const wx = x - x1, wz = z - z1;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? clamp((wx * vx + wz * vz) / len2, 0, 1) : 0;
  const px = x1 + vx * t, pz = z1 + vz * t;
  return Math.hypot(x - px, z - pz);
};

export class Collision {
  constructor() {
    this.zones = [];
    this.obstacles = [];
  }
  addRectZone(minX, maxX, minZ, maxZ) { this.zones.push({ type: 'rect', minX, maxX, minZ, maxZ }); }
  addCircleZone(x, z, r) { this.zones.push({ type: 'circle', x, z, r }); }
  addPolygonZone(points) {
    if (!Array.isArray(points) || points.length < 3) return;
    this.zones.push({ type: 'polygon', points: points.map(([x, z]) => [x, z]) });
  }
  addCircle(x, z, r, opts = {}) {
    const o = { type: 'circle', x, z, r, enabled: true, projectiles: opts.projectiles ?? true };
    this.obstacles.push(o);
    return o;
  }
  addBox(minX, maxX, minZ, maxZ, opts = {}) {
    const o = {
      type: 'box',
      minX, maxX, minZ, maxZ,
      enabled: opts.enabled ?? true,
      projectiles: opts.projectiles ?? true,
      walkableTop: opts.walkableTop ?? false,
      topY: Number.isFinite(opts.topY) ? opts.topY : 0,
    };
    this.obstacles.push(o);
    return o;
  }

  // Find the next reachable surface relative to the actor's current height.
  // This must work in BOTH directions: when climbing, choose the nearest
  // higher step; when descending, choose the highest lower step. Simply taking
  // the highest candidate breaks descent because the 0.9 altar slab overlaps
  // the 0.7 stair footprint.
  surfaceHeight(x, z, currentY = 0, maxStep = 0.35) {
    const eps = 1e-4;
    const candidates = [];

    for (const o of this.obstacles) {
      if (!o.enabled || !o.walkableTop) continue;
      if (o.type === 'box') {
        if (x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) continue;
      } else if (o.type === 'circle') {
        if (Math.hypot(x - o.x, z - o.z) > o.r) continue;
      } else {
        continue;
      }

      const top = o.topY;
      if (Math.abs(top - currentY) <= maxStep + eps) candidates.push(top);
    }

    // Prefer the next higher step while climbing, or the next lower step
    // while descending. Never jump over an intermediate stair height.
    const above = candidates.filter((h) => h > currentY + eps).sort((a, b) => a - b);
    if (above.length) return above[0];

    const below = candidates.filter((h) => h < currentY - eps).sort((a, b) => b - a);
    if (below.length) return below[0];

    return currentY;
  }

  /** Signed distance to the walkable area (negative = inside). */
  sdf(x, z) {
    let d = Infinity;
    for (const zn of this.zones) {
      let v;
      if (zn.type === 'rect') {
        const dx = Math.max(zn.minX - x, x - zn.maxX), dz = Math.max(zn.minZ - z, z - zn.maxZ);
        v = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
      } else if (zn.type === 'circle') {
        v = Math.hypot(x - zn.x, z - zn.z) - zn.r;
      } else {
        let edge = Infinity;
        for (let i = 0; i < zn.points.length; i++) {
          const a = zn.points[i], b = zn.points[(i + 1) % zn.points.length];
          edge = Math.min(edge, distanceToSegment(x, z, a[0], a[1], b[0], b[1]));
        }
        v = pointInPolygon(x, z, zn.points) ? -edge : edge;
      }
      if (v < d) d = v;
    }
    return d;
  }
  inside(x, z, pad = 0) { return this.sdf(x, z) <= pad; }

  /** True if a circle at (x,z) overlaps an obstacle that blocks projectiles. */
  blocked(x, z, r) {
    for (const o of this.obstacles) {
      if (!o.enabled || !o.projectiles) continue;
      if (o.type === 'circle') { if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true; }
      else if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return true;
    }
    return false;
  }

  /** Moves a circle with wall sliding, obstacle resolution and small step-ups. */
  move(pos, dx, dz, r) {
    const lim = -r;
    const maxStep = 0.35;
    let nx = pos.x;
    let nz = pos.z;
    let ny = Number.isFinite(pos.y) ? pos.y : 0;

    const tryX = pos.x + dx;
    if (this.inside(tryX, nz, lim)) {
      const h = this.surfaceHeight(tryX, nz, ny, maxStep);
      if (Math.abs(h - ny) <= maxStep + 1e-4) {
        nx = tryX;
        ny = h;
      }
    }

    const tryZ = nz + dz;
    if (this.inside(nx, tryZ, lim)) {
      const h = this.surfaceHeight(nx, tryZ, ny, maxStep);
      if (Math.abs(h - ny) <= maxStep + 1e-4) {
        nz = tryZ;
        ny = h;
      }
    }

    if (nx === pos.x && nz !== pos.z && dx !== 0) {
      const retryX = pos.x + dx;
      if (this.inside(retryX, nz, lim)) {
        const h = this.surfaceHeight(retryX, nz, ny, maxStep);
        if (Math.abs(h - ny) <= maxStep + 1e-4) {
          nx = retryX;
          ny = h;
        }
      }
    }

    for (let it = 0; it < 2; it++) {
      for (const o of this.obstacles) {
        if (!o.enabled) continue;

        // A marked walkable top behaves like a small step/ramp: once the
        // actor is at the correct height, its 2D footprint no longer blocks.
        if (o.walkableTop && Math.abs(o.topY - ny) <= maxStep + 1e-4) continue;

        if (o.type === 'circle') {
          const ox = nx - o.x, oz = nz - o.z, min = o.r + r, d2 = ox * ox + oz * oz;
          if (d2 < min * min) {
            const d = Math.sqrt(d2) || 1e-4;
            nx = o.x + (ox / d) * min; nz = o.z + (oz / d) * min;
          }
        } else {
          const cx = clamp(nx, o.minX, o.maxX), cz = clamp(nz, o.minZ, o.maxZ);
          const ox = nx - cx, oz = nz - cz, d2 = ox * ox + oz * oz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = cx + (ox / d) * r; nz = cz + (oz / d) * r;
          } else {
            const l = nx - o.minX, rr = o.maxX - nx, b = nz - o.minZ, t = o.maxZ - nz;
            const m = Math.min(l, rr, b, t);
            if (m === l) nx = o.minX - r;
            else if (m === rr) nx = o.maxX + r;
            else if (m === b) nz = o.minZ - r;
            else nz = o.maxZ + r;
          }
        }
      }
    }

    if (!this.inside(nx, nz, lim) && this.inside(pos.x, pos.z, lim)) {
      nx = pos.x;
      nz = pos.z;
      ny = pos.y;
    }

    // Prevent walking/falling off a raised surface when the drop is larger
    // than one allowed step.
    const finalH = this.surfaceHeight(nx, nz, ny, maxStep);
    if (Math.abs(finalH - ny) <= maxStep + 1e-4) ny = finalH;

    pos.x = nx;
    pos.y = ny;
    pos.z = nz;
  }
}
