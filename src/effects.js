import * as THREE from 'three';

// Visual effects: a pooled GPU particle system plus short-lived meshes
// (slashes, shockwaves, ground telegraphs).

const MAX = 5000;
const tmpColor = new THREE.Color();

class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(this.pos, 3));
    geo.setAttribute('aColor', attr(this.col, 3));
    geo.setAttribute('aSize', attr(this.size, 1));
    geo.setAttribute('aAlpha', attr(this.alpha, 1));
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uH: { value: innerHeight } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha; uniform float uH;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * projectionMatrix[1][1] * uH * 0.5 / -mv.z;
          gl_Position = projectionMatrix * mv;
          vColor = aColor; vAlpha = aAlpha;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * (1.0 + a), a * a * vAlpha);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, color, life, size, grav = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % MAX;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    tmpColor.set(color);
    this.col[i3] = tmpColor.r; this.col[i3 + 1] = tmpColor.g; this.col[i3 + 2] = tmpColor.b;
    this.life[i] = this.max[i] = life;
    this.size0[i] = size;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const i3 = i * 3;
      const dr = 1 - this.drag[i] * dt;
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.alpha[i] = k * Math.min(1, (1 - k) * 10);
      this.size[i] = this.size0[i] * (0.35 + 0.65 * k);
    }
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[n].needsUpdate = true;
  }
}

const decalMat = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
});

export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.particles = new Particles(game.scene);
    this.items = [];
  }
  resize(h) { this.particles.material.uniforms.uH.value = h; }

  /** Generic particle emitter. */
  emit(pos, { count = 10, color = 0xffffff, speed = 2, spread = 0.2, up = 0, life = 0.8, size = 0.3, gravity = 0, drag = 1.5, flat = false } = {}) {
    const P = this.particles;
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2, v = flat ? Math.PI / 2 : Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.4 + Math.random() * 0.6);
      const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u);
      P.spawn(
        pos.x + dx * spread, pos.y + dy * spread, pos.z + dz * spread,
        dx * sp, dy * sp + up, dz * sp,
        color, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), gravity, drag,
      );
    }
  }
  hitSpark(pos, color) {
    this.emit(pos, { count: 14, color, speed: 6, life: 0.35, size: 0.28, drag: 4 });
    this.emit(pos, { count: 4, color: 0xffffff, speed: 2, life: 0.2, size: 0.5 });
  }

  damageImpact(pos, { color = 0xffffff, type = 'physical', crit = false } = {}) {
    const palette = type === 'magic'
      ? { core: 0xc98cff, accent: color }
      : { core: 0xffe8b0, accent: color };
    const count = crit ? 26 : 14;
    this.emit(pos, { count, color: palette.accent, speed: crit ? 8 : 6, life: crit ? 0.5 : 0.32, size: crit ? 0.36 : 0.25, drag: 4 });
    this.emit(pos, { count: crit ? 8 : 4, color: palette.core, speed: crit ? 3 : 2, life: 0.22, size: crit ? 0.55 : 0.42 });
    if (type === 'magic') this.ring(pos, palette.accent, crit ? 1.25 : 0.8, crit ? 0.42 : 0.25, 0.35);
    if (crit) {
      this.ring(pos, 0xffd45c, 1.5, 0.5, 0.4);
      this.emit(pos, { count: 10, color: 0xffd45c, speed: 5, up: 2, life: 0.55, size: 0.3, gravity: 3, drag: 3 });
    }
  }

  add(obj, life, update) {
    this.scene.add(obj);
    const item = { obj, t: 0, life, update };
    this.items.push(item);
    return item;
  }
  remove(item) { item.t = item.life; }

  /** Crescent slash in front of an attacker. */
  slash(pos, dir, range, arc, color) {
    const theta = Math.atan2(-dir.z, dir.x);
    const geo = new THREE.RingGeometry(range * 0.35, range, 24, 1, theta - arc / 2, arc);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, decalMat(color, 0.85));
    m.position.set(pos.x, 1.0, pos.z);
    this.add(m, 0.22, (it, p) => {
      m.material.opacity = 0.85 * (1 - p);
      m.scale.setScalar(0.8 + p * 0.35);
      m.rotation.y = (p - 0.5) * 0.5;
    });
  }

  /** Expanding ground ring. */
  ring(pos, color, radius, life = 0.5, y = 0.08) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), decalMat(color, 0.9));
    m.position.set(pos.x, y, pos.z);
    this.add(m, life, (it, p) => {
      m.scale.setScalar(0.2 + radius * (1 - (1 - p) * (1 - p)));
      m.material.opacity = 0.9 * (1 - p);
    });
  }

  /** Red ground warning that fills up; the hit lands when it is full. */
  telegraphCircle(pos, radius, duration, color = 0xff2a1a) {
    const g = new THREE.Group();
    g.position.set(pos.x, 0.06, pos.z);
    const edge = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius, 48).rotateX(-Math.PI / 2), decalMat(color, 0.9));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), decalMat(color, 0.35));
    g.add(edge, fill);
    return this.add(g, duration, (it, p) => {
      fill.scale.setScalar(Math.max(0.01, p));
      edge.material.opacity = 0.6 + 0.4 * Math.sin(it.t * 20);
    });
  }

  telegraphCone(pos, yaw, radius, arc, duration, color = 0xff2a1a) {
    const theta = Math.atan2(-Math.cos(yaw), Math.sin(yaw));
    const g = new THREE.Group();
    g.position.set(pos.x, 0.06, pos.z);
    const edge = new THREE.Mesh(new THREE.RingGeometry(radius * 0.95, radius, 32, 1, theta - arc / 2, arc).rotateX(-Math.PI / 2), decalMat(color, 0.9));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 32, theta - arc / 2, arc).rotateX(-Math.PI / 2), decalMat(color, 0.35));
    g.add(edge, fill);
    return this.add(g, duration, (it, p) => {
      fill.scale.setScalar(Math.max(0.01, p));
      edge.material.opacity = 0.6 + 0.4 * Math.sin(it.t * 20);
    });
  }

  /** Vertical beam of light (loot/victory/heal). */
  beam(pos, color, height = 8, life = 1.2, radius = 0.6) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16, 1, true), decalMat(color, 0.6));
    m.position.set(pos.x, height / 2, pos.z);
    this.add(m, life, (it, p) => {
      m.material.opacity = 0.6 * (1 - p);
      m.scale.set(1 - p * 0.7, 1, 1 - p * 0.7);
    });
  }

  update(dt) {
    this.particles.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const p = Math.min(1, it.t / it.life);
      if (it.update) it.update(it, p, dt);
      if (it.t >= it.life) {
        this.scene.remove(it.obj);
        it.obj.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
        this.items.splice(i, 1);
      }
    }
  }
}
