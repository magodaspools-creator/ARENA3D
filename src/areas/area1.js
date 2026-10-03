import * as THREE from 'three';
import {
  rng, fbm, smooth, distToPath, Terrain, createGround, Decor, deadTree,
  createCampfire, createBrazier, createGate, createPortal, createRuneStone, createSign, createChest, createSecretGate, createLever,
} from '../world.js';
import { NPC } from '../npc.js';
import { Enemy } from '../enemy.js';
import { Boss } from '../boss.js';
import { MineBoss } from '../mine-boss.js';
import { Progression } from '../progression.js';

// Area 1 — Forest of Vhal.
// Layout (north = -Z, the player walks "up" the screen):
//   Entrance clearing + NPC (z 45..25) → forest path (z 25..13) →
//   ruined courtyard with 3 Watchfires (z 13..-20) → sealed gate →
//   corridor → circular boss arena (center z -44) → exit portal.

const PATH = [[0, 46], [0.5, 38], [-2.5, 30], [1.5, 22], [-0.5, 14], [0, 6], [0, -20], [0, -31]];
const ARENA = { x: 0, z: -44, r: 15 };
export const BOSS_KEY = 'arena.proto.bossKills';

export function createArea1(game) {
  const { scene, collision } = game;
  const r = rng(1337);

  // ---------- walkable space ----------
  collision.addRectZone(-14, 14, 10, 47);   // forest entrance (overlap keeps the north branch walkable)
  // Expanded exploration branches. These connect to the main entrance/courtyard
  // but deliberately stay outside the Morvhal arena and boss trigger corridor.
  // West route: this MUST overlap the main entrance and courtyard by area,
  // not merely touch at x=-14. Player radius is 0.45, so a zero-width
  // zone junction behaves like an invisible wall.
  collision.addRectZone(-32, -11, 10, 34);   // west forest connector
  collision.addRectZone(-34, -12.5, 28, 45);  // cemetery route overlaps the main entrance so no invisible square gap remains
  // Wider doorway into the Hanging Grove. The old tree stood here and its
  // collider could make the opening feel like an invisible wall.
  // Wider doorway into the Hanging Grove. It overlaps the connector by
  // several meters so the player can actually pass with collision radius.
  collision.addRectZone(-34, -21, 6, 20);
  collision.addRectZone(-40, -23, -16, 18);  // hanging grove
  collision.addRectZone(-18, 18, 44, 58);    // northern ruins extension (overlaps entrance)
  collision.addRectZone(-35, -18, 34, 58);   // expanded northern-left cemetery field
  collision.addRectZone(-22, 22, -20, 13);  // courtyard
  collision.addRectZone(-3, 3, -32, -18);   // corridor
  // Expanded forecourt OUTSIDE the boss arena. This is the pause/lore space
  // before the player crosses the arena threshold.
  collision.addRectZone(-11, 11, -31, -20);  // pre-arena forecourt
  // Hidden east passage / secret chamber: closed behind the secret gate, then
  // opens into a larger side room instead of a tiny empty square.
  collision.addRectZone(14, 38, 4, 16);
  collision.addCircleZone(ARENA.x, ARENA.z, ARENA.r);
  // Upper courtyard wall: leave a real, visible doorway for the west route.
  // The gameplay opening and the visual opening are intentionally identical.
  collision.addBox(-23, -19.0, 12.9, 14.3);
  collision.addBox(-12.0, -6.2, 12.9, 14.3);
  collision.addBox(6.2, 23, 12.9, 14.3);

  const terrain = new Terrain(collision);
  const cA = new THREE.Color(0x15241a), cB = new THREE.Color(0x2a4026), dirt = new THREE.Color(0x3b2e22), stone = new THREE.Color(0x26272b);
  createGround(scene, terrain, (x, z, c) => {
    c.copy(cA).lerp(cB, fbm(x * 0.13, z * 0.13));
    const pd = distToPath(x, z, PATH);
    if (pd < 2.8) c.lerp(dirt, smooth(1 - pd / 2.8) * 0.85);
    if (x > -23 && x < 23 && z > -21 && z < 13.5) c.lerp(stone, 0.75);
    if (Math.hypot(x - ARENA.x, z - ARENA.z) < 16) c.lerp(stone, 0.85);
    const d = collision.sdf(x, z);
    if (d > 2) c.multiplyScalar(1 - Math.min(0.55, (d - 2) * 0.05));
  });

  const decor = new Decor();

  // ---------- forest ring (instanced pines) ----------
  const trees = [];
  const farEnough = (x, z, min) => trees.every((t) => Math.hypot(t[0] - x, t[1] - z) > min);
  for (let i = 0; i < 5000 && trees.length < 520; i++) {
    const x = -48 + r() * 96, z = -72 + r() * 128;
    const d = collision.sdf(x, z);
    if (d < 1.3 || d > 16) continue;
    if (x > -24 && x < 24 && z > -22 && z < 14.5) continue; // inside courtyard walls
    if (Math.hypot(x - ARENA.x, z - ARENA.z) < 18.5) continue;
    if (!farEnough(x, z, 1.5 + d * 0.08)) continue;
    trees.push([x, z]);
    decor.pine(x, terrain.height(x, z), z, 0.9 + r() * 0.9 + d * 0.03, r);
  }
  // Entrance trees are real gameplay obstacles.
  for (const [x, z, s] of [[-9, 40, 1.3], [9.5, 37, 1.5], [10.5, 29, 1.2], [-8.5, 26, 1.4], [-11, 19, 1.3], [7.5, 14.5, 1.1], [11.5, 43, 1.2], [-12, 33, 1.5], [6, 32, 1.0], [-6, 16, 1.0]]) {
    decor.pine(x, 0, z, s, r);
    collision.addCircle(x, z, 0.45 * s);
  }
  // The old tree at the west doorway is intentionally not a gameplay obstacle.
  // The opening itself is the passage into the Hanging Grove.
  decor.pine(-25, 0, 8, 1.4, r);
  // Keep the former tree position at the grove doorway visually clear.
  // Its collision used to behave like an invisible barrier at the entrance.
  for (const [x, z, s] of [[-5.5, 21, 1.1], [12, 18, 1.4], [6.5, 40, 0.8], [-12.5, 12, 1.2], [4, 26.5, 0.6]]) {
    decor.rock(x, 0, z, s, r);
    collision.addCircle(x, z, s * 0.95);
  }
  for (let i = 0; i < 70; i++) {
    const x = -46 + r() * 92, z = -70 + r() * 124, d = collision.sdf(x, z);
    if (d > 0.5 && d < 12) decor.rock(x, terrain.height(x, z), z, 0.4 + r() * 1.2, r, [0x4a4d52, 0x55585c, 0x3f4a42][Math.floor(r() * 3)]);
  }
  // grass + glowing mushrooms
  for (let i = 0; i < 1400; i++) {
    const x = -30 + r() * 60, z = -64 + r() * 112;
    const d = collision.sdf(x, z);
    if (d > 7 || distToPath(x, z, PATH) < 2.2) continue;
    if (x > -23.5 && x < 23.5 && z > -21.5 && z < 14) continue;
    if (Math.hypot(x - ARENA.x, z - ARENA.z) < 17) continue;
    decor.tuft(x, terrain.height(x, z), z, r);
  }
  for (let i = 0; i < 400; i++) {
    const x = -30 + r() * 60, z = -64 + r() * 112, d = collision.sdf(x, z);
    if (d < 0.5 || d > 4) continue;
    if (x > -24 && x < 24 && z > -22 && z < 14.5 && !(z > 12)) continue;
    if (r() < 0.12) decor.mushrooms(x, terrain.height(x, z), z, r);
  }

  // ---------- expanded pre-arena forecourt ----------
  decor.wall(-10.5, -30.8, -10.5, -21.0, 3.2, r, { minH: 0.45 });
  decor.wall(10.5, -30.8, 10.5, -21.0, 3.2, r, { minH: 0.45 });
  // Match the two visible walls with gameplay colliders. The walkable zone
  // alone must not be responsible for making these walls feel solid.
  collision.addBox(-11.1, -9.9, -31.3, -20.5);
  collision.addBox(9.9, 11.1, -31.3, -20.5);
  for (const [x, z, h, broken] of [[-8.2, -28.6, 3.4, true], [8.2, -28.6, 3.8, false], [-7.2, -22.2, 2.8, true], [7.2, -22.2, 3.1, true]]) {
    decor.column(x, z, h, r, broken);
    collision.addCircle(x, z, 0.9);
  }
  // ---------- expanded exploration: Hanging Grove (west) ----------
  // A large optional branch with its own visual identity and multiple return
  // paths. It is exploration space, not another mandatory quest corridor.
  decor.wall(-39.5, -16.5, -39.5, 17.5, 3.4, r, { minH: 0.25 });
  decor.wall(-39.5, 17.5, -27, 18, 3.0, r, { minH: 0.35 });
  decor.wall(-27, -16.5, -39.5, -16.5, 2.6, r, { minH: 0.25 });
  // Perimeter colliders. There is intentionally NO right-side wall collider:
  // that edge is the exploration entrance back to the main map.
  collision.addBox(-40.1, -38.9, -17.1, 18.1);
  collision.addBox(-40.1, -26.5, 17.4, 18.6);
  collision.addBox(-40.1, -26.5, -17.1, -15.9);
  // Open entrance: the connector and grove zones already overlap here.
  // Do not add a gameplay collider across this boundary; the old split-wall
  // workaround still left decorative debris at the doorway and could trap the player.
  for (const [x, z, h, broken] of [
    [-35, 12, 4.2, true], [-30.5, 2, 3.1, false], [-34, -10, 4.6, true], [-26.5, -12.5, 3.3, true],
  ]) {
    decor.column(x, z, h, r, broken);
    collision.addCircle(x, z, 0.9);
  }
  for (const [x, z, s] of [[-36, 5, 1.5], [-31, -5, 1.1], [-25, 8, 1.4], [-34, -2, 0.9]]) {
    deadTree(scene, x, z, s, r); collision.addCircle(x, z, 0.45 * s);
  }
  decor.blocks.add(-34, 0.35, -1.5, 3.8, 0.7, 2.0, 0.1, 0x45484e);
  decor.blocks.add(-34, 0.9, -1.5, 2.6, 0.3, 1.2, 0, 0x55585e);

  // ---------- expanded exploration: Northern Ruins ----------
  decor.wall(-17.5, 56.5, -6, 56.5, 3.0, r, { minH: 0.3 });
  decor.wall(6, 56.5, 17.5, 56.5, 3.2, r, { minH: 0.35 });
  decor.wall(-17.5, 45.5, -17.5, 56.5, 3.2, r, { minH: 0.35 });
  decor.wall(17.5, 45.5, 17.5, 56.5, 3.6, r, { minH: 0.3 });
  // Northern ruins walls are solid gameplay geometry too. The south side is
  // intentionally open because it reconnects to the main entrance zone.
  collision.addBox(-18.1, -16.9, 45.0, 57.1);
  collision.addBox(16.9, 18.1, 45.0, 57.1);
  collision.addBox(-18.1, -5.5, 55.9, 57.1);
  collision.addBox(5.5, 18.1, 55.9, 57.1);
  for (const [x, z, h, broken] of [
    [-12.5, 52.5, 4.8, false],
    [11.5, 52.5, 3.6, true],
    [-4.5, 55, 3.2, true],
    [5.5, 47.5, 4.2, false],
  ]) {
    decor.column(x, z, h, r, broken);
    collision.addCircle(x, z, 0.9);
  }
  decor.blocks.add(-7, 0.4, 50.5, 4.5, 0.8, 2.0, 0.08, 0x45484e);
  decor.blocks.add(7.5, 0.3, 53.5, 2.6, 0.6, 1.5, -0.15, 0x505258);

  // ---------- northern cemetery ----------
  // Expanded burial field west of the northern ruins. This is deliberately
  // built from recognizable grave pieces instead of generic rubble blocks.
  const graveStoneMats = [
    new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x484a4d, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x606266, roughness: 1, flatShading: true }),
  ];
  const graveGroundMat = new THREE.MeshStandardMaterial({ color: 0x2e241d, roughness: 1, flatShading: true });
  const graveMossMat = new THREE.MeshStandardMaterial({ color: 0x384838, roughness: 1, flatShading: true });

  const gravePositions = [
    [-32.0, 52.5, -0.10, 1.05, 1.20, false],
    [-28.5, 54.0,  0.08, 0.95, 1.35, true],
    [-24.8, 51.5, -0.16, 1.10, 1.10, false],
    [-21.3, 54.2,  0.12, 0.90, 1.25, false],
    [-30.2, 47.8,  0.18, 1.00, 1.05, true],
    [-26.4, 45.6, -0.06, 1.15, 1.30, false],
    [-22.3, 48.2,  0.14, 0.92, 1.15, true],
    [-31.5, 42.8, -0.13, 1.05, 1.25, false],
    [-27.8, 41.0,  0.06, 0.88, 0.95, true],
    [-23.2, 43.0, -0.18, 1.08, 1.20, false],
    [-20.0, 40.2,  0.10, 0.95, 1.00, true],
    [-33.0, 38.8, -0.08, 1.00, 1.18, false],
  ];

  for (const [x, z, rot, w, h, broken] of gravePositions) {
    const grave = new THREE.Group();
    grave.position.set(x, 0, z);
    grave.rotation.y = rot;

    const mound = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.72, w, 0.16, 8), graveGroundMat);
    mound.scale.z = 1.55;
    mound.position.set(0, 0.08, 0.38);
    mound.rotation.x = 0;
    mound.receiveShadow = true;
    grave.add(mound);

    const base = new THREE.Mesh(new THREE.BoxGeometry(w * 1.12, 0.16, 0.48), graveStoneMats[Math.floor(r() * graveStoneMats.length)]);
    base.position.set(0, 0.18, -0.05);
    base.castShadow = true;
    base.receiveShadow = true;
    grave.add(base);

    const stoneMat = graveStoneMats[Math.floor(r() * graveStoneMats.length)];
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.72, 0.22), stoneMat);
    slab.position.set(0, 0.18 + h * 0.36, -0.18);
    slab.castShadow = true;
    slab.receiveShadow = true;
    grave.add(slab);

    // Rounded cap makes it read as a headstone rather than a rectangular rock.
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.36, w * 0.36, 0.22, 8, 1, false, 0, Math.PI), stoneMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(0, 0.18 + h * 0.72, -0.18);
    cap.castShadow = true;
    cap.receiveShadow = true;
    grave.add(cap);

    if (r() < 0.55) {
      const crossMat = graveMossMat;
      const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.48, 0.07), crossMat);
      const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.07), crossMat);
      vertical.position.set(0, 0.58 + h * 0.36, -0.31);
      horizontal.position.set(0, 0.68 + h * 0.36, -0.31);
      grave.add(vertical, horizontal);
    }

    if (broken) {
      slab.rotation.z = (r() - 0.5) * 0.35;
      cap.rotation.z += (r() - 0.5) * 0.25;
    }

    scene.add(grave);
  }

  // Old cemetery fencing and scattered grave markers define the field without
  // blocking navigation. A few markers are intentionally fallen.
  for (const [x, z, rot] of [
    [-34.0, 36.0, 0.12], [-30.5, 36.5, -0.08], [-26.0, 36.2, 0.16],
    [-21.0, 37.0, -0.12], [-34.0, 56.0, 0.06], [-29.0, 57.0, -0.14],
  ]) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.72, 0.18), graveStoneMats[1]);
    marker.position.set(x, 0.36, z);
    marker.rotation.y = rot;
    marker.rotation.z = (r() - 0.5) * 0.2;
    marker.castShadow = true;
    scene.add(marker);
  }

  // ---------- courtyard ruins ----------
  for (let x = -21; x <= 21; x += 2) {
    for (let z = -19; z <= 12; z += 2) {
      if (r() < 0.16) continue;
      const moss = r() < 0.18;
      decor.tiles.add(x + (r() - 0.5) * 0.15, -0.05 + r() * 0.03, z + (r() - 0.5) * 0.15, 1.85, 0.14, 1.85, (r() - 0.5) * 0.06,
        moss ? 0x3e4a3a : [0x4a4c52, 0x55575d, 0x3f4146, 0x505258][Math.floor(r() * 4)]);
    }
  }
  decor.wall(-23, -20.9, -4.9, -20.9, 4.5, r, { minH: 0.7 });
  decor.wall(4.9, -20.9, 23, -20.9, 4.5, r, { minH: 0.7 });
  // South courtyard walls are visual geometry, so register matching gameplay colliders.
  collision.addBox(-23, -4.9, -21.5, -20.25);
  collision.addBox(4.9, 23, -21.5, -20.25);

  // Collapsed masonry scattered across the south side. Decorative only:
  // these pieces sell the age of the ruin without changing navigation.
  for (const [x, z, sx, sz, ry] of [
    [-17.5, -23.2, 2.8, 1.0, -0.18],
    [-12.5, -24.4, 1.9, 0.75, 0.3],
    [-5.2, -22.9, 2.5, 0.9, -0.12],
    [5.8, -24.1, 2.2, 0.8, 0.2],
    [13.2, -23.0, 3.0, 1.0, -0.25],
    [18.2, -25.0, 1.7, 0.7, 0.16],
  ]) {
    decor.blocks.add(x, 0.2, z, sx, 0.4, sz, ry, 0x414348);
    decor.blocks.add(x + (r() - 0.5) * 0.8, 0.48, z + (r() - 0.5) * 0.4, sx * 0.55, 0.28, sz * 0.65, -ry * 1.4, 0x505257);
  }
  decor.wall(-23, -21, -23, 13.6, 3.8, r, { minH: 0.3 });
  decor.wall(23, -21, 23, 7.2, 3.8, r, { minH: 0.3 });
  decor.wall(23, 12.8, 23, 13.6, 3.8, r, { minH: 0.3 });
  // Side walls of the southern courtyard are gameplay walls too.
  // Keep the east-side gap at z 7.2..12.8 open for the secret passage.
  // West side: leave the old tree doorway open around z 6..13.6.
  collision.addBox(-23.8, -22.8, -21.5, 5.5);
  collision.addBox(22.8, 24.0, -21.5, 7.2);
  collision.addBox(22.8, 24.0, 12.8, 13.6);
  // West doorway in the upper wall. Keep the visual wall aligned with the
  // collision gap (-19..-12) so there is no hidden mismatch.
  decor.wall(-23, 13.6, -19, 13.6, 2.6, r, { minH: 0.35 });
  decor.wall(-12, 13.6, -6.6, 13.6, 2.6, r, { minH: 0.35 });
  decor.wall(6.6, 13.6, 23, 13.6, 2.6, r, { minH: 0.35 });
  // The two upper courtyard pillars are also real obstacles.
  decor.column(-6.4, 13.6, 5.5, r);
  collision.addCircle(-6.4, 13.6, 0.9);
  decor.column(6.4, 13.6, 4.2, r, true);
  collision.addCircle(6.4, 13.6, 0.9);
  for (const [x, z, h, broken] of [[-8, 7, 4.5, false], [8, 7, 3, true], [-9, -7, 5, false], [9, -7, 4.8, false], [-17, -13, 2.2, true], [17, -13, 4.5, false], [-5, -16, 3.5, false], [5, -16, 3.5, false]]) {
    decor.column(x, z, h, r, broken);
    collision.addCircle(x, z, 0.8);
  }
  deadTree(scene, -19.5, 9, 1.2, r); collision.addCircle(-19.5, 9, 0.45);
  deadTree(scene, 19, -4, 1.0, r); collision.addCircle(19, -4, 0.4);
  deadTree(scene, -2, 9.5, 0.8, r);
  // corridor walls
  decor.wall(-3.9, -21, -3.9, -30.5, 5.5, r, { minH: 0.85 });
  decor.wall(3.9, -21, 3.9, -30.5, 5.5, r, { minH: 0.85 });
  collision.addBox(-4.45, -3.35, -30.8, -20.7);
  collision.addBox(3.35, 4.45, -30.8, -20.7);

  // ---------- hidden east chamber ----------
  // A natural ruined chamber: irregular walls, a narrow concealed entrance,
  // broken masonry and a deeper alcove around the reward.
  for (let x = 24; x <= 38; x += 2) {
    for (let z = 2; z <= 18; z += 2) {
      decor.tiles.add(
        x + (r() - 0.5) * 0.22, -0.05 + r() * 0.03,
        z + (r() - 0.5) * 0.22,
        1.85, 0.14, 1.85, (r() - 0.5) * 0.09,
        r() < 0.22 ? 0x3e4a3a : [0x4a4c52, 0x55575d, 0x3f4146, 0x505258][Math.floor(r() * 4)]
      );
    }
  }

  // Gameplay perimeter follows the same broken layout. The west side is the
  // entrance wall, with an opening around z=11..13 for the secret gate.
  collision.addBox(23.4, 24.6, 2.0, 6.2);
  collision.addBox(23.4, 24.6, 12.8, 18.6);
  collision.addBox(39.4, 40.6, 2.5, 18.6);
  collision.addBox(24.0, 40.6, 17.4, 18.6);
  collision.addBox(24.0, 29.4, 1.4, 2.6);
  collision.addBox(30.6, 40.6, 1.4, 3.2);

  // Broken, staggered perimeter instead of a clean rectangular room.
  decor.wall(24, 2, 29, 2, 3.8, r, { minH: 0.45 });
  decor.wall(31, 2, 40, 2.8, 3.5, r, { minH: 0.4 });
  decor.wall(40, 2.8, 40, 8, 3.8, r, { minH: 0.45 });
  decor.wall(40, 10, 40, 18, 3.4, r, { minH: 0.35 });
  decor.wall(40, 18, 34, 18, 3.7, r, { minH: 0.4 });
  decor.wall(32, 18, 24, 18, 3.1, r, { minH: 0.3 });
  decor.wall(24, 18, 24, 13, 3.8, r, { minH: 0.4 });
  decor.wall(24, 11, 24, 6, 3.0, r, { minH: 0.3 });

  // Collapsed masonry and broken pillars make the edges irregular.
  for (const [x, z, h, broken] of [
    [27, 4.5, 3.2, true],
    [36.5, 5, 4.1, false],
    [37, 14.8, 2.7, true],
  ]) {
    decor.column(x, z, h, r, broken);
    collision.addCircle(x, z, 0.9);
  }
  decor.blocks.add(26.2, 0.45, 15.5, 2.4, 0.8, 1.8, -0.15, 0x45484e);
  decor.blocks.add(28.8, 0.3, 15.9, 1.8, 0.55, 1.3, 0.2, 0x3f4146);
  decor.blocks.add(38, 0.35, 10.5, 2.2, 0.7, 1.5, 0.1, 0x505258);

  // A small ruined altar in the back, framing the chest as a hidden reward.
  decor.blocks.add(32, 0.35, 15.6, 4.4, 0.7, 2.2, 0, 0x45484e);
  decor.blocks.add(32, 0.85, 15.6, 3.0, 0.3, 1.5, 0, 0x55585e);

  // ---------- secret chamber cover ----------
  // Ruined pitched roof: broken wooden beams + uneven stone/wood tiles.
  // It hides the chamber from above without looking like a flat concrete slab.
  const secretRoof = new THREE.Group();
  secretRoof.name = 'secret-chamber-roof';

  const roofStoneMat = new THREE.MeshStandardMaterial({
    color: 0x3f4245, roughness: 1, metalness: 0, flatShading: true,
  });
  const roofWoodMat = new THREE.MeshStandardMaterial({
    color: 0x29251f, roughness: 1, metalness: 0, flatShading: true,
  });

  // Two broken roof slopes, leaving irregular gaps between old tiles.
  const roofTiles = [
    [25.8, 6.5, 3.2, 5.8, 0.28], [29.0, 6.9, 3.5, 6.2, 0.22],
    [32.4, 7.2, 3.4, 6.5, 0.16], [35.6, 7.0, 3.6, 6.3, 0.10],
    [38.3, 6.6, 3.0, 5.7, 0.02],
    [27.0, 6.0, 3.0, 5.5, -0.24], [30.2, 6.5, 3.4, 6.0, -0.18],
    [33.5, 6.8, 3.5, 6.2, -0.12], [36.8, 6.5, 3.3, 5.8, -0.06],
  ];
  for (const [x, y, sx, sz, ry] of roofTiles) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.42, sz), roofStoneMat);
    tile.position.set(x, y, 10 + (r() - 0.5) * 0.8);
    tile.rotation.set((r() - 0.5) * 0.06, ry, (r() - 0.5) * 0.05);
    tile.castShadow = true;
    tile.receiveShadow = true;
    secretRoof.add(tile);
  }

  // Old support beams crossing the ruined roof.
  for (const [x, z, sx, sz, ry] of [
    [24.8, 10, 15.5, 0.55, 0.18],
    [32.2, 10.1, 17.0, 0.65, -0.10],
    [39.2, 10, 12.0, 0.5, 0.08],
  ]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.55, sz), roofWoodMat);
    beam.position.set(x, 6.15, z);
    beam.rotation.y = ry;
    beam.castShadow = true;
    secretRoof.add(beam);
  }

  // A few collapsed pieces sell the ruined look.
  for (const [x, y, z, sx, sy, sz, ry] of [
    [25.0, 5.9, 6.0, 2.2, 0.55, 1.0, 0.2],
    [29.2, 5.7, 15.4, 2.5, 0.5, 1.2, -0.18],
    [37.8, 5.8, 4.8, 2.0, 0.5, 1.1, 0.25],
    [39.0, 6.0, 15.8, 2.3, 0.45, 1.0, -0.15],
  ]) {
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), roofStoneMat);
    chunk.position.set(x, y, z);
    chunk.scale.set(sx, sy, sz);
    chunk.rotation.set((r() - 0.5) * 0.35, ry, (r() - 0.5) * 0.3);
    chunk.castShadow = true;
    secretRoof.add(chunk);
  }

  scene.add(secretRoof);

  // ---------- secret chamber mist ----------
  // Local translucent mist only: the rest of the map stays clear.
  const secretMist = new THREE.Group();
  secretMist.name = 'secret-chamber-mist';
  const mistCanvas = document.createElement('canvas');
  mistCanvas.width = 128;
  mistCanvas.height = 128;
  const mistCtx = mistCanvas.getContext('2d');
  const mistGradient = mistCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
  mistGradient.addColorStop(0, 'rgba(190, 205, 198, 0.22)');
  mistGradient.addColorStop(0.45, 'rgba(150, 170, 165, 0.10)');
  mistGradient.addColorStop(1, 'rgba(110, 125, 120, 0)');
  mistCtx.fillStyle = mistGradient;
  mistCtx.fillRect(0, 0, 128, 128);
  const mistTexture = new THREE.CanvasTexture(mistCanvas);
  mistTexture.needsUpdate = true;
  const mistMat = new THREE.SpriteMaterial({
    map: mistTexture,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    depthTest: true,
  });
  for (const [x, y, z, sx, sy] of [
    [27.5, 1.2, 5.5, 9, 4.5],
    [33.5, 1.0, 8.5, 11, 5],
    [37.0, 1.4, 12.5, 9, 4.5],
    [31.5, 1.1, 15.5, 10, 4.2],
  ]) {
    const mist = new THREE.Sprite(mistMat.clone());
    mist.position.set(x, y, z);
    mist.scale.set(sx, sy, 1);
    secretMist.add(mist);
  }
  scene.add(secretMist);
  // ---------- arena ----------
  for (let rad = 1.9; rad < 15.2; rad += 1.55) {
    const n = Math.floor((Math.PI * 2 * rad) / 1.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rad;
      decor.tiles.add(ARENA.x + Math.sin(a) * rad, -0.05 + r() * 0.02, ARENA.z + Math.cos(a) * rad, 1.45, 0.14, 1.4, a,
        [0x3e3c44, 0x46434c, 0x38363d, 0x4a4652][Math.floor(r() * 4)]);
    }
  }
  decor.columns.add(ARENA.x, -0.3, ARENA.z, 2.8, 0.36, 2.8, 0, 0x4a4652);
  const pillarAngles = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.25) continue; // entrance
    pillarAngles.push(a);
    const px = ARENA.x + Math.sin(a) * 16.4, pz = ARENA.z + Math.cos(a) * 16.4;
    decor.column(px, pz, 5 + r() * 3, r, r() < 0.25);
    collision.addCircle(px, pz, 0.95);
    const a2 = a + Math.PI / 16, wx = ARENA.x + Math.sin(a2) * 16.6, wz = ARENA.z + Math.cos(a2) * 16.6;
    if (Math.abs(Math.atan2(Math.sin(a2), Math.cos(a2))) > 0.3) decor.blocks.add(wx, 1.2, wz, 1.2, 2.4 + r() * 1.2, 3.4, a2, 0x4a4d54);
  }
  // throne/statue behind the arena
  decor.blocks.add(0, 0.5, -61, 10, 1, 4, 0, 0x45484e);
  decor.blocks.add(0, 1.5, -62, 7, 1, 3, 0, 0x4d5057);
  decor.columns.add(0, 2, -62.5, 2.2, 6, 2.2, 0, 0x55585e);
  decor.blocks.add(0, 8.8, -62.5, 3.4, 1.6, 2.4, 0.2, 0x4a4d54);
  const runeMat = new THREE.MeshBasicMaterial({ color: 0x6a1a3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const runes = new THREE.Group();
  runes.add(new THREE.Mesh(new THREE.RingGeometry(6.2, 6.45, 64).rotateX(-Math.PI / 2), runeMat));
  runes.add(new THREE.Mesh(new THREE.RingGeometry(3.2, 3.35, 48).rotateX(-Math.PI / 2), runeMat));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.2).rotateX(-Math.PI / 2), runeMat);
    glyph.position.set(Math.sin(a) * 4.8, 0, Math.cos(a) * 4.8);
    glyph.rotation.y = a;
    runes.add(glyph);
  }
  runes.position.set(ARENA.x, 0.07, ARENA.z);
  scene.add(runes);
  const arenaLights = [];
  for (const s of [-1, 1]) {
    const l = new THREE.PointLight(0xff5a3a, 16, 24, 1.5);
    l.position.set(ARENA.x + s * 12, 5, ARENA.z - 3);
    scene.add(l);
    arenaLights.push(l);
    for (const off of [-0.5, 0.5]) {
      const a = s * (Math.PI / 2 + off);
      const fx = ARENA.x + Math.sin(a) * 15, fz = ARENA.z + Math.cos(a) * 15;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      f.position.set(fx, 2.3, fz);
      scene.add(f);
      decor.columns.add(fx, 0, fz, 0.9, 1.6, 0.9, 0, 0x3a3a40);
      collision.addCircle(fx, fz, 0.6);
      arenaLights.push(f);
    }
  }

  decor.build(scene);

  // ---------- abandoned mine ----------
// Stage 1: physical foundation of the underground mine.
// Design target: closed rock perimeter, readable central hub, broad connectors,
// simple collision primitives and a guaranteed return path. Decoration is kept
// deliberately light here so this layer can be tested before adding props/AI.
const MINE = { x: 110, z: 110 };
const mineGroup = new THREE.Group();
mineGroup.name = 'abandoned-mine';
mineGroup.visible = false;
scene.add(mineGroup);

const mineRockMat = new THREE.MeshStandardMaterial({ color: 0x34302d, roughness: 1, flatShading: true });
const mineRockDarkMat = new THREE.MeshStandardMaterial({ color: 0x211f1d, roughness: 1, flatShading: true });
const mineWoodMat = new THREE.MeshStandardMaterial({ color: 0x33251b, roughness: 0.95, flatShading: true });
const mineMetalMat = new THREE.MeshStandardMaterial({ color: 0x3e4144, roughness: 0.75, metalness: 0.55, flatShading: true });
const mineOreMat = new THREE.MeshStandardMaterial({ color: 0x4d6770, emissive: 0x172a30, emissiveIntensity: 0.22, roughness: 0.7, flatShading: true });
const mineGlowMat = new THREE.MeshBasicMaterial({ color: 0xd89b54, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const mineLights = [];
let mineLightTick = 0;

// Sprite-based mine dressing. These are visual-only and intentionally have no
// collision registration, so decoration can never recreate the invisible-wall bug.
const mineTextureLoader = new THREE.TextureLoader();
const mineWebTexture = mineTextureLoader.load(new URL('../../assets/mine/spider-webs.svg', import.meta.url).href);
const mineCocoonTexture = mineTextureLoader.load(new URL('../../assets/mine/spider-cocoons.svg', import.meta.url).href);
mineWebTexture.colorSpace = THREE.SRGBColorSpace;
mineCocoonTexture.colorSpace = THREE.SRGBColorSpace;

const mineSheetSprite = (texture, index, x, y, z, sx, sy, rotation = 0, opacity = 0.92) => {
  const map = texture.clone();
  map.needsUpdate = true;
  map.repeat.set(0.25, 1);
  map.offset.set(index * 0.25, 0);
  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    alphaTest: 0.04,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(sx, sy, 1);
  sprite.material.rotation = rotation;
  mineGroup.add(sprite);
  return sprite;
};

const mineBox = (w, h, d, x, y, z, mat, rotY = 0, opts = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = false;
  m.receiveShadow = true;
  mineGroup.add(m);
  if (opts.colliderRadius) game.collision.addCircle(x, z, opts.colliderRadius, { projectiles: false });
  return m;
};

const mineRock = (x, z, sx, sy, sz, rot = 0, mat = mineRockMat, opts = {}) => {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat);
  m.position.set(x, sy * 0.48, z);
  m.scale.set(sx, sy, sz);
  m.rotation.y = rot;
  m.castShadow = false;
  m.receiveShadow = true;
  mineGroup.add(m);

  // Visible mine rocks are solid by default. Only explicitly visual-only
  // geometry opts out. This keeps individual stones physical without adding
  // hidden wall/zone colliders.
  if (opts.collider !== false) {
    const radius = opts.colliderRadius ?? Math.max(0.45, Math.min(sx, sz) * 0.72);
    game.collision.addCircle(x, z, radius, { projectiles: false });
  }
  return m;
};

const mineLamp = (x, z, intensity = 6, range = 10) => {
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mineGlowMat);
  orb.position.set(x, 3.1, z);
  mineGroup.add(orb);
  const light = new THREE.PointLight(0xd89b54, intensity, range, 1.8);
  light.position.set(x, 2.8, z);
  mineGroup.add(light);
  mineLights.push(light);
};

// Floor remains a simple plane. The perimeter is irregular visually, while the
// playable area is authored as overlapping zones rather than a giant rectangle.
const mineFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(48, 50),
  new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 1 })
);
mineFloor.rotation.x = -Math.PI / 2;
mineFloor.position.set(MINE.x, -0.04, MINE.z + 3);
mineFloor.receiveShadow = true;
mineGroup.add(mineFloor);

// Surface mine mouth: KEEP THIS APPROVED ENTRANCE UNCHANGED.
const mineEntrance = new THREE.Group();
mineEntrance.name = 'abandoned-mine-entrance';
mineEntrance.position.set(12.4, 0, 35.0);
const entranceRock = new THREE.MeshStandardMaterial({ color: 0x45474a, roughness: 1, flatShading: true });
const entranceDark = new THREE.MeshStandardMaterial({ color: 0x070708, roughness: 1 });
const leftRock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), entranceRock);
leftRock.position.set(-2.6, 2.1, 0);
leftRock.scale.set(2.0, 2.8, 1.8);
leftRock.castShadow = true;
mineEntrance.add(leftRock);
const rightRock = leftRock.clone();
rightRock.position.x = 2.6;
rightRock.rotation.y = 0.8;
mineEntrance.add(rightRock);
const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), entranceRock);
crown.position.set(0, 3.8, 0);
crown.scale.set(3.0, 1.8, 1.8);
crown.castShadow = true;
mineEntrance.add(crown);
const mouth = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.15, 0.22, 14), entranceDark);
mouth.rotation.x = Math.PI / 2;
mouth.position.set(0, 1.65, -0.85);
mouth.scale.z = 0.7;
mineEntrance.add(mouth);
for (let i = 0; i < 4; i++) {
  const step = new THREE.Mesh(new THREE.BoxGeometry(3.0 - i * 0.18, 0.22, 0.65), entranceRock);
  step.position.set(0, 0.08 - i * 0.12, -0.72 - i * 0.58);
  step.castShadow = true;
  mineEntrance.add(step);
}
for (const x of [-1.7, 1.7]) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mineGlowMat);
  o.position.set(x, 2.45, 0.05);
  mineEntrance.add(o);
  const l = new THREE.PointLight(0xd89b54, 6, 8, 1.8);
  l.position.set(x, 2.4, 0);
  mineEntrance.add(l);
}

// Rope descent detail: a real rope follows the mine mouth/steps so the entrance
// reads as a climb-down rather than a teleport doorway.
const ropeMat = new THREE.MeshStandardMaterial({
  color: 0x6b4a2d,
  roughness: 0.95,
  flatShading: true,
});
for (const side of [-1, 1]) {
  const ropeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 1.55, 2.85, 0.10),
    new THREE.Vector3(side * 1.62, 2.15, -0.10),
    new THREE.Vector3(side * 1.58, 1.35, -0.55),
    new THREE.Vector3(side * 1.48, 0.55, -1.35),
  ]);
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(ropeCurve, 10, 0.075, 6, false),
    ropeMat
  );
  rope.castShadow = true;
  mineEntrance.add(rope);
}

scene.add(mineEntrance);

// Tutorial rune beside the mine entrance. It sits on the left side of the
// mouth, close enough to be discovered before descending without blocking the
// approved entrance or the path from the NPCs.
const mineLightRune = createRuneStone(game, 7.1, 35.3);

// ---------- Stage 2 underground route layout ----------
  // Stage 1 established the enclosed physical pocket. Stage 2 turns that
  // pocket into a readable mine: entrance tunnel -> central shaft -> three
  // extraction branches, each with a distinct landmark and return path.
// Coordinates are local to the underground pocket. The entrance transition
// teleports the player here, so the surface map never intersects these zones.
//
//                 NORTH
//          [ HUB / POÇO CENTRAL ]
//             /             \
//     west tunnel             east tunnel
//          \                 /
//            [ SOUTH CHAMBER ]
//
// The future boss cave will extend north-east from the hub in a later stage.

// Underground ambient lighting: keep the mine dark and moody, but readable.
// A cool base lift prevents the unlit corners from collapsing into black while
// the warm lamps below remain the main visual accents.
const mineAmbient = new THREE.HemisphereLight(0x71879a, 0x17120f, 1.15);
mineAmbient.position.set(110, 8, 118);
mineGroup.add(mineAmbient);

// The ambient hemisphere light supplies the low-level visibility. Local
// illumination is concentrated into a small number of torches instead of many
// overlapping point lights, which keeps the mine cheaper to render.

const undergroundBoundary = [
  [104, 80], [116, 80], [124, 84], [138, 82], [151, 91],
  [154, 105], [152, 119], [146, 129], [145, 138], [151, 145],
  [143, 153], [124, 154], [110, 151], [99, 145], [88, 145],
  [78, 139], [70, 129], [69, 116], [71, 103], [78, 94],
  [91, 87],
];

// Rectangular metadata is retained for the minimap. It is NOT used for
// collision, because rectangle edges were the source of the invisible walls.
// Surface exit landmark: make the way back to the upper world obvious from
// inside the mine. This is visual-only so it cannot create another invisible wall.
const exitWoodMat = new THREE.MeshStandardMaterial({
  color: 0x5a3d27,
  roughness: 0.95,
  flatShading: true,
});
const exitRopeMat = new THREE.MeshStandardMaterial({
  color: 0x765237,
  roughness: 1,
});
const exitX = 110;
const exitZ = 101;

// A small timber frame marks the shaft/entrance instead of relying on the
// minimap or interaction prompt.
for (const side of [-1, 1]) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.20, 3.4, 6),
    exitWoodMat
  );
  post.position.set(exitX + side * 1.65, 1.7, exitZ);
  post.rotation.z = side * 0.025;
  post.castShadow = true;
  mineGroup.add(post);
}
const exitBeam = new THREE.Mesh(
  new THREE.BoxGeometry(3.7, 0.32, 0.38),
  exitWoodMat
);
exitBeam.position.set(exitX, 3.35, exitZ);
exitBeam.castShadow = true;
mineGroup.add(exitBeam);

// The rope is deliberately prominent and hangs down toward the player.
const exitRopeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(exitX, 3.35, exitZ),
  new THREE.Vector3(exitX - 0.08, 2.55, exitZ - 0.05),
  new THREE.Vector3(exitX + 0.10, 1.65, exitZ - 0.18),
  new THREE.Vector3(exitX - 0.04, 0.65, exitZ - 0.25),
]);
const exitRope = new THREE.Mesh(
  new THREE.TubeGeometry(exitRopeCurve, 14, 0.085, 6, false),
  exitRopeMat
);
exitRope.castShadow = true;
mineGroup.add(exitRope);

// A warm lantern beside the shaft makes the landmark readable even in the dark.
const exitLantern = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.13, 0.34, 8),
  mineMetalMat
);
exitLantern.position.set(exitX + 1.95, 2.35, exitZ - 0.05);
mineGroup.add(exitLantern);
const exitGlow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mineGlowMat);
exitGlow.position.set(exitX + 1.95, 2.15, exitZ - 0.05);
mineGroup.add(exitGlow);
const exitLight = new THREE.PointLight(0xd89b54, 4.0, 8, 1.8);
exitLight.position.copy(exitGlow.position);
mineGroup.add(exitLight);
exitLight.userData.baseIntensity = 4.0;
mineLights.push(exitLight);

const undergroundZones = [
  // Entrance / north shaft
  [[103, 98], [103, 84], [107, 81], [116, 82], [118, 98], [114, 102], [106, 102]],
  // Central working hub around the old shaft
  [[100, 103], [105, 98], [116, 98], [121, 103], [121, 113], [116, 119], [105, 119], [99, 114]],
  // West extraction gallery
  [[89, 98], [103, 98], [105, 103], [103, 110], [93, 110], [88, 106]],
  // West lower chamber
  [[72, 106], [88, 104], [96, 110], [96, 120], [91, 126], [80, 124], [73, 119]],
  // West/south return gallery
  [[82, 120], [95, 118], [105, 123], [105, 131], [99, 135], [88, 132], [80, 127]],
  // East extraction gallery
  [[116, 99], [136, 98], [140, 104], [137, 110], [121, 111], [117, 106]],
  // East chamber
  [[133, 103], [144, 96], [151, 92], [154, 105], [151, 119], [144, 125], [135, 120], [130, 111]],
  // East/south gallery
  [[125, 115], [144, 115], [147, 123], [143, 130], [130, 132], [124, 126]],
  // South spine into the natural cave
  [[102, 115], [124, 115], [130, 121], [129, 131], [124, 136], [110, 133], [103, 128]],
  // Natural boss cave
  [[109, 128], [115, 126], [126, 127], [131, 132], [130, 138], [144, 139], [149, 146], [143, 153], [124, 154], [110, 151], [104, 144], [106, 136]],
];

// The outer mine polygon remains the single gameplay boundary.
// Interior visual walls do not create hidden collision barriers.
collision.addPolygonZone(undergroundBoundary);

// The mine is deliberately larger than the old 30x40 pocket. It is built as
// chambers connected by long corridors, not as one rectangular room.
const mineWall = (x1, z1, x2, z2, h = 8.0, options = {}) => {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const collide = options.collide ?? true;

  // Natural wall mass: no long rectangular boxes. A small number of overlapping
  // low-poly rock masses form one continuous ridge, so the silhouette reads as
  // carved stone rather than a row of cubes.
  const count = Math.max(2, Math.ceil(len / 3.8));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const wobble = Math.sin((i + 1) * 2.17 + x1 * 0.13 + z1 * 0.07) * 0.22;
    const px = x1 + dx * t - (dz / Math.max(len, 0.001)) * wobble;
    const pz = z1 + dz * t + (dx / Math.max(len, 0.001)) * wobble;
    const chunkLen = Math.min(4.6, Math.max(2.7, len / count + 0.9));
    const rock = mineRock(
      px,
      pz,
      chunkLen * 0.58,
      h * (0.38 + (i % 3) * 0.035),
      1.05 + (i % 2) * 0.18,
      angle + (i % 2 ? 0.08 : -0.06),
      mineRockDarkMat,
      collide ? { colliderRadius: Math.max(0.85, chunkLen * 0.5) } : { collider: false }
    );
    rock.rotation.z = (i % 2 ? -1 : 1) * 0.035;
  }

  // Mine navigation is defined exclusively by the walkable-zone union.
  // Do not add a second hidden obstacle layer here: even a small circle plus
  // the player's 0.45m radius can seal a doorway/corner before the visible
  // rock is reached. The rock remains visual geometry; zone boundaries are
  // the authoritative physical walls.
  void collide;
};

// Large irregular outside wall. Every branch terminates inside this boundary.
const perimeter = [
  [104, 80, 116, 80],
  [116, 80, 124, 84],
  [124, 84, 138, 82],
  [138, 82, 151, 91],
  [151, 91, 154, 105],
  [154, 105, 152, 119],
  [152, 119, 146, 129],
  [146, 129, 145, 138],
  [145, 138, 151, 145],
  [151, 145, 143, 153],
  [143, 153, 124, 154],
  [124, 154, 110, 151],
  [110, 151, 99, 145],
  [99, 145, 88, 145],
  [88, 145, 78, 139],
  [78, 139, 70, 129],
  [70, 129, 69, 116],
  [69, 116, 71, 103],
  [71, 103, 78, 94],
  [78, 94, 91, 87],
  [91, 87, 104, 80],
];
for (const segment of perimeter) mineWall(...segment, 8.0, { collide: false });

// Worked-mine walls now follow the actual playable branches. They are
// visual geometry only: the polygon zones above are the single source of truth
// for navigation, which avoids recreating the invisible-wall bug.
for (const segment of [
  // north shaft
  [103, 84, 103, 98], [117, 83, 117, 98],
  // west gallery
  [89, 98, 103, 98], [90, 110, 103, 110],
  // west lower chamber
  [73, 106, 88, 104], [73, 119, 91, 126],
  [80, 124, 96, 120],
  // west/south return
  [82, 120, 103, 123], [88, 132, 105, 131],
  // east gallery
  [118, 98, 136, 98], [120, 110, 137, 110],
  // east chamber
  [136, 98, 151, 92], [151, 92, 154, 105], [154, 105, 151, 119],
  [144, 125, 135, 120],
  // east/south gallery
  [126, 115, 144, 115], [147, 123, 143, 130],
  // south spine
  [103, 115, 103, 128], [124, 115, 130, 121],
]) mineWall(...segment, 7.0, { collide: false });

// Doorways are intentionally wider than the player's radius and remain open.

// No duplicate physical wall layer here. The walkable zones define the
// outer boundary, while mineWall() supplies collision only for interior rock walls.

// No solid ceiling: the mine must remain readable from the player's maximum
// zoom-out. The exterior is masked with a thick fog bank instead of a black roof.
const mineFog = new THREE.Group();
mineFog.name = 'mine-fog-bank';
mineGroup.add(mineFog);

const fogOuter = new THREE.Shape();
fogOuter.moveTo(62, 72);
fogOuter.lineTo(160, 72);
fogOuter.lineTo(160, 160);
fogOuter.lineTo(62, 160);
fogOuter.lineTo(62, 72);

const fogHole = new THREE.Path();
for (let i = 0; i < perimeter.length; i++) {
  const [, x, z] = [0, perimeter[i][0], perimeter[i][1]];
  if (i === 0) fogHole.moveTo(x, -z);
  else fogHole.lineTo(x, -z);
}
fogHole.closePath();
fogOuter.holes.push(fogHole);

const fogBank = new THREE.Mesh(
  new THREE.ShapeGeometry(fogOuter),
  new THREE.MeshBasicMaterial({
    color: 0x211b17,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
fogBank.rotation.x = -Math.PI / 2;
fogBank.position.y = 0.045;
mineFog.add(fogBank);

// A second, softer layer makes the boundary read as mist rather than a hard
// black edge. It is also kept outside the playable polygon.
const fogSoft = new THREE.Mesh(
  new THREE.ShapeGeometry(fogOuter),
  new THREE.MeshBasicMaterial({
    color: 0x4a4038,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
fogSoft.rotation.x = -Math.PI / 2;
fogSoft.position.y = 0.055;
fogSoft.scale.setScalar(1.03);
mineFog.add(fogSoft);

// Larger floor so no exterior background leaks into the playable perimeter.
mineFloor.geometry.dispose();
mineFloor.geometry = new THREE.PlaneGeometry(88, 78);
mineFloor.position.set(110, -0.04, 118);

// Deep chambers get different visual anchors.
for (const [x,z,s] of [
  [83,114,1.1],[88,132,0.9],[143,111,1.2],[139,123,0.95],
  [112,143,1.0],[132,143,1.2],[126,146,0.8],
]) {
  mineRock(x,z,s,1.0,s*0.9,r()*0.5,mineRockDarkMat, { colliderRadius: Math.max(0.55, s * 0.75) });
}

// ---------- Mine room identity ----------
const mineLandmarkMat = new THREE.MeshStandardMaterial({ color: 0x3b3733, roughness: 1, flatShading: true });
// Broken stone ribs visually separate the worked galleries from the natural rock.
for (const [x, z, sx, sy, sz, rot] of [
  [101.5, 97.5, 1.1, 4.8, 0.85, 0.12],
  [118.5, 97.5, 1.0, 4.5, 0.8, -0.14],
  [101.0, 111.5, 1.0, 3.6, 0.8, 0.1],
  [120.5, 112.0, 1.0, 3.8, 0.8, -0.08],
  [97.5, 118.0, 0.9, 3.0, 0.75, 0.18],
  [126.0, 117.0, 0.9, 3.5, 0.75, -0.12],
]) {
  const rib = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), mineLandmarkMat);
  rib.position.set(x, sy * 0.5, z);
  rib.scale.set(sx, sy, sz);
  rib.rotation.y = rot;
  rib.castShadow = false;
  mineGroup.add(rib);
}

// Central shaft landmark: a shallow dark ring and four stone uprights give
// the hub a focal point without creating a hole or changing the flat floor.
const shaftMat = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 1, flatShading: true });
const shaftRing = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.65, 0.12, 12), mineRockDarkMat);
shaftRing.position.set(110, 0.02, 109);
shaftRing.receiveShadow = true;
mineGroup.add(shaftRing);
const shaftVoid = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 0.08, 12), shaftMat);
shaftVoid.position.set(110, 0.09, 109);
mineGroup.add(shaftVoid);
for (const [x, z, rot] of [[107.9,109,0],[112.1,109,0],[110,106.9,Math.PI/2],[110,111.1,Math.PI/2]]) {
  mineRock(x, z, 0.65, 1.35, 0.65, rot, mineRockDarkMat);
}

// Collapsed gallery in the south-east pocket. The debris is decorative and
// leaves the safe walkable lane along the western side of the pocket.
for (const [x, z, sx, sy, sz, ry] of [
  [123.8, 125.8, 1.8, 0.8, 1.0, 0.2],
  [125.0, 126.8, 1.3, 0.55, 0.8, -0.3],
  [122.5, 127.2, 1.5, 0.45, 0.7, 0.15],
  [125.8, 124.8, 0.9, 1.0, 0.8, 0.4],
]) {
  mineBox(sx, sy, sz, x, sy * 0.5, z, mineRockDarkMat, ry, { colliderRadius: Math.max(sx, sz) * 0.58 });
}

// A mine cart marks the end of the west extraction line. It is kept outside
// the corridor center so it cannot become a navigation trap.
const cart = new THREE.Group();
cart.position.set(100.2, 0.28, 123.0);
const cartBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 1.35), mineWoodMat);
cartBody.position.y = 0.45;
cartBody.castShadow = true;
cart.add(cartBody);
for (const wheelX of [-0.68, 0.68]) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 10), mineMetalMat);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(wheelX, 0.22, 0.66);
  wheel.castShadow = true;
  cart.add(wheel);
  const wheel2 = wheel.clone();
  wheel2.position.z = -0.66;
  cart.add(wheel2);
}
mineGroup.add(cart);
  game.collision.addCircle(100.2, 123.0, 1.0, { projectiles: false });

// Additional ore clusters are placed at the end of branches so each route has
// a visual reward target before Stage 5 loot interaction is added.
for (const [x, y, z, s, rot] of [
  [97.0, 1.4, 121.5, 0.9, -0.2],
  [101.8, 1.2, 125.2, 0.65, 0.3],
  [124.8, 1.5, 116.0, 0.85, 0.1],
  [126.0, 1.4, 121.5, 0.7, -0.25],
  [108.0, 1.5, 126.8, 0.75, 0.2],
]) {
  const vein = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), mineOreMat);
  vein.position.set(x, y, z);
  vein.scale.set(s, 0.72 * s, 1.25 * s);
  vein.rotation.set(0, rot, 0.15);
  vein.castShadow = true;
  mineGroup.add(vein);
  game.collision.addCircle(x, z, Math.max(0.32, s * 0.62), { projectiles: false });
}

// ---------- Stage 3 ambient prop pass ----------
// This pass is visual/atmospheric only. Navigation geometry remains the Stage 2
// layout: props are kept beside the walking lanes and large pieces use simple
// collision boxes only where the player could visibly hit them.

// Extra timber frames make the three extraction routes read as maintained mine
// galleries instead of generic stone corridors.
for (const [x, z, span, rot] of [
  [104, 102.5, 4.2, 0],
  [116, 102.5, 4.2, 0],
  [97.5, 113.5, 3.8, Math.PI / 2],
  [97.5, 121.5, 3.8, Math.PI / 2],
  [122.5, 110, 3.8, Math.PI / 2],
  [122.5, 117.5, 3.8, Math.PI / 2],
  [108, 119.5, 4.4, 0],
  [116, 119.5, 4.4, 0],
]) {
  addSupport(x, z, span, rot);
}

// Hanging work lamps. They are separate from the main lamps so the mine has
// warm pools of light and darker stretches between them.
const addHangingLamp = (x, z, y = 3.8, intensity = 3.5) => {
  const chain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6),
    mineMetalMat
  );
  chain.position.set(x, y + 0.35, z);
  mineGroup.add(chain);

  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.14, 0.32, 8),
    mineMetalMat
  );
  cage.position.set(x, y, z);
  mineGroup.add(cage);

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mineGlowMat);
  glow.position.set(x, y - 0.02, z);
  mineGroup.add(glow);

  const light = new THREE.PointLight(0xd89b54, intensity, 7.5, 1.8);
  light.position.set(x, y - 0.05, z);
  mineGroup.add(light);
  mineLights.push(light);
};

const addMineTorch = (x, z, rot = 0, intensity = 4.2, range = 8.5) => {
  const bracketMat = mineWoodMat;
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.16), bracketMat);
  bracket.position.set(x, 2.15, z);
  bracket.rotation.y = rot;
  bracket.castShadow = false;
  mineGroup.add(bracket);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.16, 6), mineMetalMat);
  cup.position.set(x, 2.52, z);
  cup.castShadow = false;
  mineGroup.add(cup);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffa347,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 6), flameMat);
  flame.position.set(x, 2.74, z);
  mineGroup.add(flame);

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mineGlowMat);
  glow.position.set(x, 2.72, z);
  mineGroup.add(glow);

  const light = new THREE.PointLight(0xd89b54, intensity, range, 1.8);
  light.position.set(x, 2.62, z);
  light.userData.baseIntensity = intensity;
  mineGroup.add(light);
  mineLights.push(light);
};

// Four torch stations replace the old seven broad point lights. They illuminate
// the important junctions while leaving deeper stretches naturally darker.
for (const [x, z, rot, intensity] of [
  [104.0, 96.0, 0, 5.8],
  [94.0, 113.0, Math.PI / 2, 5.4],
  [127.0, 104.0, Math.PI, 5.8],
  [136.0, 122.0, -Math.PI / 2, 5.8],
]) {
  addMineTorch(x, z, rot, intensity, 9.0);
}

for (const [x, z, y, intensity] of [
  [110, 104.2, 3.7, 4.4],
  [99.5, 112, 3.4, 3.8],
  [123, 109, 3.4, 4.0],
  [108.5, 123.5, 3.5, 4.2],
  [122.5, 122.0, 3.2, 3.6],
]) {
  addHangingLamp(x, z, y, intensity);
}

// Crates and broken timber are placed against walls rather than in the
// navigation center. These sell the extraction/workshop history.
for (const [x, z, sx, sy, sz, ry] of [
  [96.8, 101.4, 1.0, 0.9, 0.9, 0.1],
  [98.0, 102.0, 0.75, 0.65, 0.75, -0.2],
  [125.5, 107.0, 1.1, 0.8, 0.9, 0.15],
  [126.2, 108.0, 0.75, 0.55, 0.7, -0.25],
  [95.8, 124.8, 1.2, 0.7, 0.9, 0.2],
  [125.5, 123.0, 1.1, 0.8, 0.9, -0.15],
]) {
  mineBox(sx, sy, sz, x, sy * 0.5, z, mineWoodMat, ry, { colliderRadius: Math.max(sx, sz) * 0.62 });
}

// Loose rock/debris clusters break up the floor edges. They are decorative and
// intentionally small enough to avoid creating navigation traps.
for (const [x, z, sx, sy, sz, ry] of [
  [95.2, 109.2, 0.8, 0.45, 0.6, 0.2],
  [96.0, 115.0, 0.65, 0.35, 0.5, -0.3],
  [124.8, 113.0, 0.75, 0.4, 0.55, 0.15],
  [126.0, 118.0, 0.9, 0.5, 0.7, -0.2],
  [104.5, 125.8, 0.8, 0.38, 0.6, 0.25],
  [117.8, 126.2, 0.7, 0.35, 0.5, -0.15],
]) {
  mineBox(sx, sy, sz, x, sy * 0.5, z, mineRockDarkMat, ry);
}

// Old mining markers: small wooden posts with colored cloth. They help the
// player distinguish extraction branches without turning them into UI arrows.
const markerMat = new THREE.MeshStandardMaterial({ color: 0x6b4b2d, roughness: 1 });
const markerClothMat = new THREE.MeshStandardMaterial({ color: 0x6d2922, roughness: 1, flatShading: true });
for (const [x, z, rot] of [
  [103.2, 108.5, 0],
  [116.8, 108.5, Math.PI],
  [103.2, 119.0, 0],
  [118.0, 119.0, Math.PI],
]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6), markerMat);
  post.position.set(x, 0.75, z);
  post.rotation.z = (rot === 0 ? 1 : -1) * 0.04;
  post.castShadow = true;
  mineGroup.add(post);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.04), markerClothMat);
  cloth.position.set(x + (rot === 0 ? 0.19 : -0.19), 1.25, z);
  cloth.rotation.y = rot;
  cloth.castShadow = true;
  mineGroup.add(cloth);
}

// A few shallow damp patches give the floor variation without changing its
// collision height. They stay outside the main movement lanes.
const dampMat = new THREE.MeshStandardMaterial({
  color: 0x25272a,
  roughness: 0.75,
  metalness: 0.05,
  transparent: true,
  opacity: 0.7,
});
for (const [x, z, sx, sz, rot] of [
  [99, 106, 1.7, 0.8, 0.2],
  [124, 111.5, 1.5, 0.7, -0.25],
  [105.5, 124.8, 1.8, 0.75, 0.1],
  [121.5, 126.8, 1.4, 0.65, -0.2],
]) {
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 12), dampMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.rotation.z = rot;
  puddle.scale.set(sx, sz, 1);
  puddle.position.set(x, 0.015, z);
  mineGroup.add(puddle);
}

// Broken planks and tools left behind by the miners.
for (const [x, z, len, rot] of [
  [101.5, 111.0, 2.2, 0.35],
  [124.0, 114.8, 2.0, -0.4],
  [106.0, 126.0, 2.4, 0.2],
  [117.5, 125.0, 1.8, -0.25],
]) {
  mineBox(len, 0.18, 0.24, x, 0.11, z, mineWoodMat, rot, { colliderRadius: 0.34 });
}

// ---------- sprite dressing: spider colony ----------
// Real transparent sprite sheets replace the old idea of procedural line webs.
// Webs sit on the visual walls and cocoons hang above the floor; neither affects
// navigation or projectile collision.
for (const [variant,x,y,z,sx,sy,rot] of [
  [0, 91.2, 3.2, 98.7, 5.2, 4.2, -0.10],
  [1, 100.0, 3.0, 109.8, 4.8, 4.0, 0.12],
  [2, 137.5, 3.4, 108.8, 5.5, 4.4, -0.08],
  [3, 143.0, 3.0, 119.0, 4.9, 4.1, 0.16],
  [1, 130.8, 3.1, 127.0, 4.5, 3.8, -0.12],
]) {
  mineSheetSprite(mineWebTexture, variant, x, y, z, sx, sy, rot, 0.72);
}

for (const [variant,x,y,z,sx,sy,rot] of [
  [0, 91.8, 2.2, 100.0, 1.8, 3.0, -0.10],
  [2, 139.0, 2.0, 111.5, 1.7, 2.9, 0.08],
  [3, 145.0, 2.15, 120.0, 1.9, 3.1, -0.12],
  [1, 130.5, 2.1, 129.0, 1.6, 2.8, 0.10],
]) {
  mineSheetSprite(mineCocoonTexture, variant, x, y, z, sx, sy, rot, 0.9);
}

// Extra mine dressing: a few readable silhouettes tell the story of an
// abandoned extraction site without cluttering the walkable lanes.
const cartWheelMat = new THREE.MeshStandardMaterial({ color: 0x282421, roughness: 0.82, metalness: 0.25 });
const cartWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.95, flatShading: true });
const orePileMat = new THREE.MeshStandardMaterial({ color: 0x56656b, roughness: 0.72, metalness: 0.2, flatShading: true });

const addMineCart = (x, z, rotY = 0, scale = 1) => {
  const g = new THREE.Group();
  g.position.set(x, 0.16, z);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 1.25), cartWoodMat);
  bed.position.y = 0.48;
  bed.rotation.x = -0.12;
  g.add(bed);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.34), cartWoodMat);
  rim.position.y = 0.82;
  g.add(rim);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 10), cartWheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.72, 0.23, 0.58);
    g.add(wheel);
    const wheel2 = wheel.clone();
    wheel2.position.z = -0.58;
    g.add(wheel2);
  }
  mineGroup.add(g);
};

const addOrePile = (x, z, scale = 1) => {
  const g = new THREE.Group();
  g.position.set(x, 0.08, z);
  g.scale.setScalar(scale);
  for (const [ox,oz,s] of [[0,0,0.55],[-0.55,0.1,0.42],[0.45,0.12,0.46],[0.15,-0.35,0.38]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), orePileMat);
    rock.position.set(ox, s * 0.65, oz);
    rock.rotation.set(0, r() * Math.PI, 0);
    g.add(rock);
  }
  mineGroup.add(g);
};

const addPickaxe = (x, z, rotY = 0, scale = 1) => {
  const g = new THREE.Group();
  g.position.set(x, 0.05, z);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.55, 6), mineWoodMat);
  wood.rotation.z = Math.PI / 2;
  wood.position.y = 0.38;
  g.add(wood);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.95, 6), mineMetalMat);
  head.rotation.z = Math.PI / 2;
  head.position.set(0, 0.98, 0);
  g.add(head);
  mineGroup.add(g);
};

addMineCart(100.5, 123.5, 0.05, 0.92);
addMineCart(121.5, 124.0, 0.02, 0.82);
addOrePile(94.2, 121.8, 0.9);
addOrePile(128.8, 105.5, 0.82);
addOrePile(134.5, 126.2, 0.95);
addPickaxe(97.0, 126.0, -0.4, 0.95);
addPickaxe(135.5, 114.5, 0.6, 0.85);

// Fine dust hanging in the air is handled by the existing particle ambience.
// Stage 3 only adds the static visual layer; no new per-frame systems are
// introduced, keeping the mine load predictable.

const mine = {
  active: false,
  spawn: { x: 110, z: 101, facing: Math.PI },
  return: { x: 12.4, z: 37.2, facing: Math.PI },
  group: mineGroup,
  entrance: mineEntrance,
  chest: null,
  enemies: [],
  // Mine activation is staged across animation frames so the transition does not
  // wake every light/enemy/system on the same main-thread turn.
  loading: false,
  transitionToken: 0,
  minimap: {
    bounds: { minX: 68, maxX: 155, minZ: 78, maxZ: 155 },
    zones: undergroundZones,
  },
};

// ---------- Stage 4 natural boss cave + optional miniboss ----------
// This is NOT the main Area 1 boss arena. Morvhal remains above, in the
// Santuário Afundado, and the mine is an optional exploration branch.
// The cave is a deeper natural pocket reached through the south-east gallery.

// Irregular cave walls: short rock segments overlap at slightly different
// angles so the chamber reads as carved/natural instead of another rectangle.
for (const [x1,z1,x2,z2,h] of [
  [123,126,127,127,5.2],
  [127,127,130,131,5.6],
  [130,131,128,134,6.0],
  [128,134,121,135,6.2],
  [121,135,114,133,5.5],
  [114,133,110,130,5.0],
  ]) {
  mineWall(x1,z1,x2,z2,h);
}

// Interior rock teeth create depth around the chamber while leaving a clear
// combat floor in the center.
for (const [x,z,sx,sy,sz,rot] of [
  [114.5,129.0,1.4,3.8,1.2,-0.3],
  [118.0,133.0,1.6,4.5,1.3,0.2],
  [125.5,130.8,1.8,4.8,1.4,-0.15],
  [128.0,133.0,1.2,4.2,1.0,0.25],
  [121.0,129.8,1.0,3.2,1.1,0.1],
]) {
  mineRock(x,z,sx,sy,sz,rot,mineRockDarkMat, { colliderRadius: Math.max(0.45, Math.min(sx, sz) * 0.72) });
}

// Cave ceiling stalactites are visual only. They stop well above the player
// and never form a low roof/collision trap.
for (const [x,z,h,sx] of [
  [113,128,2.6,0.8],
  [117,130,3.2,0.9],
  [123,128,2.8,0.75],
  [128,130,3.5,1.0],
  [126,133,2.4,0.7],
]) {
  const stal = new THREE.Mesh(
    new THREE.ConeGeometry(sx * 0.62, h, 7),
    mineRockDarkMat
  );
  stal.position.set(x, 5.8, z);
  stal.rotation.y = r() * Math.PI;
  stal.castShadow = true;
  mineGroup.add(stal);
}

// Cave floor rocks define the edges of the arena and leave the center open.
for (const [x,z,s] of [
  [112.5,131.8,0.8],[116,127.5,0.65],[119,134,0.9],
  [126,127.8,0.7],[129,132,0.85],[123,134.2,0.65],
]) {
  mineRock(x,z,s,0.7,s*0.9,r()*0.5,mineRockDarkMat, { colliderRadius: s * 0.7 });
}

// A cold underground spring gives the chamber a distinct visual landmark.
const springMat = new THREE.MeshStandardMaterial({
  color: 0x33434a, roughness: 0.25, metalness: 0.15,
  transparent: true, opacity: 0.78,
});
const spring = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), springMat);
spring.rotation.x = -Math.PI / 2;
spring.scale.set(1.4, 0.7, 1);
spring.position.set(126.0,0.018,133.0);
mineGroup.add(spring);

const caveCrystalMat = new THREE.MeshStandardMaterial({
  color: 0x7a8d92, roughness: 0.35, metalness: 0.15, flatShading: true,
});
for (const [x,z,s] of [[113,130,0.7],[119,134,0.85],[128,131,0.9],[124,128,0.55]]) {
  const crystal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55,0), caveCrystalMat);
  crystal.position.set(x,0.75,z);
  crystal.scale.set(0.65*s,1.7*s,0.65*s);
  crystal.rotation.set(0,r()*Math.PI,0.15);
  crystal.castShadow=false;
  mineGroup.add(crystal);
}

// Cave collision is authored by the same mineWall() segments above.
// There is intentionally no second rectangular collider layer here.

// Miniboss arena marker: subtle stone ring, no gameplay lock.
// The player can enter, retreat, and return to the surface normally.
const miniRing = new THREE.Mesh(
  new THREE.RingGeometry(3.8,4.2,20),
  mineOreMat
);
miniRing.rotation.x=-Math.PI/2;
miniRing.position.set(121.5,0.025,131.0);
mineGroup.add(miniRing);

// Dedicated cave lights create a visual transition from worked mine to natural cave.
for (const [x,z,intensity] of [
  [116,129,3.5],[124,130,4.5],[129,132,3.8]
]) addHangingLamp(x,z,4.4,intensity);

// Optional miniboss: completely separate from Morvhal and does NOT advance the
// Area 1 progression. It exists to make the deepest mine route worth exploring.
const mineMiniboss = new MineBoss(game,126.5,143.0,{
  name:'Gorvak, o Guardião das Profundezas',
  onDefeated:()=>{
    prog.setCounter('mineMinibossDefeated', true);
    game.onBossDefeated({
      xp:320,
      gold:220,
      loot:[{itemId:'iron_scrap',amount:8},{itemId:'hollow_core',amount:1}]
    },mineMiniboss.pos);
    game.schedule(0.5,()=>game.ui.hideBoss());
    game.ui.banner('PROFUNDEZAS LIMPA','Gorvak caiu. A caverna revelou o antigo cache dos mineiros.','victory',3.5);
  },
});
mineMiniboss.isMineMiniboss=true;
mineMiniboss.activeWhenMine=false;
game.addEnemy(mineMiniboss);

const stage4Trigger={
  started:false,
  update(){
    if(this.started || !mine.active || mineMiniboss.state==='dead') return;
    const p=game.player.pos;
    if(p.x>113 && p.x<143 && p.z>136 && p.z<150){
      this.started=true;
      mineMiniboss.awaken();
      game.ui.showBoss(mineMiniboss.name);
      game.ui.banner('GORVAK','Algo antigo desperta na caverna.','boss',3);
    }
  }
};

// ---------- Stage 5 gameplay: mine combat loop + miniboss reward ----------
// The mine now has a complete optional gameplay loop:
// enter -> clear patrols -> explore -> awaken Gorvak -> defeat him ->
// claim the deep cache -> return to the surface. Morvhal's progression is
// intentionally untouched.

const originalMinibossUpdate = mineMiniboss.update.bind(mineMiniboss);
mineMiniboss.update = (dt) => {
  if (!mine.active && mineMiniboss.state !== 'dead') return;
  originalMinibossUpdate(dt);
};

const mineDeepChest = createChest(game, 126.5, 147.0, Math.PI);
mineDeepChest.root = null;

game.interaction.add({
  pos: mineDeepChest.pos,
  radius: 2.4,
  height: 2.2,
  label: () => mineDeepChest.opened ? 'Cofre das profundezas vazio' : 'Abrir cofre das profundezas',
  enabled: () => mine.active && mineMiniboss.state === 'dead' && !mineDeepChest.opened,
  onInteract: () => {
    mineDeepChest.open();
    prog.setCounter('mineDeepChestOpened', true);
    game.rewardCharacter(0, 160);
    game.spawnGroundLoot([
      { itemId: 'iron_scrap', amount: 8 },
      { itemId: 'wisp_essence', amount: 2 },
      { itemId: 'red_potion', amount: 3 },
    ], mineDeepChest.pos);
    game.ui.banner('TESOURO DAS PROFUNDEZAS', 'O cofre escondia os últimos suprimentos dos antigos mineiros.', 'victory', 3.2);
  },
});

// A second ranged patrol makes the final gallery less predictable without
// turning the mine into another mandatory boss corridor.
mine.enemies.push(
  spawn('wisp', 139, 111, 'mine', true),
  spawn('zombie', 107.5, 126.5, 'mine', true),
  spawn('spider', 121, 136, 'mine', true),
  spawn('spiderling', 126, 128, 'mine', true),
);



// Timber supports are intentionally simple Box geometry. Their collision is
// also Box-shaped and only blocks the actual posts, never the full corridor.
function addSupport(x, z, span = 4.8, rotY = 0) {
  const half = span * 0.5;
  for (const side of [-1, 1]) {
    const px = x + Math.cos(rotY) * side * half;
    const pz = z + Math.sin(rotY) * side * half;
    mineBox(0.42, 4.2, 0.42, px, 2.1, pz, mineWoodMat, 0, { colliderRadius: 0.32 });
    // Timber posts are decorative only. Their old colliders sat on corridor
    // edges and could feel like invisible walls despite visible open space.
  }
  mineBox(span + 0.8, 0.45, 0.45, x, 4.05, z, mineWoodMat, rotY);
};

addSupport(99, 101, 4.8, 0);
addSupport(116, 101, 4.8, 0);
addSupport(100, 116, 4.8, Math.PI / 2);
addSupport(120, 116, 4.8, Math.PI / 2);

// Simple rails in the two extraction branches. Decorative in Stage 1; they do
// not become gameplay obstacles.
for (const [x, z, rotY, len] of [
  [101, 121, 0, 9],
  [120, 121, 0, 9],
]) {
  for (const offset of [-1.15, 1.15]) {
    mineBox(0.12, 0.12, len, x + offset, 0.08, z, mineMetalMat, rotY);
  }
  for (let i = -3; i <= 3; i++) {
    mineBox(3.0, 0.14, 0.34, x, 0.02, z + i * 1.3, mineWoodMat);
  }
}

// A small number of ore veins establishes the mine identity without starting
// the full prop pass yet.
for (const [x, y, z, s] of [
  [94.8, 1.6, 109, 0.65],
  [96.0, 2.0, 121, 0.8],
  [124.8, 1.7, 101.5, 0.7],
  [124.5, 1.8, 121, 0.75],
  [107, 1.7, 127, 0.6],
]) {
  const vein = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), mineOreMat);
  vein.position.set(x, y, z);
  vein.scale.set(s, 0.65 * s, 1.35 * s);
  vein.rotation.set(0, 0.3, 0.2);
  vein.castShadow = true;
  mineGroup.add(vein);
}

for (const [x, z] of [[99, 101], [116, 101], [100, 116], [120, 116]]) {
  mineLamp(x, z);
}

// The underground state remains compatible with the existing transition,
// enemies, chest and return interaction. Later stages can extend only this
// pocket without touching the approved surface entrance.


const surfaceMinimap = {
  bounds: { minX: -42, maxX: 42, minZ: -62, maxZ: 61 },
  zones: [
    [-14, 14, 10, 45], [-32, -14, 14, 34], [-40, -23, -16, 18], [-18, 18, 45, 58],
    [-35, -18, 34, 58], [-22, 22, -20, 13], [-11, 11, -31, -20], [14, 38, 4, 16],
  ],
};

const enterMine = () => {
  if (mine.active || game.state !== 'play' || game.inputLocked) return;
  game.inputLocked = true;
  game.ui.hidePrompt();
  game.ui.fade(true);

  // Do not wake the whole mine in one synchronous turn. The scene geometry is
  // already built, so the safe optimization here is to stagger visibility and
  // gameplay systems across animation frames instead of rebuilding anything.
  const token = ++mine.transitionToken;
  mine.loading = true;

  game.schedule(0.55, () => {
    if (!mine.loading || mine.transitionToken !== token || game.state !== 'play') return;

    mine.active = true;
    mine.group.visible = true;

    // Keep dynamic lights asleep for the first rendered mine frame. Static
    // geometry can appear immediately without also activating every PointLight.
    for (const light of mineLights) light.visible = false;

    game.player.place(mine.spawn.x, mine.spawn.z, mine.spawn.facing);
    game.rig.snap(game.player.pos);
    area.minimap.bounds = mine.minimap.bounds;
    area.minimap.zones = mine.minimap.zones;
    game.ui.banner('MINA ABANDONADA', 'O antigo poço ainda guarda caminhos sob a floresta.', 'boss', 3.2);

    const nextFrame = (fn) => requestAnimationFrame(() => {
      if (!mine.loading || mine.transitionToken !== token || !mine.active) return;
      fn();
    });

    // Frame 1 after the dungeon is visible: restore the mine lighting.
    nextFrame(() => {
      for (const light of mineLights) light.visible = true;

      // Frame 2: wake the regular mine patrols.
      nextFrame(() => {
        for (const e of game.enemies) {
          if (e.group === 'mine' && !e.removed) e.root.visible = true;
        }

        // Frame 3: wake the optional miniboss only after the regular patrols
        // are active. This avoids a second enemy/animation spike on the entry
        // frame while preserving exactly the same gameplay state.
        nextFrame(() => {
          mineMiniboss.root.visible = mineMiniboss.state !== 'dead';
          mine.loading = false;
        });
      });
    });
  });

  game.schedule(0.9, () => {
    if (mine.transitionToken !== token || game.state !== 'play') return;
    game.ui.fade(false);
    game.inputLocked = false;
  });
};

const leaveMine = () => {
  if (!mine.active || game.state !== 'play' || game.inputLocked) return;
  game.inputLocked = true;
  game.ui.hidePrompt();
  game.ui.fade(true);
  ++mine.transitionToken;
  mine.loading = false;
  game.schedule(0.45, () => {
    mine.active = false;
    mine.group.visible = false;
    for (const light of mineLights) light.visible = true;
    for (const e of game.enemies) {
      if (e.group === 'mine' && !e.removed) e.root.visible = false;
    }
    mineMiniboss.root.visible = false;
    game.player.place(mine.return.x, mine.return.z, mine.return.facing);
    game.rig.snap(game.player.pos);
    area.minimap.bounds = surfaceMinimap.bounds;
    area.minimap.zones = surfaceMinimap.zones;
  });
  game.schedule(0.8, () => {
    game.ui.fade(false);
    game.inputLocked = false;
  });
};

  // ---------- quest state ----------
  const prog = new Progression(game, [
    { id: 'arrive', timeline: 'Conhecer Maren', text: 'Fale com Maren, a Vigia, perto da fogueira', hint: 'Aproxime-se e pressione E' },
    { id: 'braziers', timeline: 'Reacender as Chamas-Vigia', text: (c) => `Reacenda as Chamas-Vigia no pátio em ruínas (${c.lit || 0}/3)`, hint: 'O fogo não pega com Ocos por perto' },
    { id: 'shrine', timeline: 'Abrir o Santuário Afundado', text: 'O selo caiu. Entre no Santuário Afundado', hint: 'Siga para o norte, além do portão' },
    { id: 'boss', timeline: 'Enfrentar Morvhal', text: 'Derrote Morvhal, o Guardião Oco', hint: 'Fique fora das áreas vermelhas' },
    { id: 'portal', timeline: 'Abrir o caminho adiante', text: 'Atravesse o portal para a próxima área', hint: 'Ao fundo do santuário' },
    { id: 'complete', timeline: 'Concluir a Floresta de Vhal', text: 'Área 1 concluída!' },
  ], 'area1');

  // ---------- forgotten prisoner + lore book ----------
  // A prisoner died chained in the middle of the ruined courtyard.
  // His diary was written shortly before his death and remains beside him.
  const corpse = new THREE.Group();
  corpse.name = 'forgotten-explorer-corpse';

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xb9b19f, roughness: 0.95, metalness: 0, flatShading: true,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x29272a, roughness: 1, metalness: 0, flatShading: true,
  });

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), boneMat);
  skull.scale.set(1, 0.82, 0.9);
  skull.position.set(0.45, 0.48, 0);
  corpse.add(skull);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.55, 7), boneMat);
  spine.rotation.z = Math.PI / 2;
  spine.position.set(-0.45, 0.22, 0);
  corpse.add(spine);

  for (const [x, z, rot, len] of [
    [-0.25, -0.42, -0.45, 1.35], [-0.2, 0.42, 0.5, 1.35],
    [0.55, -0.48, -0.8, 1.15], [0.65, 0.45, 0.7, 1.15],
  ]) {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, len, 6), boneMat);
    bone.rotation.z = Math.PI / 2 + rot;
    bone.position.set(x, 0.16 + r() * 0.08, z);
    corpse.add(bone);
  }

  for (const [x, z, rot] of [[-0.95, -0.35, -0.55], [-0.95, 0.35, 0.55]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.45, 6), boneMat);
    leg.rotation.z = Math.PI / 2 + rot;
    leg.position.set(x, 0.18, z);
    corpse.add(leg);
  }

  const tornCloak = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.05), clothMat);
  tornCloak.position.set(-0.2, 0.13, 0);
  tornCloak.rotation.y = -0.18;
  corpse.add(tornCloak);

  // The prisoner died in the middle of the courtyard, close to the upper pillars.
  // Keep the body and diary away from the boss corridor so this reads as an
  // environmental story beat, not as a second boss-entrance landmark.
  const prisonerPos = new THREE.Vector3(0, 0, 4.8);
  corpse.position.copy(prisonerPos);
  corpse.rotation.y = -0.35;
  scene.add(corpse);

  // Rusted floor anchors and chains make it immediately readable that this
  // skeleton was restrained here rather than simply dying in battle.
  const chainMat = new THREE.MeshStandardMaterial({
    color: 0x3b3d3f, roughness: 0.82, metalness: 0.72, flatShading: true,
  });
  const chainLink = (a, b) => {
    const start = new THREE.Vector3(a.x, a.y, a.z);
    const end = new THREE.Vector3(b.x, b.y, b.z);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const length = dir.length();
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 10), chainMat);
    link.position.copy(mid);
    link.rotation.x = Math.PI / 2;
    link.rotation.y = Math.atan2(dir.x, dir.z);
    link.scale.set(1, Math.max(0.7, length / 0.22), 1);
    return link;
  };

  const prisonerChains = new THREE.Group();
  prisonerChains.name = 'prisoner-chains';

  for (const [x, z] of [[-0.78, 4.48], [0.72, 4.42]]) {
    const anchor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.12, 8),
      chainMat
    );
    anchor.position.set(x, 0.08, z);
    anchor.rotation.x = Math.PI / 2;
    prisonerChains.add(anchor);
  }

  const chainSegments = [
    [[-0.52, 0.34, 4.52], [-0.78, 0.20, 4.48]],
    [[-0.26, 0.30, 4.46], [-0.52, 0.34, 4.52]],
    [[0.46, 0.34, 4.44], [0.72, 0.20, 4.42]],
    [[0.20, 0.30, 4.42], [0.46, 0.34, 4.44]],
  ];
  for (const [[ax, ay, az], [bx, by, bz]] of chainSegments) {
    prisonerChains.add(chainLink(
      { x: ax, y: ay, z: az },
      { x: bx, y: by, z: bz }
    ));
  }
  scene.add(prisonerChains);

  // The journal is placed directly beside the corpse, as if it was the last
  // thing he managed to write before dying.
  const loreBook = new THREE.Group();
  loreBook.name = 'morvhal-journal';
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x3a2118, roughness: 0.9, metalness: 0 });
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 1, metalness: 0 });
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 1.05), coverMat);
  cover.position.y = 0.12;
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.88), pageMat);
  pages.position.y = 0.2;
  loreBook.add(cover, pages);
  loreBook.position.set(1.35, 0.08, 4.15);
  loreBook.rotation.set(-0.08, -0.35, 0.12);
  scene.add(loreBook);

  const loreBookAnchor = new THREE.Object3D();
  loreBookAnchor.position.set(1.35, 0.75, 4.15);
  scene.add(loreBookAnchor);

  // ---------- exploration points of interest ----------
  // Optional rewards/lore for the two new branches. Both rewards are one-time
  // and persist through Progression counters, so exploration has real value.
  const groveRelic = createRuneStone(game, -31.5, -1.5);
  const northRelic = createChest(game, 1.5, 51.5, -0.2);
  const groveAnchor = new THREE.Object3D();
  groveAnchor.position.set(-31.5, 2.0, -1.5);
  scene.add(groveAnchor);

  const northMarker = new THREE.Object3D();
  northMarker.position.set(1.5, 0.9, 51.5);
  scene.add(northMarker);

  // ---------- set pieces ----------
  const campfire = createCampfire(game, 0.1, 35.2);
  createSign(game, 2.8, 43.5, -0.4);
  const runeStone = createRuneStone(game, 10, 24);
  // Hide the lever deeper in the ruined courtyard, beside the broken wall.
  const secretLever = createLever(game, 20.8, 8.6, -0.8);
  // The old chest used to sit outside the secret passage. It now lives inside
  // the chamber, so opening the passage reveals the actual reward room.
  const chest = createChest(game, 32.5, 11.8, 0.2);
  const secretGate = createSecretGate(game, 23, 10.0, Math.PI / 2, 4.2);
  const braziers = [createBrazier(game, -15, 2), createBrazier(game, 15, 2), createBrazier(game, 0, -12)];
  const gate = createGate(game, 0, -20);
  const portal = createPortal(game, 0, -55.5);

  // The Map 2 portal is an explicit interaction: walk up to it and press E.
  // This avoids triggering the transition merely by touching the portal.
  const portalAnchor = new THREE.Object3D();
  portalAnchor.position.copy(portal.pos);
  scene.add(portalAnchor);
  const barrierMat = new THREE.MeshBasicMaterial({ color: 0xb42a5a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), barrierMat);
  barrier.position.set(0, 3, -30.2);
  scene.add(barrier);
  const barrierCol = collision.addBox(-3.5, 3.5, -30.6, -29.8, { enabled: false });

  // ---------- protection zone: NPC plaza ----------
  // Visual-only PZ marker around the two surface NPCs. No collider is used.
  const npcPz = { x: 0.1, z: 35.2, radius: 8.2 };
  game.protectionZones ??= [];
  game.protectionZones = game.protectionZones.filter((zone) => zone.source !== 'area1-npc-plaza');
  game.protectionZones.push({ ...npcPz, source: 'area1-npc-plaza' });
  const pzGroup = new THREE.Group();
  pzGroup.name = 'npc-protection-zone';
  scene.add(pzGroup);

  // PZ floor: real stone paving, not a flat translucent blob.
  // Keep the base dark so the individual slabs read clearly against the grass.
  const pzBase = new THREE.Mesh(
    new THREE.CircleGeometry(npcPz.radius, 64),
    new THREE.MeshStandardMaterial({
      color: 0x403d38, roughness: 1, metalness: 0,
      side: THREE.DoubleSide,
    })
  );
  pzBase.rotation.x = -Math.PI / 2;
  pzBase.position.set(npcPz.x, 0.012, npcPz.z);
  pzBase.receiveShadow = true;
  pzGroup.add(pzBase);

  const pzStoneMats = [
    new THREE.MeshStandardMaterial({ color: 0x5a5751, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x66625a, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x4e4c47, roughness: 1, flatShading: true }),
  ];
  const pzStones = new THREE.Group();
  pzStones.position.set(npcPz.x, 0.035, npcPz.z);
  pzGroup.add(pzStones);

  // Staggered irregular paving slabs form the actual readable floor.
  for (let gx = -7.5; gx <= 7.5; gx += 1.45) {
    for (let gz = -7.5; gz <= 7.5; gz += 1.35) {
      const x = gx + Math.sin(gz * 2.7) * 0.22;
      const z = gz + Math.cos(gx * 2.1) * 0.18;
      if (Math.hypot(x, z) > npcPz.radius - 0.45) continue;
      const w = 1.15 + ((Math.abs(Math.sin(gx * 3.1 + gz)) * 0.35));
      const d = 0.92 + ((Math.abs(Math.cos(gz * 2.4 - gx)) * 0.28));
      const stone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.54, 0.12, 6),
        pzStoneMats[(Math.abs(Math.floor(gx + gz * 3))) % pzStoneMats.length]
      );
      stone.scale.set(w, 1, d);
      stone.position.set(x, 0, z);
      stone.rotation.y = Math.sin(gx * 4.1 + gz * 1.7) * 0.45;
      stone.castShadow = true;
      stone.receiveShadow = true;
      pzStones.add(stone);
    }
  }

  const pzInner = new THREE.Mesh(
    new THREE.RingGeometry(npcPz.radius - 0.28, npcPz.radius - 0.16, 64),
    new THREE.MeshBasicMaterial({
      color: 0x8f8778, transparent: true, opacity: 0.55,
      depthWrite: false, side: THREE.DoubleSide,
    })
  );
  pzInner.rotation.x = -Math.PI / 2;
  pzInner.position.set(npcPz.x, 0.15, npcPz.z);
  pzGroup.add(pzInner);

  const pzRing = new THREE.Mesh(
    new THREE.RingGeometry(npcPz.radius - 0.16, npcPz.radius, 64),
    new THREE.MeshBasicMaterial({
      color: 0x7f9f9a, transparent: true, opacity: 0.68,
      depthWrite: false, side: THREE.DoubleSide,
    })
  );
  pzRing.rotation.x = -Math.PI / 2;
  pzRing.position.set(npcPz.x, 0.035, npcPz.z);
  pzGroup.add(pzRing);

  const pzIcon = new THREE.Group();
  pzIcon.position.set(npcPz.x, 3.05, npcPz.z);
  pzGroup.add(pzIcon);

  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(0, 0.62);
  shieldShape.lineTo(0.52, 0.38);
  shieldShape.lineTo(0.43, -0.18);
  shieldShape.quadraticCurveTo(0.30, -0.52, 0, -0.68);
  shieldShape.quadraticCurveTo(-0.30, -0.52, -0.43, -0.18);
  shieldShape.lineTo(-0.52, 0.38);
  shieldShape.closePath();

  const shield = new THREE.Mesh(
    new THREE.ShapeGeometry(shieldShape),
    new THREE.MeshBasicMaterial({
      color: 0x5e9b91, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  shield.scale.setScalar(0.72);
  pzIcon.add(shield);

  const shieldCore = new THREE.Mesh(
    new THREE.ShapeGeometry(shieldShape),
    new THREE.MeshBasicMaterial({
      color: 0xdce8df, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  shieldCore.scale.setScalar(0.39);
  shieldCore.position.z = 0.01;
  pzIcon.add(shieldCore);

  const pzCrossMat = new THREE.MeshBasicMaterial({
    color: 0x4f8179, transparent: true, opacity: 0.95,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.34), pzCrossMat);
  const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.10), pzCrossMat);
  crossV.position.z = 0.02;
  crossH.position.z = 0.021;
  pzIcon.add(crossV, crossH);

  // Keep the shield upright in world space.
  pzIcon.rotation.set(0, 0, 0);

  // ---------- quest ----------


  const maren = new NPC(game, {
    name: 'Maren, a Vigia', x: -4.6, z: 35.2, facing: 0.6,
    look: { skin: 0xcaa27e, body: 0x3d4a42, legs: 0x26322f, robe: 0x34453d, hood: 0x263b36, head: 'hood', accent: 0xc4a85c, npcRole: 'watcher' },
    dialogue: () => {
      if (!prog.reached('braziers')) {
        return {
          lines: [
            'Viajante... chegou em má hora. A floresta de Vhal apodrece desde que o santuário foi selado.',
            'Ao norte ficam as ruínas do velho pátio. Três Chamas-Vigia guardavam o portão do Santuário Afundado.',
            'Os Ocos as apagaram. Reacenda as três chamas e o selo do portão vai se romper.',
            'Mas cuidado: o fogo não pega enquanto os mortos estiverem por perto. Limpe a área antes.',
            'E lá embaixo dorme Morvhal, o antigo guardião. Se ele despertar... acabe com ele.',
          ],
          onDone: () => {
            if (prog.advance('braziers')) { game.ui.toast('Novo objetivo: reacender as Chamas-Vigia'); maren.setMarker(null); }
          },
        };
      }
      if (!prog.reached('shrine')) return { lines: [`Ainda faltam ${3 - lit()} chama(s). Derrote os Ocos perto de cada braseiro e use [E] para acendê-lo.`] };
      if (!prog.reached('portal')) return { lines: ['O selo caiu! Eu senti daqui. Morvhal espera no santuário... que a luz te guie.'] };
      return { lines: ['Você conseguiu. A floresta respira de novo.', 'O caminho para as Criptas Submersas está aberto. Eu nunca vou esquecer isso, viajante.'] };
    },
  });
  game.npcs.push(maren);

  const merchant = new NPC(game, {
    name: 'Doran, o Mercador',
    x: 4.8, z: 35.2, facing: -0.6,
    look: { skin: 0x8f5d43, body: 0x624a35, legs: 0x30231d, robe: 0x795c3f, hood: 0x4a3428, head: null, accent: 0xd5aa58, npcRole: 'merchant', hat: 0x735536 },
    dialogue: () => ({
      lines: [
        'Tenho algumas mercadorias úteis para quem pretende atravessar as ruínas. Também mantenho alguns equipamentos simples para quem ainda está começando.',
        'Não espere pechincha: a estrada até Vhal está cada vez mais perigosa.',
        'Escolha o que precisar e pague em ouro. Volte quando quiser reabastecer.',
      ],
    }),
    service: () => {
      game.openShop({
        npcName: 'Doran, o Mercador',
        stock: [
          { itemId: 'red_potion', price: 20 },
          { itemId: 'mana_potion', price: 22 },
          { itemId: 'iron_scrap', price: 12 },
          { itemId: 'wisp_essence', price: 25 },
          { itemId: 'moon_herb', price: 40 },

          // Equipamentos iniciais do comerciante: acima dos achados dos mobs,
          // mas ainda claramente pertencentes à progressão da Área 1.
          { itemId: 'leather_cap', price: 65 },
          { itemId: 'reinforced_leggings', price: 72 },
          { itemId: 'leather_boots', price: 68 },
          { itemId: 'warding_amulet', price: 85 },
          { itemId: 'iron_buckler', price: 95 },
        ],
      });
    },
  });
  merchant.setMarker(0xe8b95b);
  game.npcs.push(merchant);

  game.interaction.add({
    pos: portalAnchor.position,
    radius: 3.0,
    height: 3.2,
    label: 'Entrar no portal para o Deserto',
    enabled: () => portal.active && prog.reached('portal'),
    onInteract: () => {
      if (!portal.active || !prog.reached('portal')) return;
      prog.advance('complete');
      game.enterArea2();
    },
  });

  game.interaction.add({
    pos: mineEntrance.position,
    radius: 3.0,
    height: 4.0,
    label: () => mine.active ? 'Descer para a mina abandonada' : 'Entrar na mina abandonada',
    enabled: () => !mine.active,
    onInteract: enterMine,
  });

  game.interaction.add({
    pos: mineLightRune.pos,
    radius: 2.4,
    height: 4.0,
    label: 'Ler Runa da Luz Arcana',
    onInteract: () => game.dialogue.open('Runa da Luz Arcana', [
      '"Nas profundezas, a luz comum não alcança todos os caminhos."',
      '"Concentre sua energia arcana para iluminar o que está oculto."',
      'Pressione L para lançar a Luz Arcana.',
      'A luz permanece por 20 segundos e então se desfaz.',
    ], mineLightRune.anchor),
  });

  const mineExitAnchor = new THREE.Object3D();
  mineExitAnchor.position.set(mine.spawn.x, 1.0, mine.spawn.z - 1.4);
  scene.add(mineExitAnchor);
  game.interaction.add({
    pos: mineExitAnchor.position,
    radius: 2.8,
    height: 3.0,
    label: 'Subir para a superfície',
    enabled: () => mine.active,
    onInteract: leaveMine,
  });

  // Rock around the surface mouth is solid; only the interaction itself opens
  // the transition, so the player cannot simply walk through the scenery.
  collision.addBox(8.8,10.8,32.0,38.0);
  collision.addBox(14.0,16.0,32.0,38.0);
  collision.addCircle(12.4,35.0,1.15);

  const lit = () => braziers.filter((b) => b.lit).length;

  if (prog.counters.northRelicOpened) northRelic.restoreOpen();

  game.interaction.add({
    pos: groveAnchor.position, radius: 2.7, height: 3.0,
    label: 'Examinar altar esquecido',
    enabled: () => !prog.counters.groveRelicRead,
    onInteract: () => {
      prog.setCounter('groveRelicRead', true);
      game.dialogue.open('Altar do Bosque Suspenso', [
        'As pedras estão cobertas de raízes, mas ainda existe uma inscrição sob o musgo.',
        '\\"Os que vigiam a porta não devem esquecer o caminho de volta.\\"',
        '\\"Quando as chamas morrerem, siga para o norte. A torre quebrada guarda o último sinal.\\"',
        'Uma pequena luz azul percorre a runa e desaparece entre as árvores.',
      ], groveAnchor);
      game.ui.toast('Você encontrou um vestígio antigo do Santuário.');
    },
  });

  game.interaction.add({
    pos: northMarker.position, radius: 2.5, height: 2.2,
    label: () => northRelic.opened ? 'Relicário vazio' : 'Abrir relicário antigo',
    enabled: () => !northRelic.opened,
    onInteract: () => {
      northRelic.open();
      prog.setCounter('northRelicOpened', true);
      game.rewardCharacter(0, 70);
      game.spawnGroundLoot([
        { itemId: 'wisp_essence', amount: 2 },
        { itemId: 'moon_herb', amount: 1 },
      ], northRelic.pos);
      game.ui.toast('Relicário aberto: 70 ouro e materiais raros.');
    },
  });

  const hostileNear = (pos, rad) => game.enemies.some((e) => e.alive && !e.isBoss && e.pos.distanceTo(pos) < rad);

  if (prog.counters.chestOpened) chest.restoreOpen();

  game.interaction.add({
    pos: chest.pos, radius: 2.5, height: 2.0,
    label: () => chest.opened ? 'Baú vazio' : 'Abrir baú antigo',
    enabled: () => !chest.opened,
    onInteract: () => {
      chest.open();
      prog.setCounter('chestOpened', true);
      game.rewardCharacter(0, 35);
      game.spawnGroundLoot([
        { itemId: 'red_potion', amount: 1 },
        { itemId: 'iron_scrap', amount: 3 },
      ], chest.pos);
      game.ui.toast('Baú aberto: 35 ouro e alguns suprimentos.');
    },
  });

  game.interaction.add({
    pos: runeStone.pos, radius: 2.8, height: 3.4, label: 'Ler pedra rúnica',
    onInteract: () => game.dialogue.open('Pedra Rúnica', [
      '"Não foi a floresta que apodreceu. Foi o que enterramos sob ela."',
      '"Quando os sinos silenciaram, os mortos começaram a chamar uns pelos outros sob as raízes."',
      '"Morvhal não era o carcereiro. Era a última coisa que ainda se lembrava de por que a porta devia permanecer fechada."',
      '"Se ele despertar, não confie no que ouvir. A voz que responde do fundo não é a dele."',
    ], runeStone.anchor),
  });

  // Prisoner diary: use the corpse as the interaction zone instead of relying
  // on the small book mesh. The book remains the visual target, while the
  // whole prisoner scene reliably responds to E from a comfortable distance.
  game.interaction.add({
    pos: prisonerPos,
    radius: 4.5,
    height: 2.4,
    label: 'Ler diário do prisioneiro',
    onInteract: () => {
      game.dialogue.open('Diário do Prisioneiro', [
        '"Não sei há quanto tempo estou preso neste pátio. As correntes já feriram meus pulsos até o osso."',
        '"Eles disseram que eu deveria vigiar a passagem e nunca tocar no selo. Eu deveria ter fugido quando tive a chance."',
        '"Ouço alguma coisa chamando debaixo das pedras. Morvhal não é o único que está preso aqui."',
        '"Escrevo estas últimas linhas porque talvez alguém encontre este diário quando eu já não puder falar."',
        '"Se você chegou até aqui, não repita meu erro. Não acorde o que está enterrado sob o santuário."',
      ], loreBookAnchor);
    },
  });

  game.interaction.add({
    pos: secretLever.pos, radius: 2.5, height: 3.4,
    label: () => prog.counters.secretOpened ? 'Mecanismo desativado' : 'Examinar mecanismo oculto',
    enabled: () => !prog.counters.secretOpened,
    onInteract: () => {
      prog.setCounter('secretOpened', true);
      secretLever.pull();
      secretGate.openGate();
      game.ui.toast('Um mecanismo antigo se move... uma passagem se abre na muralha.');
      game.ui.banner('ATALHO DESCOBERTO', 'A passagem lateral reconecta as ruínas à entrada.', 'victory', 3.2);
    },
  });

  braziers.forEach((b, i) => {
    game.interaction.add({
      pos: b.pos, radius: 2.6, height: 3.2, label: 'Acender Chama-Vigia',
      enabled: () => prog.reached('braziers') && !b.lit,
      onInteract: () => {
        if (hostileNear(b.pos, 10)) {
          game.ui.toast('A chama se recusa a acender... há Ocos por perto!');
          game.fx.emit(new THREE.Vector3(b.pos.x, 2.2, b.pos.z), { count: 20, color: 0x3aff9a, speed: 3, life: 0.6 });
          for (const e of game.enemies) if (e.alive && !e.isBoss && e.pos.distanceTo(b.pos) < 10) e.aggro();
          return;
        }
        b.light();
        game.rig.shake(0.3);
        const n = lit();
        const litIndices = braziers.reduce((indices, brazier, index) => {
          if (brazier.lit) indices.push(index);
          return indices;
        }, []);
        prog.setCounter('lit', n);
        prog.setCounter('litIndices', litIndices);
        game.ui.toast(`Chama-Vigia acesa (${n}/3)`);
        if (n === 3) openGate();
      },
    });
  });

  function openGate() {
    prog.advance('shrine');
    game.inputLocked = true;
    game.rig.cinematic(new THREE.Vector3(0, 0, -18), 3.2);
    game.schedule(0.8, () => { gate.openGate(); game.rig.shake(0.6); });
    game.schedule(1.0, () => game.ui.banner('O SELO SE ROMPE', 'O caminho para o Santuário Afundado está aberto'));
    game.schedule(3.4, () => { game.inputLocked = false; });
    area.checkpoint = { x: 0, z: -14, facing: Math.PI };
  }

  // ---------- enemies ----------
  function spawn(type, x, z, group, respawnable = false) {
    const e = game.addEnemy(new Enemy(game, type, x, z, { group }));
    if (group === 'mine') e.root.visible = mine.active;
    e.respawnable = respawnable;
    if (respawnable) e.spawnData = { type, x, z, group };
    return e;
  }

  // Farm mobs: each one returns after a short cooldown so the area can be used
  // as a safe XP/gold/loot farming loop.
  const farmSpawns = [
    ['hollow', -1, 18.5, 'path'], ['hollow', 3.5, 16, 'path'],
    ['hollow', -31, 12, 'grove'], ['wisp', -35, 4, 'grove'], ['hollow', -29, -10, 'grove'],
    ['wisp', -34, -12, 'grove'],
    ['zombie', -31, 52, 'cemetery'], ['zombie', -25, 53, 'cemetery'],
    ['zombie', -28, 46, 'cemetery'], ['zombie', -22, 41, 'cemetery'],
    ['zombie', -33, 40, 'cemetery'],
    ['hollow', -12.5, 5.5, 'west'], ['wisp', -17.5, -1.5, 'west'],
    ['hollow', 12.5, 5.5, 'east'], ['hollow', 16.5, -2, 'east'], ['wisp', 18, 6, 'east'],
    ['hollow', -3.5, -9, 'north'], ['hollow', 3.5, -10, 'north'], ['wisp', 0, -16.5, 'north'],
  ];
  farmSpawns.forEach(([type, x, z, group]) => spawn(type, x, z, group, true));

  const adds = [];

  // Underground enemies are created once and remain far outside the surface map
  // until the player enters the mine.
  mine.enemies.push(
    spawn('hollow', 102, 110, 'mine', true),
    spawn('zombie', 118, 112, 'mine', true),
    spawn('hollow', 110, 121, 'mine', true),
    // Mine colony: spiders occupy the side galleries instead of the central hub.
    spawn('spider', 92, 104, 'mine', true),
    spawn('spider', 94, 116, 'mine', true),
    spawn('spider', 138, 106, 'mine', true),
    spawn('spider', 143, 117, 'mine', true),
    spawn('spider', 86, 119, 'mine', true),
    spawn('spiderling', 97, 123, 'mine', true),
    spawn('spiderling', 136, 122, 'mine', true),
    spawn('spiderling', 118, 129, 'mine', true),
  );

  const mineChest = createChest(game, 118, 120, 0.15);
  mine.chest = mineChest;
  if (prog.counters.mineChestOpened) mineChest.restoreOpen();
  game.interaction.add({
    pos: mineChest.pos,
    radius: 2.5,
    height: 2.2,
    label: () => mineChest.opened ? 'Baú do mineiro vazio' : 'Abrir baú do mineiro',
    enabled: () => mine.active && !mineChest.opened,
    onInteract: () => {
      mineChest.open();
      prog.setCounter('mineChestOpened', true);
      game.rewardCharacter(0, 90);
      game.spawnGroundLoot([
        { itemId: 'iron_scrap', amount: 5 },
        { itemId: 'red_potion', amount: 2 },
      ], mineChest.pos);
      game.ui.toast('Baú do mineiro: 90 ouro e suprimentos encontrados.');
    },
  });

  const boss = new Boss(game, ARENA.x, ARENA.z - 3, {
    name: 'Morvhal, o Guardião Oco',
    onSummon: () => {
      for (const s of [-1, 1]) {
        const x = ARENA.x + s * 8, z = ARENA.z + 2;
        game.fx.emit(new THREE.Vector3(x, 1, z), { count: 40, color: 0x8affd8, speed: 4, up: 2, life: 1, size: 0.6 });
        const e = spawn('hollow', x, z, 'boss');
        e.aggro();
        adds.push(e);
      }
    },
    onDefeated: () => {
      game.onBossDefeated({ xp: 500, gold: 250, loot: [{ itemId: 'hollow_core', amount: 1 }, { itemId: 'moon_ring', amount: 1 }] }, boss.pos);
      game.stats.bossTime = game.time - fightStart;
      localStorage.setItem(BOSS_KEY, String(+(localStorage.getItem(BOSS_KEY) || 0) + 1));
      prog.advance('portal');
      for (const e of adds) if (e.alive) { e.takeDamage(9999, e.pos.clone().add(new THREE.Vector3(0, 0, 1))); }
      game.schedule(1.2, () => {
        game.ui.banner('VITÓRIA', 'Morvhal, o Guardião Oco, foi derrotado', 'victory', 4.5);
        game.ui.hideBoss();
      });
      game.schedule(3.6, () => {
        barrierCol.enabled = false;
        runeMat.color.set(0xffc36a);
        portal.rise();
        game.rig.cinematic(portal.pos, 3);
        game.ui.toast('Um portal se abriu ao fundo do santuário');
      });
      maren.setMarker(0x6ae0ff);
    },
  });
  game.addEnemy(boss);
  let fightStart = 0;

  function startBossFight() {
    prog.advance('boss');
    barrierCol.enabled = true;
    boss.awaken();
    fightStart = game.time;
    game.rig.cinematic(new THREE.Vector3(boss.pos.x, 0, boss.pos.z + 3), 2.4);
    game.schedule(0.9, () => game.ui.banner('MORVHAL', 'O Guardião Oco desperta', 'boss', 3));
    game.schedule(1.4, () => game.ui.showBoss(boss.name));
    game.ui.toast('As portas do santuário se fecham atrás de você...');
  }

  // ---------- area object ----------
  const area = {
    name: 'Floresta de Vhal',
    progression: prog,
    spawn: { x: 0.5, z: 42, facing: Math.PI },
    checkpoint: { x: 0.5, z: 38, facing: Math.PI },
    boss, braziers, gate, portal, secretGate,
    minimap: {
      bounds: surfaceMinimap.bounds,
      zones: surfaceMinimap.zones,
      arena: { x: ARENA.x, z: ARENA.z, r: ARENA.r },
      portal: { x: portal.pos.x, z: portal.pos.z },
    },

    onStart() {
      const restored = prog.load();

      if (restored) {
        const savedLit = Array.isArray(prog.counters.litIndices)
          ? prog.counters.litIndices
          : Array.from({ length: Math.min(3, Number(prog.counters.lit) || 0) }, (_, index) => index);

        savedLit.forEach((index) => {
          if (braziers[index] && !braziers[index].lit) braziers[index].restoreLit();
        });

        if (prog.reached('shrine')) {
          gate.restoreOpen();
        }

        // Secret passage state must be restored AFTER Progression.load().
        // Previously this ran before the saved counters were loaded, which
        // left the gate closed while the lever interaction stayed disabled.
        if (prog.counters.secretOpened) {
          secretGate.restoreOpen();
          secretLever.restorePulled();
        }

        if (prog.id === 'boss') {
          // A refresh during the boss fight must resume inside the sanctuary.
          // Progression is persisted, but the player's world position is not.
          barrierCol.enabled = true;
          boss.reset();
          boss.awaken();
          game.player.place(0, -34, Math.PI);
          // Restore the boss HUD too: a reload recreates the UI in a hidden state.
          game.ui.showBoss(boss.name);
          game.ui.setBoss(boss.hp / boss.maxHp, boss.enraged);
        } else if (prog.reached('portal')) {
          barrierCol.enabled = false;
          boss.alive = false;
          boss.state = 'dead';
          boss.root.visible = false;
          boss.tele?.forEach((telegraph) => game.fx.remove(telegraph));
          boss.tele = [];
          portal.restoreActive();
          runeMat.color.set(0xffc36a);
        }
      }

      prog.apply();

      if (prog.counters.mineDeepChestOpened) {
        mineDeepChest.restoreOpen();
      }
      if (prog.counters.mineMinibossDefeated) {
        mineMiniboss.alive = false;
        mineMiniboss.hp = 0;
        mineMiniboss.state = 'dead';
        mineMiniboss.root.visible = false;
        stage4Trigger.started = true;
      }

      game.ui.banner('FLORESTA DE VHAL', restored ? 'Progresso restaurado' : 'Área 1', '', 3.2);
      game.schedule(3.5, () => game.ui.toast('Use WASD para andar. Há uma luz perto da fogueira...'));
    },

    update(dt, t) {
      campfire.update(dt, t);
      if (mine.active && !mine.loading) {
        mineLightTick -= dt;
        if (mineLightTick <= 0) {
          mineLightTick = 0.08;
          for (const light of mineLights) {
            const base = light.userData.baseIntensity ?? light.intensity;
            light.intensity = base * (0.92 + Math.sin(t * 3.2 + light.position.x * 0.7) * 0.08);
          }
        }
        stage4Trigger.update();
      }
      braziers.forEach((b) => b.update(dt, t));
      gate.update(dt, t);
      secretGate.update(dt, t);
      secretLever.update(t);
      const p = game.player;
      const insideSecret = p.pos.x > 24.2 && p.pos.x < 39.6 && p.pos.z > 2.4 && p.pos.z < 17.6;
      secretRoof.visible = !insideSecret;
      secretMist.visible = insideSecret;
      portal.update(dt, t);
      barrierMat.opacity += ((barrierCol.enabled ? 0.45 + Math.sin(t * 4) * 0.1 : 0) - barrierMat.opacity) * Math.min(1, dt * 4);
      for (const l of arenaLights) if (l.isPointLight) l.intensity = 15 + Math.sin(t * 7 + l.position.x) * 2; else l.scale.y = 1 + Math.sin(t * 11 + l.position.z) * 0.15;
      runes.rotation.y = t * 0.05;

      if (game.state !== 'play' || p.dead) return;

      if (prog.reached('shrine') && boss.state === 'dormant' && p.pos.z < -31.5) startBossFight();

      // ambience
      const fx = game.fx.particles;
      if (mine.active && !mine.loading) {
        if (Math.random() < 0.22) {
          fx.spawn(p.pos.x + (Math.random() - 0.5) * 10, 2.8 + Math.random() * 2.5, p.pos.z + (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 0.18, -0.05, (Math.random() - 0.5) * 0.18, 0x8a8175, 4, 0.12, 0, 0);
        }
        return;
      }
      if (p.pos.z > 5 && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 16;
        fx.spawn(p.pos.x + Math.cos(a) * d, 0.4 + Math.random() * 2.5, p.pos.z + Math.sin(a) * d,
          (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 0xd8ff7a, 3 + Math.random() * 3, 0.16, 0, 0);
      }
      if (p.pos.z < -28 && Math.random() < 0.6) {
        fx.spawn(ARENA.x + (Math.random() - 0.5) * 30, 8 + Math.random() * 4, ARENA.z + (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 0.5, -0.8 - Math.random() * 0.5, (Math.random() - 0.5) * 0.5, Math.random() < 0.3 ? 0xff5a2a : 0x6a6a70, 8, 0.2, 0, 0);
      }
    },

    onEnemyKilled(e) {
      if (e.respawnable && e.spawnData && !e.respawnScheduled) {
        e.respawnScheduled = true;
        game.schedule(18, () => {
          e.respawnScheduled = false;
          if (prog.id === 'complete') return;
          spawn(e.spawnData.type, e.spawnData.x, e.spawnData.z, e.spawnData.group, true);
        });
      }

      if (e.group && e.group !== 'boss') {
        const left = game.enemies.filter((o) => o.alive && o.group === e.group).length;
        if (left === 0 && e.group !== 'path') game.ui.toast('Área limpa. A chama pode ser acesa.');
      }
    },

    /** Called after the player dies: reset the boss fight if it was running. */
    reviveMineBossForTesting() {
      if (!mine.active) {
        game.ui.toast('Entre na Mina antes de reviver o boss.');
        return;
      }
      mineMiniboss.reset();
      mineMiniboss.activeWhenMine = true;
      stage4Trigger.started = false;
      prog.setCounter('mineMinibossDefeated', false);
      game.ui.hideBoss();
      game.ui.toast('Boss da Mina revivido para teste.');
    },

    onRespawn() {
      if (mine.active) {
        ++mine.transitionToken;
        mine.loading = false;
        mine.active = false;
        mine.group.visible = false;
        for (const e of game.enemies) {
          if (e.group === 'mine' && !e.removed) e.root.visible = false;
        }
        mineMiniboss.root.visible = false;
        if (mineMiniboss.state !== 'dead') {
          mineMiniboss.reset();
          stage4Trigger.started = false;
        }
        area.minimap.bounds = surfaceMinimap.bounds;
        area.minimap.zones = surfaceMinimap.zones;
        return;
      }
      if (prog.id === 'boss') {
        boss.reset();
        barrierCol.enabled = false;
        game.ui.hideBoss();
        for (const e of adds) e.dispose();
        adds.length = 0;
        game.enemies = game.enemies.filter((e) => !e.removed);
      }
    },
  };
  return area;
}