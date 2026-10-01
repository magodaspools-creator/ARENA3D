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
    const o = { type: 'box', minX, maxX, minZ, maxZ, enabled: opts.enabled ?? true, projectiles: opts.projectiles ?? true };
    this.obstacles.push(o);
    return o;
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

  /** Moves pos (Vector3, XZ only) with wall sliding and obstacle resolution. */
  move(pos, dx, dz, r) {
    const lim = -r;
    let nx = pos.x;
    let nz = pos.z;

    const tryX = pos.x + dx;
    if (this.inside(tryX, nz, lim)) nx = tryX;

    const tryZ = pos.z + dz;
    if (this.inside(nx, tryZ, lim)) nz = tryZ;

    if (nx === pos.x && nz !== pos.z && dx !== 0) {
      const retryX = pos.x + dx;
      if (this.inside(retryX, nz, lim)) nx = retryX;
    }

    for (let it = 0; it < 2; it++) {
      for (const o of this.obstacles) {
        if (!o.enabled) continue;
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
    }
    pos.x = nx;
    pos.z = nz;
  }
}
