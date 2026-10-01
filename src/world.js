import * as THREE from 'three';
import { mat, glow, mesh } from './models.js';

// Reusable world-building blocks. Area files (src/areas/*) compose these
// into a level; nothing here knows about a specific map.

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, z) => noise2(x, z) * 0.6 + noise2(x * 2.1, z * 2.1) * 0.3 + noise2(x * 4.3, z * 4.3) * 0.1;
export const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function distToPath(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/** Terrain is flat where you can walk and rolls into hills outside. */
export class Terrain {
  constructor(collision) { this.collision = collision; }
  height(x, z) {
    const d = this.collision.sdf(x, z);
    if (d < 0.8) return 0;
    return smooth((d - 0.8) / 7) * (0.5 + fbm(x * 0.07, z * 0.07) * 3.4);
  }
}

export function createGround(scene, terrain, colorAt, { width = 200, depth = 200, cx = 0, cz = -10, seg = 130 } = {}) {
  const geo = new THREE.PlaneGeometry(width, depth, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    pos.setXYZ(i, x, terrain.height(x, z) - 0.01, z);
    colorAt(x, z, c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

/** Collects transforms and turns them into a single InstancedMesh. */
export class Batch {
  constructor(geo, material, { shadow = true } = {}) {
    this.geo = geo; this.material = material; this.items = []; this.shadow = shadow;
  }
  add(x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, color = null, rx = 0, rz = 0) {
    this.items.push({ x, y, z, sx, sy, sz, rx, ry, rz, color });
  }
  build(scene) {
    if (!this.items.length) return null;
    const m = new THREE.InstancedMesh(this.geo, this.material, this.items.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    this.items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(it.rx, it.ry, it.rz);
      o.scale.set(it.sx, it.sy, it.sz);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (it.color !== null) m.setColorAt(i, c.set(it.color));
    });
    m.castShadow = this.shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
}

const PINE = {
  trunk: new THREE.CylinderGeometry(0.14, 0.24, 1.4, 5).translate(0, 0.7, 0),
  t1: new THREE.ConeGeometry(1.25, 1.8, 7).translate(0, 1.9, 0),
  t2: new THREE.ConeGeometry(0.95, 1.55, 7).translate(0, 2.8, 0),
  t3: new THREE.ConeGeometry(0.6, 1.35, 7).translate(0, 3.6, 0),
};
const LEAF_COLORS = [0x1c3a2a, 0x224532, 0x1a332e, 0x2a4a30, 0x19302a];

/** Everything decorative that can be instanced lives here. */
export class Decor {
  constructor() {
    this.trunks = new Batch(PINE.trunk, mat(0x3b2a1e));
    this.leaves = [PINE.t1, PINE.t2, PINE.t3].map((g) => new Batch(g, mat(0xffffff)));
    this.rocks = new Batch(new THREE.DodecahedronGeometry(1, 0), mat(0xffffff));
    this.grass = new Batch(new THREE.ConeGeometry(0.07, 0.55, 3).translate(0, 0.27, 0), mat(0xffffff), { shadow: false });
    this.stems = new Batch(new THREE.CylinderGeometry(0.035, 0.05, 0.26, 5).translate(0, 0.13, 0), mat(0xcfc8b0), { shadow: false });
    this.caps = new Batch(new THREE.SphereGeometry(0.15, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), glow(0x3affd2, 1.6), { shadow: false });
    this.blocks = new Batch(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff));
    this.columns = new Batch(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), mat(0xffffff));
    this.tiles = new Batch(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff), { shadow: false });
  }
  pine(x, y, z, s, r) {
    const ry = r() * Math.PI * 2;
    this.trunks.add(x, y, z, s, s, s, ry);
    const col = LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)];
    for (const b of this.leaves) b.add(x, y, z, s, s * (0.9 + r() * 0.25), s, ry, col);
  }
  rock(x, y, z, s, r, color = 0x55585c) {
    this.rocks.add(x, y + s * 0.3, z, s * (0.8 + r() * 0.6), s * (0.5 + r() * 0.5), s * (0.8 + r() * 0.6), r() * 6, color, r() * 0.5, r() * 0.5);
  }
  tuft(x, y, z, r) {
    const col = [0x2e4a26, 0x3a5a2c, 0x26401f, 0x44602f][Math.floor(r() * 4)];
    for (let i = 0; i < 4; i++) {
      this.grass.add(x + (r() - 0.5) * 0.35, y, z + (r() - 0.5) * 0.35, 1, 0.6 + r() * 0.8, 1, r() * 6, col, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6);
    }
  }
  mushrooms(x, y, z, r) {
    const n = 2 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const s = 0.6 + r() * 0.9, px = x + (r() - 0.5) * 1.2, pz = z + (r() - 0.5) * 1.2;
      this.stems.add(px, y, pz, s);
      this.caps.add(px, y + 0.24 * s, pz, s, s * 0.8, s);
    }
  }
  /** Ruined wall from (x1,z1) to (x2,z2) made of uneven stone blocks. */
  wall(x1, z1, x2, z2, h, r, { thick = 1.1, minH = 0.45 } = {}) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 1.6));
    const ang = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const bh = h * (minH + r() * (1 - minH));
      const col = r() < 0.2 ? 0x4c5a48 : [0x5b5e64, 0x666970, 0x50535a][Math.floor(r() * 3)];
      this.blocks.add(x1 + (x2 - x1) * t, bh / 2, z1 + (z2 - z1) * t, thick * (0.9 + r() * 0.2), bh, len / n + 0.05, ang, col);
      if (r() < 0.3) this.blocks.add(x1 + (x2 - x1) * t + (r() - 0.5) * 2.5, 0.2, z1 + (z2 - z1) * t + (r() - 0.5) * 2.5, 0.5, 0.4, 0.6, r() * 3, 0x55585e);
    }
  }
  column(x, z, h, r, broken = false) {
    this.blocks.add(x, 0.25, z, 1.5, 0.5, 1.5, 0, 0x55585e);
    this.columns.add(x, 0.5, z, 1.2, h, 1.2, r() * 0.5, broken ? 0x5f6167 : 0x6a6d74);
    if (!broken) this.blocks.add(x, h + 0.7, z, 1.6, 0.4, 1.6, 0, 0x5a5d63);
    else this.blocks.add(x + 1.4, 0.35, z + 0.6, 0.9, 0.7, 1.4, r() * 3, 0x5f6167);
  }
  build(scene) {
    this.trunks.build(scene);
    this.leaves.forEach((b) => b.build(scene));
    for (const b of [this.rocks, this.grass, this.stems, this.caps, this.blocks, this.columns, this.tiles]) b.build(scene);
  }
}

export function deadTree(scene, x, z, s = 1, r = Math.random) {
  const g = new THREE.Group();
  const m = mat(0x2e2620);
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.3, 3.2, 5), m, 0, 1.6, 0);
  trunk.rotation.z = (r() - 0.5) * 0.2;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.04, 0.1, 1.5, 4), m);
    const a = (i / 4) * Math.PI * 2 + r();
    b.position.set(Math.cos(a) * 0.4, 2.2 + i * 0.3, Math.sin(a) * 0.4);
    b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(b);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Interactive / animated set pieces

export function createCampfire(game, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  for (let i = 0; i < 4; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 5), mat(0x3a2616), 0, 0.12, 0);
    log.rotation.set(Math.PI / 2 - 0.25, (i / 4) * Math.PI * 2, 0);
    g.add(log);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(mesh(new THREE.DodecahedronGeometry(0.17, 0), mat(0x55585c), Math.cos(a) * 0.72, 0.08, Math.sin(a) * 0.72));
  }
  const flames = [];
  const fm = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.28 - i * 0.06, 0.9 + i * 0.2, 6), fm);
    f.position.y = 0.45 + i * 0.1;
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3a, 40, 18, 1.6);
  light.position.y = 1.2;
  g.add(light);
  game.scene.add(g);
  game.collision.addCircle(x, z, 0.9, { projectiles: false });
  const pos = new THREE.Vector3(x, 0.6, z);
  return {
    pos,
    update(dt, t) {
      flames.forEach((f, i) => {
        f.scale.set(1 + Math.sin(t * 13 + i) * 0.1, 1 + Math.sin(t * 9 + i * 2) * 0.2, 1);
        f.rotation.y = t * (1 + i);
      });
      light.intensity = 38 + Math.sin(t * 11) * 5 + Math.sin(t * 23) * 3;
      if (Math.random() < 0.35) game.fx.particles.spawn(x + (Math.random() - 0.5) * 0.5, 0.8, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5, 1.2 + Math.random(), (Math.random() - 0.5) * 0.5, 0xff8a3a, 1.4, 0.2, 0, 0.3);
    },
  };
}

/** Watchfire brazier: corrupted (green, dim) until the player lights it. */
export function createBrazier(game, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.35, 8), mat(0x55585e), 0, 0.17, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.55, 1.1, 8), mat(0x62656c), 0, 0.9, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.8, 0.45, 0.4, 8, 1, true), mat(0x2a2522, { metal: 0.7, rough: 0.5, side: THREE.DoubleSide }), 0, 1.65, 0));
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 4, 8), glow(0x3aff9a, 1.2));
  rune.position.y = 0.95; rune.rotation.x = Math.PI / 2;
  g.add(rune);
  const fm = new THREE.MeshBasicMaterial({ color: 0x3aff9a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.45 - i * 0.1, 1.1 + i * 0.35, 6), fm);
    f.position.y = 2.1 + i * 0.12;
    f.scale.setScalar(0.4);
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight(0x3aff9a, 6, 12, 1.6);
  light.position.y = 2.6;
  g.add(light);
  game.scene.add(g);
  game.collision.addCircle(x, z, 1.0);

  const b = {
    pos: new THREE.Vector3(x, 0, z), lit: false, litT: 0,
    light() {
      b.lit = true;
      fm.color.set(0xffa040);
      fm.opacity = 0.9;
      rune.material = glow(0xffb45a, 2.5);
      light.color.set(0xff9a4a);
      game.fx.emit(new THREE.Vector3(x, 2.2, z), { count: 60, color: 0xffa040, speed: 7, up: 2, life: 1, size: 0.5 });
      game.fx.ring(b.pos, 0xffa040, 7, 0.8);
      game.fx.beam(b.pos, 0xffc36a, 10, 1.5, 0.8);
    },
    update(dt, t) {
      if (b.lit) b.litT = Math.min(1, b.litT + dt * 2);
      const s = b.lit ? 0.4 + 0.6 * b.litT : 0.4;
      flames.forEach((f, i) => {
        f.scale.set(s * (1 + Math.sin(t * 12 + i) * 0.1), s * (1 + Math.sin(t * 8 + i * 2) * 0.18), s);
        f.rotation.y = t * (1 + i);
      });
      light.intensity = b.lit ? 30 + Math.sin(t * 11) * 4 : 5 + Math.sin(t * 3) * 1.5;
      if (Math.random() < (b.lit ? 0.4 : 0.15)) {
        game.fx.particles.spawn(x + (Math.random() - 0.5) * 0.8, 2.3, z + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.4, 1 + Math.random(), (Math.random() - 0.5) * 0.4, b.lit ? 0xff8a3a : 0x3aff9a, 1.5, b.lit ? 0.22 : 0.35, 0, 0.3);
      }
    },
  };
  return b;
}

/** Sealed gate: portcullis + magic seal. open() animates and removes the collider. */
export function createGate(game, x, z, width = 7) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const stone = mat(0x5e6168);
  const hw = width / 2;
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(1.5, 7.5, 1.6), stone, s * (hw + 0.75), 3.75, 0));
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.6, 2), stone, s * (hw + 0.75), 7.8, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(width + 3.4, 1.3, 1.8), stone, 0, 8.3, 0));
  const bars = new THREE.Group();
  const iron = mat(0x2a2a2e, { metal: 0.8, rough: 0.45 });
  for (let bx = -hw + 0.35; bx <= hw - 0.3; bx += 0.62) bars.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 7, 5), iron, bx, 3.5, 0));
  for (const by of [1.2, 3.4, 5.6]) bars.add(mesh(new THREE.BoxGeometry(width, 0.14, 0.14), iron, 0, by, 0));
  g.add(bars);
  const seal = new THREE.Group();
  seal.position.set(0, 3.4, 0.35);
  const sm = new THREE.MeshBasicMaterial({ color: 0xb45aff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  seal.add(new THREE.Mesh(new THREE.RingGeometry(1.7, 1.95, 6), sm));
  seal.add(new THREE.Mesh(new THREE.RingGeometry(1.0, 1.12, 3), sm));
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.02, 3), sm);
  inner.rotation.z = Math.PI;
  seal.add(inner);
  g.add(seal);
  const light = new THREE.PointLight(0xb45aff, 20, 14, 1.6);
  light.position.set(0, 3.4, 1.2);
  g.add(light);
  game.scene.add(g);
  const collider = game.collision.addBox(x - hw, x + hw, z - 0.45, z + 0.45);

  const gate = {
    pos: new THREE.Vector3(x, 0, z), open: false, openT: 0,
    openGate() {
      if (gate.open) return;
      gate.open = true;
      game.fx.emit(new THREE.Vector3(x, 3.4, z + 0.4), { count: 120, color: 0xb45aff, speed: 9, life: 1.2, size: 0.5 });
    },
    update(dt, t) {
      seal.rotation.z = t * 0.4;
      seal.children[1].rotation.z = -t * 0.9;
      if (!gate.open) { light.intensity = 18 + Math.sin(t * 3) * 4; return; }
      gate.openT = Math.min(1, gate.openT + dt / 2.6);
      const k = gate.openT;
      seal.scale.setScalar(Math.max(0.001, 1 - k * 3));
      light.intensity = 20 * (1 - k);
      bars.position.y = -6.8 * smooth(k);
      if (k < 1 && Math.random() < 0.5) game.fx.emit(new THREE.Vector3(x + (Math.random() - 0.5) * width, 0.2, z), { count: 1, color: 0x8a7a66, speed: 1, up: 1, life: 1, size: 0.8 });
      if (k >= 1) collider.setEnabled(false);
    },
  };
  return gate;
}

/** Swirling exit portal. Hidden until rise() is called. */
export function createPortal(game, x, z) {
  const g = new THREE.Group();
  g.position.set(x, -6, z);
  g.visible = false;
  g.add(mesh(new THREE.CylinderGeometry(2.6, 3, 0.5, 10), mat(0x4a4d55), 0, 0.25, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.2, 8, 48), glow(0x6ae0ff, 3));
  ring.position.y = 2.8;
  g.add(ring);
  const swirl = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float s = sin(a * 5.0 + uTime * 3.0 - r * 12.0) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.05, 0.35, 0.9), vec3(0.6, 1.0, 1.0), s * (1.0 - r * 0.5));
        float alpha = smoothstep(1.0, 0.7, r) * (0.55 + 0.45 * s);
        gl_FragColor = vec4(c * 1.6, alpha); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), swirl);
  disc.position.y = 2.8;
  g.add(disc);
  const light = new THREE.PointLight(0x6ae0ff, 0, 18, 1.4);
  light.position.y = 3;
  g.add(light);
  game.scene.add(g);

  const portal = {
    pos: new THREE.Vector3(x, 0, z), active: false, riseT: 0, group: g,
    rise() { g.visible = true; portal.rising = true; },
    update(dt, t) {
      if (!g.visible) return;
      swirl.uniforms.uTime.value = t;
      ring.rotation.z = t * 0.3;
      if (portal.rising) {
        portal.riseT = Math.min(1, portal.riseT + dt / 3);
        g.position.y = -6 * (1 - smooth(portal.riseT));
        game.rig.shake(0.08);
        if (portal.riseT >= 1) { portal.rising = false; portal.active = true; }
      }
      light.intensity = portal.riseT * (30 + Math.sin(t * 4) * 5);
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        game.fx.particles.spawn(x + Math.cos(a) * 2.1, g.position.y + 2.8 + Math.sin(a) * 2.1, z,
          -Math.cos(a) * 0.8, -Math.sin(a) * 0.8 + 0.3, 0, 0x6ae0ff, 1.2, 0.3, 0, 0.2);
      }
    },
  };
  return portal;
}

export function createRuneStone(game, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const s = mesh(new THREE.BoxGeometry(1.2, 3.2, 0.7), mat(0x4e5258), 0, 1.5, 0);
  s.rotation.set(0.05, 0.3, 0.06);
  g.add(s);
  const top = mesh(new THREE.ConeGeometry(0.72, 0.8, 4), mat(0x4e5258), 0, 3.4, 0);
  top.rotation.y = Math.PI / 4 + 0.3;
  g.add(top);
  const rm = glow(0x6ab8ff, 2.2);
  for (let i = 0; i < 4; i++) {
    const r = mesh(new THREE.BoxGeometry(0.5 - (i % 2) * 0.2, 0.08, 0.05), rm, 0, 0.9 + i * 0.5, 0.37);
    r.castShadow = false;
    s.add(r);
    r.position.y = -0.7 + i * 0.45;
  }
  const light = new THREE.PointLight(0x6ab8ff, 8, 7, 1.6);
  light.position.set(0, 1.6, 1.2);
  g.add(light);
  game.scene.add(g);
  game.collision.addCircle(x, z, 0.8);
  return { pos: new THREE.Vector3(x, 0, z), anchor: new THREE.Vector3(x, 3.9, z) };
}

export function createSign(game, x, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const wood = mat(0x4a3220);
  g.add(mesh(new THREE.BoxGeometry(0.14, 2, 0.14), wood, 0, 1, 0));
  const board = mesh(new THREE.BoxGeometry(1.4, 0.45, 0.08), mat(0x6a4a2a), 0.45, 1.65, 0);
  board.rotation.z = -0.06;
  g.add(board);
  game.scene.add(g);
  game.collision.addCircle(x, z, 0.3, { projectiles: false });
}
