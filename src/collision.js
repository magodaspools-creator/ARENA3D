import * as THREE from 'three';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/rapier.es.js';

await RAPIER.init();

const STATIC = 1;
const ACTOR = 2;
// Static colliders accept actors; actors accept static colliders.
// The previous STATIC↔STATIC / ACTOR↔ACTOR groups prevented Rapier's
// character controller from seeing the dungeon walls at the broad phase.
const STATIC_GROUPS = (STATIC << 16) | ACTOR;
const ACTOR_GROUPS = (ACTOR << 16) | STATIC;
const COLLISION_HEIGHT = 4.0;
const ACTOR_HALF_HEIGHT = 0.55;
const FLOOR_Y = -0.12;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Collision {
  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.controller = this.world.createCharacterController(0.025);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(Math.PI * 0.5);
    this.controller.setMinSlopeSlideAngle(Math.PI * 0.5);
    this.controller.enableAutostep(0.35, 0.22, false);
    // Autostep handles climbing; snap-to-ground is also required for descending
    // small steps without leaving the character floating above the lower surface.
    // Keep the same 0.35 limit so a larger drop is still blocked.
    this.controller.enableSnapToGround(0.35);

    this.zones = [];
    this.obstacles = [];
    this.actorColliders = new WeakMap();
    this.staticColliders = new Set();
    this.debugRoot = null;
    this.debug = false;

    // A real floor keeps the character controller grounded numerically.
    const floor = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(80, 0.12, 100)
        .setTranslation(0, FLOOR_Y, -10)
        .setCollisionGroups(STATIC_GROUPS),
    );
    floor.userData = STATIC;
    this.staticColliders.add(floor);
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
      collider: null,
    };

    const desc = RAPIER.ColliderDesc.cylinder(COLLISION_HEIGHT * 0.5, r)
      .setTranslation(x, COLLISION_HEIGHT * 0.5, z)
      .setCollisionGroups(STATIC_GROUPS)
      .setFriction(0);
    desc.setEnabled(o.enabled);

    o.collider = this.world.createCollider(desc);
    o.collider.userData = STATIC;
    this.staticColliders.add(o.collider);
    this.obstacles.push(o);
    o.setEnabled = (enabled) => {
      o.enabled = !!enabled;
      this.syncEnabled(o);
      this.refreshDebug();
      return o;
    };
    this.syncEnabled(o);
    this.refreshDebug();
    return o;
  }

  addBox(minX, maxX, minZ, maxZ, opts = {}) {
    const o = {
      type: 'box',
      minX, maxX, minZ, maxZ,
      enabled: opts.enabled ?? true,
      projectiles: opts.projectiles ?? true,
      // A step/altar can expose its real top height to Rapier. Normal boxes
      // remain full-height walls.
      height: Number.isFinite(opts.topY) ? Math.max(0.001, opts.topY) : (Number.isFinite(opts.height) ? Math.max(0.001, opts.height) : COLLISION_HEIGHT),
      collider: null,
    };

    const hx = Math.max(0.001, (maxX - minX) * 0.5);
    const hz = Math.max(0.001, (maxZ - minZ) * 0.5);
    const hh = o.height * 0.5;
    const desc = RAPIER.ColliderDesc.cuboid(hx, hh, hz)
      .setTranslation((minX + maxX) * 0.5, hh, (minZ + maxZ) * 0.5)
      .setCollisionGroups(STATIC_GROUPS)
      .setFriction(0);
    desc.setEnabled(o.enabled);

    o.collider = this.world.createCollider(desc);
    o.collider.userData = STATIC;
    this.staticColliders.add(o.collider);
    this.obstacles.push(o);
    o.setEnabled = (enabled) => {
      o.enabled = !!enabled;
      this.syncEnabled(o);
      this.refreshDebug();
      return o;
    };
    this.syncEnabled(o);
    this.refreshDebug();
    return o;
  }

  /** Oriented wall segment, used where the visual map has a real wall. */
  addWall(x1, z1, x2, z2, height = COLLISION_HEIGHT, thickness = 1.0, opts = {}) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return null;

    const angle = Math.atan2(dx, dz);
    const o = {
      type: 'wall',
      x1, z1, x2, z2, height, thickness,
      enabled: opts.enabled ?? true,
      projectiles: opts.projectiles ?? true,
      collider: null,
    };

    const desc = RAPIER.ColliderDesc.cuboid(thickness * 0.5, height * 0.5, len * 0.5)
      .setTranslation((x1 + x2) * 0.5, height * 0.5, (z1 + z2) * 0.5)
      .setRotation({ w: Math.cos(angle * 0.5), x: 0, y: Math.sin(angle * 0.5), z: 0 })
      .setCollisionGroups(STATIC_GROUPS)
      .setFriction(0);
    desc.setEnabled(o.enabled);

    o.collider = this.world.createCollider(desc);
    o.collider.userData = STATIC;
    this.staticColliders.add(o.collider);
    this.obstacles.push(o);
    o.setEnabled = (enabled) => {
      o.enabled = !!enabled;
      this.syncEnabled(o);
      this.refreshDebug();
      return o;
    };
    this.syncEnabled(o);
    this.refreshDebug();
    return o;
  }

  syncEnabled(o) {
    if (o.collider) o.collider.setEnabled(!!o.enabled);
  }

  /** Signed distance to the walkable area (negative = inside). Used by terrain/decor only. */
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

  obstacleHit(x, z, r, o) {
    if (!o.enabled) return false;

    if (o.type === 'circle') {
      const rr = o.r + r;
      return (x - o.x) ** 2 + (z - o.z) ** 2 < rr * rr;
    }

    if (o.type === 'wall') {
      const dx = o.x2 - o.x1;
      const dz = o.z2 - o.z1;
      const len2 = dx * dx + dz * dz;
      const t = clamp(((x - o.x1) * dx + (z - o.z1) * dz) / len2, 0, 1);
      const cx = o.x1 + dx * t;
      const cz = o.z1 + dz * t;
      const rr = r + o.thickness * 0.5;
      return (x - cx) ** 2 + (z - cz) ** 2 < rr * rr;
    }

    const cx = clamp(x, o.minX, o.maxX);
    const cz = clamp(z, o.minZ, o.maxZ);
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
  }

  blocked(x, z, r) {
    for (const o of this.obstacles) {
      if (!o.enabled || !o.projectiles) continue;
      if (this.obstacleHit(x, z, r, o)) return true;
    }
    return false;
  }

  getActorCollider(pos, radius) {
    let collider = this.actorColliders.get(pos);
    if (collider) {
      collider.setRadius(radius);
      return collider;
    }

    const desc = RAPIER.ColliderDesc.capsule(ACTOR_HALF_HEIGHT, radius)
      .setTranslation(pos.x, ACTOR_HALF_HEIGHT + radius, pos.z)
      .setCollisionGroups(ACTOR_GROUPS)
      .setFriction(0);

    collider = this.world.createCollider(desc);
    collider.userData = ACTOR;
    this.actorColliders.set(pos, collider);
    return collider;
  }

  /**
   * Rapier Kinematic Character Controller movement.
   *
   * The old implementation manually swept circles through an XZ list and
   * performed its own axis sliding/binary search. Rapier now owns that part:
   * the character is a capsule, movement is computed against the actual
   * static colliders, and the resulting translation is applied to the
   * Three.js position.
   */
  move(pos, dx, dz, radius) {
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-8) return;

    const collider = this.getActorCollider(pos, radius);
    collider.setTranslation({ x: pos.x, y: pos.y + ACTOR_HALF_HEIGHT + radius, z: pos.z });

    this.controller.computeColliderMovement(
      collider,
      { x: dx, y: 0, z: dz },
      undefined,
      undefined,
      (other) => this.staticColliders.has(other),
    );

    const movement = this.controller.computedMovement();
    pos.x += movement.x;
    pos.y += movement.y;
    pos.z += movement.z;

    // Keep the kinematic capsule at the resulting ground height. This is
    // essential for descending steps: Rapier reports the downward snap in Y.
    collider.setTranslation({ x: pos.x, y: pos.y + ACTOR_HALF_HEIGHT + radius, z: pos.z });
  }

  /**
   * Resolve an already-overlapping body using Rapier's character controller.
   * Kept intentionally small because normal movement no longer needs manual
   * obstacle resolution.
   */
  resolveObstacles(x, z, r) {
    const probe = { x, y: ACTOR_HALF_HEIGHT + r, z };
    const collider = RAPIER.ColliderDesc.capsule(ACTOR_HALF_HEIGHT, r)
      .setTranslation(probe.x, probe.y, probe.z)
      .setCollisionGroups(ACTOR_GROUPS);
    const temp = this.world.createCollider(collider);
    temp.userData = ACTOR;

    this.controller.computeColliderMovement(
      temp,
      { x: 0, y: 0, z: 0 },
      undefined,
      undefined,
      (other) => this.staticColliders.has(other),
    );
    this.world.removeCollider(temp, true);

    const movement = this.controller.computedMovement();
    return { x: x + movement.x, z: z + movement.z };
  }

  toggleDebug(scene) {
    this.debug = !this.debug;

    if (!this.debug) {
      this.debugRoot?.removeFromParent();
      this.debugRoot = null;
      return;
    }

    this.debugRoot = new THREE.Group();
    this.debugRoot.name = 'Rapier Collision Debug';
    scene.add(this.debugRoot);
    this.refreshDebug();
  }

  refreshDebug() {
    if (!this.debug || !this.debugRoot) return;

    while (this.debugRoot.children.length) {
      const child = this.debugRoot.children.pop();
      child.geometry?.dispose();
      child.material?.dispose();
    }

    for (const o of this.obstacles) {
      if (!o.enabled) continue;
      if (o.type === 'circle') {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(o.r, o.r, COLLISION_HEIGHT, 20, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xff3040, wireframe: true, transparent: true, opacity: 0.6 }),
        );
        mesh.position.set(o.x, COLLISION_HEIGHT * 0.5, o.z);
        this.debugRoot.add(mesh);
      } else if (o.type === 'box') {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.maxX - o.minX, COLLISION_HEIGHT, o.maxZ - o.minZ),
          new THREE.MeshBasicMaterial({ color: 0xff3040, wireframe: true, transparent: true, opacity: 0.6 }),
        );
        mesh.position.set((o.minX + o.maxX) * 0.5, COLLISION_HEIGHT * 0.5, (o.minZ + o.maxZ) * 0.5);
        this.debugRoot.add(mesh);
      } else if (o.type === 'wall') {
        const len = Math.hypot(o.x2 - o.x1, o.z2 - o.z1);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.thickness, o.height, len),
          new THREE.MeshBasicMaterial({ color: 0xff3040, wireframe: true, transparent: true, opacity: 0.6 }),
        );
        mesh.position.set((o.x1 + o.x2) * 0.5, o.height * 0.5, (o.z1 + o.z2) * 0.5);
        mesh.rotation.y = Math.atan2(o.x2 - o.x1, o.z2 - o.z1);
        this.debugRoot.add(mesh);
      }
    }
  }
}
