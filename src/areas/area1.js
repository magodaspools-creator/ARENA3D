import * as THREE from 'three';
import {
  rng, fbm, smooth, distToPath, Terrain, createGround, Decor, deadTree,
  createCampfire, createBrazier, createGate, createPortal, createRuneStone, createSign,
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
  collision.addRectZone(-22, 22, -20, 13);  // courtyard
  collision.addRectZone(-3, 3, -32, -18);   // corridor
  collision.addCircleZone(ARENA.x, ARENA.z, ARENA.r);
  // The courtyard perimeter is defined by the wall colliders below.
  // Do not add a second box here: those old boxes overlapped the visible
  // north wall and created wider "invisible wall" volumes around its edges.

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
  collision.addWall(-23, -20.9, -4.9, -20.9, 4.5, 1.1);
  collision.addWall(4.9, -20.9, 23, -20.9, 4.5, 1.1);
  decor.wall(-23, -21, -23, 13.6, 3.8, r, { minH: 0.3 });
  decor.wall(23, -21, 23, 13.6, 3.8, r, { minH: 0.3 });
  collision.addWall(-23, -21, -23, 13.6, 3.8, 1.1);
  collision.addWall(23, -21, 23, 13.6, 3.8, 1.1);
  decor.wall(-23, 13.6, -6.6, 13.6, 2.6, r, { minH: 0.35 });
  decor.wall(6.6, 13.6, 23, 13.6, 2.6, r, { minH: 0.35 });
  collision.addWall(-23, 13.6, -6.6, 13.6, 2.6, 1.1);
  collision.addWall(6.6, 13.6, 23, 13.6, 2.6, 1.1);
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
  collision.addWall(-3.9, -21, -3.9, -30.5, 5.5, 1.1);
  collision.addWall(3.9, -21, 3.9, -30.5, 5.5, 1.1);

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

  // ---------- set pieces ----------
  const campfire = createCampfire(game, -6.8, 37.4);
  createSign(game, 2.8, 43.5, -0.4);
  const runeStone = createRuneStone(game, 10, 24);
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
    { id: 'arrive', text: 'Fale com Maren, a Vigia, perto da fogueira', hint: 'Aproxime-se e pressione E' },
    { id: 'braziers', text: (c) => `Reacenda as Chamas-Vigia no pátio em ruínas (${c.lit || 0}/3)`, hint: 'O fogo não pega com Ocos por perto' },
    { id: 'shrine', text: 'O selo caiu. Entre no Santuário Afundado', hint: 'Siga para o norte, além do portão' },
    { id: 'boss', text: 'Derrote Morvhal, o Guardião Oco', hint: 'Fique fora das áreas vermelhas' },
    { id: 'portal', text: 'Atravesse o portal para a próxima área', hint: 'Ao fundo do santuário' },
    { id: 'complete', text: 'Área 1 concluída!' },
  ]);

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

  const lit = () => braziers.filter((b) => b.lit).length;
  const hostileNear = (pos, rad) => game.enemies.some((e) => e.alive && !e.isBoss && e.pos.distanceTo(pos) < rad);

  game.interaction.add({
    pos: runeStone.pos, radius: 2.8, height: 3.4, label: 'Ler pedra rúnica',
    onInteract: () => game.dialogue.open('Pedra Rúnica', [
      '"Três chamas vigiam o portão. Enquanto arderem juntas, o selo não se fecha."',
      '"Mas a chama não obedece enquanto os mortos respiram ao seu redor."',
    ], runeStone.anchor),
  });

  braziers.forEach((b, i) => {
    game.interaction.add({
      pos: b.pos, radius: 2.6, height: 3.2, label: 'Acender Chama-Vigia',
      enabled: () => !b.lit,
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
        prog.setCounter('lit', n);
        prog.advance('braziers'); // if the player skipped the NPC
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
  const spawn = (type, x, z, group) => game.addEnemy(new Enemy(game, type, x, z, { group }));
  spawn('hollow', -1, 18.5, 'path'); spawn('hollow', 3.5, 16, 'path');
  spawn('hollow', -12.5, 5.5, 'west'); spawn('wisp', -17.5, -1.5, 'west');
  spawn('hollow', 12.5, 5.5, 'east'); spawn('hollow', 16.5, -2, 'east'); spawn('wisp', 18, 6, 'east');
  spawn('hollow', -3.5, -9, 'north'); spawn('hollow', 3.5, -10, 'north'); spawn('wisp', 0, -16.5, 'north');

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
      game.stats.bossTime = game.time - fightStart;
      localStorage.setItem(BOSS_KEY, String(+(localStorage.getItem(BOSS_KEY) || 0) + 1));
      prog.advance('portal');
      for (const e of adds) if (e.alive) { e.takeDamage(9999, e.pos.clone().add(new THREE.Vector3(0, 0, 1))); }
      game.schedule(1.2, () => {
        game.ui.banner('VITÓRIA', 'Morvhal, o Guardião Oco, foi derrotado', 'victory', 4.5);
        game.ui.hideBoss();
      });
      game.schedule(3.6, () => {
        barrierCol.setEnabled(false);
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

  function cancelBossFight() {
    boss.reset();
    barrierCol.setEnabled(false);
    game.ui.hideBoss();
    for (const e of adds) e.dispose();
    adds.length = 0;
    game.enemies = game.enemies.filter((e) => !e.removed);
  }

  function startBossFight() {
    prog.advance('boss');
    barrierCol.setEnabled(true);
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
    boss, braziers, gate, portal,

    onStart() {
      prog.apply();
      game.ui.banner('FLORESTA DE VHAL', 'Área 1', '', 3.2);
      game.schedule(3.5, () => game.ui.toast('Use WASD para andar. Há uma luz perto da fogueira...'));
    },

    update(dt, t) {
      campfire.update(dt, t);
      braziers.forEach((b) => b.update(dt, t));
      gate.update(dt, t);
      portal.update(dt, t);
      const p = game.player;
      barrierMat.opacity += ((barrierCol.enabled ? 0.45 + Math.sin(t * 4) * 0.1 : 0) - barrierMat.opacity) * Math.min(1, dt * 4);
      for (const l of arenaLights) if (l.isPointLight) l.intensity = 28 + Math.sin(t * 7 + l.position.x) * 4; else l.scale.y = 1 + Math.sin(t * 11 + l.position.z) * 0.15;
      runes.rotation.y = t * 0.05;

      if (game.state !== 'play' || p.dead) return;

      if (prog.reached('shrine') && boss.state === 'dormant' && p.pos.z < -31.5) startBossFight();

      // Leaving the boss arena cancels the encounter. Reset everything and
      // remove the HP bar so a stale dungeon boss life cannot remain on screen.
      if (prog.id === 'boss' && boss.state !== 'dormant' && boss.state !== 'dead') {
        const arenaDist = Math.hypot(p.pos.x - ARENA.x, p.pos.z - ARENA.z);
        if (arenaDist > ARENA.r + 3) cancelBossFight();
      }

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
      if (e.group && e.group !== 'boss') {
        const left = game.enemies.filter((o) => o.alive && o.group === e.group).length;
        if (left === 0 && e.group !== 'path') game.ui.toast('Área limpa. A chama pode ser acesa.');
      }
    },

    /** Called after the player dies: reset the boss fight if it was running. */
    onRespawn() {
      if (prog.id === 'boss') cancelBossFight();
    },
  };
  return area;
}
