import * as THREE from 'three';
import {
  rng, fbm, smooth, distToPath, Terrain, createGround, Decor, deadTree,
  createCampfire, createBrazier, createGate, createPortal, createRuneStone, createSign, createChest, createSecretGate, createLever,
} from '../world.js';
import { NPC } from '../npc.js';
import { Enemy } from '../enemy.js';
import { Boss } from '../boss.js';
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
  collision.addRectZone(-14, 14, 10, 45);   // forest entrance
  // Expanded exploration branches. These connect to the main entrance/courtyard
  // but deliberately stay outside the Morvhal arena and boss trigger corridor.
  collision.addRectZone(-32, -14, 14, 34);   // west forest connector
  collision.addRectZone(-40, -23, -16, 18);  // hanging grove
  collision.addRectZone(-18, 18, 45, 58);    // northern ruins extension
  collision.addRectZone(-22, 22, -20, 13);  // courtyard
  collision.addRectZone(-3, 3, -32, -18);   // corridor
  // Expanded forecourt OUTSIDE the boss arena. This is the pause/lore space
  // before the player crosses the arena threshold.
  collision.addRectZone(-11, 11, -31, -20);  // pre-arena forecourt
  // Hidden east passage / secret chamber: closed behind the secret gate, then
  // opens into a larger side room instead of a tiny empty square.
  collision.addRectZone(14, 38, 4, 16);
  collision.addCircleZone(ARENA.x, ARENA.z, ARENA.r);
  // courtyard south wall (with a gap for the path)
  collision.addBox(-23, -6.2, 12.9, 14.3);
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
  // a few trees inside the entrance area (real obstacles)
  for (const [x, z, s] of [[-9, 40, 1.3], [9.5, 37, 1.5], [10.5, 29, 1.2], [-8.5, 26, 1.4], [-11, 19, 1.3], [7.5, 14.5, 1.1], [11.5, 43, 1.2], [-12, 33, 1.5], [6, 32, 1.0], [-6, 16, 1.0]]) {
    decor.pine(x, 0, z, s, r);
    collision.addCircle(x, z, 0.45 * s);
  }
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
  for (const [x, z, h, broken] of [[-8.2, -28.6, 3.4, true], [8.2, -28.6, 3.8, false], [-7.2, -22.2, 2.8, true], [7.2, -22.2, 3.1, true]]) {
    decor.column(x, z, h, r, broken);
  }
  // ---------- expanded exploration: Hanging Grove (west) ----------
  // A large optional branch with its own visual identity and multiple return
  // paths. It is exploration space, not another mandatory quest corridor.
  decor.wall(-39.5, -16.5, -39.5, 17.5, 3.4, r, { minH: 0.25 });
  decor.wall(-39.5, 17.5, -27, 18, 3.0, r, { minH: 0.35 });
  decor.wall(-27, -16.5, -39.5, -16.5, 2.6, r, { minH: 0.25 });
  decor.wall(-27, -16, -27, -6, 2.4, r, { minH: 0.25 });
  decor.wall(-27, 6, -27, 17.5, 2.8, r, { minH: 0.25 });
  for (const [x, z, h, broken] of [
    [-35, 12, 4.2, true], [-30.5, 2, 3.1, false], [-34, -10, 4.6, true], [-26.5, -12.5, 3.3, true],
  ]) decor.column(x, z, h, r, broken);
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
  decor.column(-12.5, 52.5, 4.8, r, false);
  decor.column(11.5, 52.5, 3.6, r, true);
  decor.column(-4.5, 55, 3.2, r, true);
  decor.column(5.5, 47.5, 4.2, r, false);
  decor.blocks.add(-7, 0.4, 50.5, 4.5, 0.8, 2.0, 0.08, 0x45484e);
  decor.blocks.add(7.5, 0.3, 53.5, 2.6, 0.6, 1.5, -0.15, 0x505258);

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
  decor.wall(-23, -21, -23, 13.6, 3.8, r, { minH: 0.3 });
  decor.wall(23, -21, 23, 7.2, 3.8, r, { minH: 0.3 });
  decor.wall(23, 12.8, 23, 13.6, 3.8, r, { minH: 0.3 });
  decor.wall(-23, 13.6, -6.6, 13.6, 2.6, r, { minH: 0.35 });
  decor.wall(6.6, 13.6, 23, 13.6, 2.6, r, { minH: 0.35 });
  decor.column(-6.4, 13.6, 5.5, r);
  decor.column(6.4, 13.6, 4.2, r, true);
  for (const [x, z, h, broken] of [[-8, 7, 4.5, false], [8, 7, 3, true], [-9, -7, 5, false], [9, -7, 4.8, false], [-17, -13, 2.2, true], [17, -13, 4.5, false], [-5, -16, 3.5, false], [5, -16, 3.5, false]]) {
    decor.column(x, z, h, r, broken);
    collision.addCircle(x, z, 0.8);
  }
  deadTree(scene, -19.5, 9, 1.2, r); collision.addCircle(-19.5, 9, 0.45);
  deadTree(scene, 19, -4, 1.0, r); collision.addCircle(19, -4, 0.4);
  deadTree(scene, -2, 9.5, 0.8, r); collision.addCircle(-2 + 0, 9.5, 0.35);
  // corridor walls
  decor.wall(-3.9, -21, -3.9, -30.5, 5.5, r, { minH: 0.85 });
  decor.wall(3.9, -21, 3.9, -30.5, 5.5, r, { minH: 0.85 });

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
  decor.column(27, 4.5, 3.2, r, true);
  decor.column(36.5, 5, 4.1, r, false);
  decor.column(37, 14.8, 2.7, r, true);
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
    const l = new THREE.PointLight(0xff5a3a, 30, 26, 1.5);
    l.position.set(ARENA.x + s * 12, 5, ARENA.z - 3);
    scene.add(l);
    arenaLights.push(l);
    for (const off of [-0.5, 0.5]) {
      const a = s * (Math.PI / 2 + off);
      const fx = ARENA.x + Math.sin(a) * 15, fz = ARENA.z + Math.cos(a) * 15;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      f.position.set(fx, 2.3, fz);
      scene.add(f);
      decor.columns.add(fx, 0, fz, 0.9, 1.6, 0.9, 0, 0x3a3a40);
      collision.addCircle(fx, fz, 0.6);
      arenaLights.push(f);
    }
  }

  decor.build(scene);

  // ---------- forgotten corpse + lore book ----------
  // A dead explorer lies between the arena pillars. The book beside him
  // gives the player a piece of Morvhal's history before the fight.
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

  // Outside the boss arena: the player can stop here and read before entering.
  corpse.position.set(0, 0, -27.0);
  corpse.rotation.y = -0.35;
  scene.add(corpse);

  // The journal is deliberately separate so the interaction remains readable.
  const loreBook = new THREE.Group();
  loreBook.name = 'morvhal-journal';
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x3a2118, roughness: 0.9, metalness: 0 });
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 1, metalness: 0 });
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 1.05), coverMat);
  cover.position.y = 0.12;
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.88), pageMat);
  pages.position.y = 0.2;
  loreBook.add(cover, pages);
  loreBook.position.set(2.0, 0.08, -27.2);
  loreBook.rotation.set(-0.08, -0.35, 0.12);
  scene.add(loreBook);

  const loreBookAnchor = new THREE.Object3D();
  loreBookAnchor.position.set(2.0, 0.75, -27.2);
  scene.add(loreBookAnchor);

  // ---------- set pieces ----------
  const campfire = createCampfire(game, -6.8, 37.4);
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
  const barrierMat = new THREE.MeshBasicMaterial({ color: 0xb42a5a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), barrierMat);
  barrier.position.set(0, 3, -30.2);
  scene.add(barrier);
  const barrierCol = collision.addBox(-3.5, 3.5, -30.6, -29.8, { enabled: false });

  // ---------- quest ----------
  const prog = new Progression(game, [
    { id: 'arrive', timeline: 'Conhecer Maren', text: 'Fale com Maren, a Vigia, perto da fogueira', hint: 'Aproxime-se e pressione E' },
    { id: 'braziers', timeline: 'Reacender as Chamas-Vigia', text: (c) => `Reacenda as Chamas-Vigia no pátio em ruínas (${c.lit || 0}/3)`, hint: 'O fogo não pega com Ocos por perto' },
    { id: 'shrine', timeline: 'Abrir o Santuário Afundado', text: 'O selo caiu. Entre no Santuário Afundado', hint: 'Siga para o norte, além do portão' },
    { id: 'boss', timeline: 'Enfrentar Morvhal', text: 'Derrote Morvhal, o Guardião Oco', hint: 'Fique fora das áreas vermelhas' },
    { id: 'portal', timeline: 'Abrir o caminho adiante', text: 'Atravesse o portal para a próxima área', hint: 'Ao fundo do santuário' },
    { id: 'complete', timeline: 'Concluir a Floresta de Vhal', text: 'Área 1 concluída!' },
  ], 'area1');

  const maren = new NPC(game, {
    name: 'Maren, a Vigia', x: -4.6, z: 35.2, facing: 0.6,
    look: { skin: 0xc8977a, body: 0x4a3c30, legs: 0x2e261e, robe: 0x3e342a, hood: 0x2e3a3a, head: 'hood', accent: 0x9a8a6a },
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
    look: { skin: 0xb98268, body: 0x5a4636, legs: 0x30271f, robe: 0x6a5542, hood: 0x46372c, head: 'hood', accent: 0xd0a45f },
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

  const lit = () => braziers.filter((b) => b.lit).length;
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

  game.interaction.add({
    pos: loreBookAnchor.position, radius: 2.4, height: 2.2, label: 'Ler diário abandonado',
    onInteract: () => game.dialogue.open('Diário do Explorador', [
      '"Morvhal não foi criado para guardar esta cripta. Ele foi escolhido para impedir que algo saísse dela."',
      '"Vi os antigos sacerdotes alimentarem o selo com memórias humanas. Cada memória esquecida tornava o guardião mais vazio."',
      '"Quando tentei quebrar o ritual, Morvhal me reconheceu... e pediu que eu corresse."',
      '"Ele ainda luta contra alguma coisa dentro dele. Se seus olhos ficarem vermelhos, já não sei dizer quem está segurando a espada."',
      '"Se alguém encontrar estas páginas, não desperte o Guardião por curiosidade. A porta existe por um motivo."',
    ], loreBookAnchor),
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
  const spawn = (type, x, z, group, respawnable = false) => {
    const e = game.addEnemy(new Enemy(game, type, x, z, { group }));
    e.respawnable = respawnable;
    if (respawnable) e.spawnData = { type, x, z, group };
    return e;
  };

  // Farm mobs: each one returns after a short cooldown so the area can be used
  // as a safe XP/gold/loot farming loop.
  const farmSpawns = [
    ['hollow', -1, 18.5, 'path'], ['hollow', 3.5, 16, 'path'],
    ['hollow', -31, 12, 'grove'], ['wisp', -35, 4, 'grove'], ['hollow', -29, -10, 'grove'],
    ['wisp', -34, -12, 'grove'],
    ['hollow', -11, 51, 'north'], ['wisp', 9, 53, 'north'],
    ['hollow', -12.5, 5.5, 'west'], ['wisp', -17.5, -1.5, 'west'],
    ['hollow', 12.5, 5.5, 'east'], ['hollow', 16.5, -2, 'east'], ['wisp', 18, 6, 'east'],
    ['hollow', -3.5, -9, 'north'], ['hollow', 3.5, -10, 'north'], ['wisp', 0, -16.5, 'north'],
  ];
  farmSpawns.forEach(([type, x, z, group]) => spawn(type, x, z, group, true));

  const adds = [];
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
      bounds: { minX: -42, maxX: 42, minZ: -62, maxZ: 61 },
      zones: [
        [-14, 14, 10, 45],
        [-32, -14, 14, 34],
        [-40, -23, -16, 18],
        [-18, 18, 45, 58],
        [-22, 22, -20, 13],
        [-11, 11, -31, -20],
        [14, 38, 4, 16],
      ],
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
      game.ui.banner('FLORESTA DE VHAL', restored ? 'Progresso restaurado' : 'Área 1', '', 3.2);
      game.schedule(3.5, () => game.ui.toast('Use WASD para andar. Há uma luz perto da fogueira...'));
    },

    update(dt, t) {
      campfire.update(dt, t);
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
      for (const l of arenaLights) if (l.isPointLight) l.intensity = 28 + Math.sin(t * 7 + l.position.x) * 4; else l.scale.y = 1 + Math.sin(t * 11 + l.position.z) * 0.15;
      runes.rotation.y = t * 0.05;

      if (game.state !== 'play' || p.dead) return;

      if (prog.reached('shrine') && boss.state === 'dormant' && p.pos.z < -31.5) startBossFight();

      if (portal.active && prog.id === 'portal' && Math.hypot(p.pos.x - portal.pos.x, p.pos.z - portal.pos.z) < 2) {
        prog.advance('complete');
        game.completeArea();
      }

      // ambience
      const fx = game.fx.particles;
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
    onRespawn() {
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
