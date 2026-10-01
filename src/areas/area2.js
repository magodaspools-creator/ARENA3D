import * as THREE from 'three';
import { rng, fbm, smooth, Terrain, createGround, Decor, createPortal, createRuneStone, createChest } from '../world.js';
import { Enemy } from '../enemy.js';
import { Boss } from '../boss.js';

// Prototype Area 2 — Desert of the Buried Sun.
// This is intentionally a standalone prototype: it lives far from Area 1 so
// the first map does not need to be destroyed/rebuilt during the transition.

export function createArea2(game) {
  const { scene, collision } = game;
  const r = rng(24017);

  const ORIGIN = { x: 150, z: 0 };
  const bounds = { minX: 112, maxX: 188, minZ: -48, maxZ: 48 };

  // ---------- walkable space ----------
  collision.addRectZone(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
  collision.addRectZone(126, 174, -62, -42); // southern canyon approach
  collision.addRectZone(126, 174, 42, 62);   // northern temple approach

  const terrain = new Terrain(collision);
  const sandA = new THREE.Color(0x9b7142);
  const sandB = new THREE.Color(0xc49a5c);
  const sandLight = new THREE.Color(0xd5b06c);
  const rock = new THREE.Color(0x5b4635);

  createGround(scene, terrain, (x, z, c) => {
    const n = fbm(x * 0.055, z * 0.055);
    c.copy(sandA).lerp(sandB, smooth(n));
    const ripple = Math.sin(x * 0.32 + Math.sin(z * 0.12)) * 0.5 + 0.5;
    c.lerp(sandLight, ripple * 0.16);
    if (Math.abs(x - ORIGIN.x) < 18 && Math.abs(z) < 7) c.lerp(rock, 0.22);
  }, { width: 110, depth: 125, cx: ORIGIN.x, cz: 0, seg: 105 });

  const decor = new Decor();

  // ---------- dunes / rock islands ----------
  for (let i = 0; i < 125; i++) {
    const x = bounds.minX + 2 + r() * 76;
    const z = bounds.minZ + 2 + r() * 96;
    if (Math.abs(x - ORIGIN.x) < 14 && Math.abs(z) < 9) continue;
    const s = 0.5 + r() * 2.4;
    decor.rock(x, 0, z, s, r, r() < 0.7 ? 0x6b523b : 0x806345);
    // Every gameplay-visible rock is also a physical obstacle.
    collision.addCircle(x, z, Math.max(0.42, s * 0.62), { projectiles: false });
  }

  // Sandstone ribs create readable lanes without becoming invisible walls.
  const ribs = [
    [119, -35, 126, -8], [181, -29, 174, -2],
    [116, 27, 127, 43], [184, 18, 174, 39],
  ];
  for (const [x1,z1,x2,z2] of ribs) {
    decor.wall(x1,z1,x2,z2,2.4,r,{ thick:1.5,minH:0.35 });
    const len = Math.hypot(x2 - x1, z2 - z1);
    const count = Math.max(2, Math.ceil(len / 2.2));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      collision.addCircle(
        x1 + (x2 - x1) * t,
        z1 + (z2 - z1) * t,
        0.82,
        { projectiles: false }
      );
    }
  }

  // ---------- oasis hub ----------
  const oasis = new THREE.Group();
  oasis.name = 'desert-oasis';
  oasis.position.set(ORIGIN.x, 0, 0);
  scene.add(oasis);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 32),
    new THREE.MeshStandardMaterial({ color: 0x4c9bb0, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.88 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.035;
  oasis.add(water);

  const waterRing = new THREE.Mesh(
    new THREE.RingGeometry(6.7, 7.3, 32),
    new THREE.MeshStandardMaterial({ color: 0x5e513e, roughness: 1, flatShading: true })
  );
  waterRing.rotation.x = -Math.PI / 2;
  waterRing.position.y = 0.05;
  oasis.add(waterRing);

  for (const [x,z,s] of [
    [-7,-4,1.4], [6,-4,1.2], [-5,5,1.1], [7,4,1.5], [0,8,1.0],
  ]) {
    const palm = new THREE.Group();
    palm.position.set(x,0,z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.34,3.8,6), new THREE.MeshStandardMaterial({ color:0x68452e, roughness:1 }));
    trunk.rotation.z = (r()-0.5)*0.18;
    trunk.position.y = 1.9;
    palm.add(trunk);
    for (let i=0;i<6;i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.08,2.3), new THREE.MeshStandardMaterial({ color:0x3e5d34, roughness:1 }));
      const a = i / 6 * Math.PI * 2;
      leaf.position.set(Math.cos(a)*0.95,4.0,Math.sin(a)*0.95);
      leaf.rotation.y = a;
      leaf.rotation.z = 0.22;
      palm.add(leaf);
    }
    palm.scale.setScalar(s);
    oasis.add(palm);
    collision.addCircle(ORIGIN.x + x, z, Math.max(0.5, 0.55 * s), { projectiles: false });
  }

  collision.addCircle(ORIGIN.x, ORIGIN.z, 6.5, { projectiles:false });

  // ---------- buried temple ----------
  const temple = new THREE.Group();
  temple.name = 'buried-sun-temple';
  scene.add(temple);

  const stoneMat = new THREE.MeshStandardMaterial({ color:0x70563d, roughness:1, flatShading:true });
  const darkStone = new THREE.MeshStandardMaterial({ color:0x493a2c, roughness:1, flatShading:true });
  const goldMat = new THREE.MeshStandardMaterial({ color:0xc79a42, roughness:0.65, metalness:0.25, flatShading:true });

  const addBox = (x,y,z,sx,sy,sz,matl=stoneMat,ry=0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),matl);
    m.position.set(x,y,z);
    m.rotation.y=ry;
    m.castShadow=true; m.receiveShadow=true; temple.add(m); return m;
  };

  // Entrance at the north end: the player can walk around the ruin.
  addBox(132,1.4,31,2.2,2.8,8);
  addBox(168,1.4,31,2.2,2.8,8);
  addBox(136,0.8,47,10,1.6,2.2,darkStone);
  addBox(164,0.8,47,10,1.6,2.2,darkStone);
  addBox(150,3.8,43,30,1.4,2.2,stoneMat);
  addBox(150,0.45,35,15,0.9,11,darkStone);

  for (const [x,z,h] of [[137,35,5.2],[163,35,5.2],[142,43,4],[158,43,4]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.95,h,6),stoneMat);
    c.position.set(x,h/2,z); c.castShadow=true; temple.add(c);
    collision.addCircle(x,z,0.95);
  }
  collision.addBox(129,135,27,39);
  collision.addBox(165,171,27,39);
  collision.addBox(135,165,46,49);
  collision.addBox(143,157,31,37); // raised inner dais boundary

  // Sun glyph over the buried doorway.
  const sun = new THREE.Group();
  sun.position.set(150,5.2,29.7);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05,16),goldMat);
  disc.rotation.x=Math.PI/2;
  sun.add(disc);
  for(let i=0;i<8;i++){
    const ray=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.75),goldMat);
    const a=i*Math.PI/4;
    ray.position.set(Math.sin(a)*1.35,0,Math.cos(a)*1.35);
    ray.rotation.y=a;
    sun.add(ray);
  }
  temple.add(sun);

  // ---------- lore / route ----------
  const lore = createRuneStone(game, 150, -17);

  // createRuneStone already exposes the correct 3D dialogue anchor.
  // Do not create a second Object3D here: Dialogue.update() requires a
  // concrete anchor with x/z coordinates and would crash every frame if it
  // receives undefined.
  game.interaction.add({
    pos: lore.pos,
    radius: 2.6,
    height: 4,
    label: 'Ler a Pedra do Sol Sepultado',
    onInteract: () => game.dialogue.open(
      'A Pedra do Sol Sepultado',
      [
        '“Quando Morvhal caiu, o selo não morreu com ele.”',
        '“A essência arrancada do Guardião atravessou o portal e encontrou a areia.”',
        '“Sob o deserto repousa o templo que os antigos construíram para conter aquilo que vinha de além da luz.”',
        '“Não procure o caminho pela superfície. Procure onde o sol foi enterrado.”',
      ],
      lore.anchor,
    ),
  });

  const chest = createChest(game, 150, 22, 0);
  const chestAnchor = new THREE.Object3D();
  chestAnchor.position.set(150,0.9,22);
  scene.add(chestAnchor);

  game.interaction.add({
    pos: chestAnchor.position,
    radius: 2.2,
    height: 3,
    label: () => 'Abrir baú do viajante',
    onInteract: () => {
      if (chest.opened) return;
      chest.open();
      game.rewardCharacter(0, 180);
      game.spawnGroundLoot([
        { itemId:'red_potion', amount:3 },
        { itemId:'moon_herb', amount:2 },
        { itemId:'iron_scrap', amount:4 },
      ], chest.pos);
      game.ui.toast('O baú escondia suprimentos de uma caravana perdida.');
    },
  });

  // ---------- enemies ----------
  const enemies = [];
  const spawn = (type,x,z,name=null) => {
    const e = new Enemy(game,type,x,z,{group:'area2'});
    if (name) e.def.name=name;
    e.aggro();
    enemies.push(e);
    game.addEnemy(e);
    return e;
  };

  [
    ['spider',129,-27,'Aranha das Dunas'],
    ['spider',143,-33,'Aranha das Dunas'],
    ['spider',174,-21,'Aranha das Dunas'],
    ['spider',181,8,'Aranha das Dunas'],
    ['wisp',122,12,'Espírito da Miragem'],
    ['wisp',176,15,'Espírito da Miragem'],
    ['zombie',132,-4,'Guardião Soterrado'],
    ['zombie',168,-5,'Guardião Soterrado'],
  ].forEach(([type,x,z,name])=>spawn(type,x,z,name));

  const entryPortal = createPortal(game, ORIGIN.x, -45);
  entryPortal.rise();
  // The north portal is the reward for defeating the desert boss.
  // It stays hidden until the fight is complete.
  const exitPortal = createPortal(game, ORIGIN.x, 45);

  const portalStone = new THREE.Group();
  portalStone.position.set(ORIGIN.x,-0.0,-45);
  scene.add(portalStone);
  for(const [x,z] of [[-3,-45],[3,-45]]) {
    const p=new THREE.Mesh(new THREE.BoxGeometry(1.3,3.6,1.3),stoneMat);
    p.position.set(ORIGIN.x+x,1.8,z);
    p.castShadow=true; portalStone.add(p);
    collision.addCircle(ORIGIN.x+x,z,0.9);
  }


  // ---------- buried-sun guardian ----------
  const bossArena = { x: ORIGIN.x, z: 40, r: 9 };
  const templeLore = createRuneStone(game, 150, 25.5);

  game.interaction.add({
    pos: templeLore.pos,
    radius: 2.7,
    height: 3.6,
    label: 'Ler a inscrição do templo',
    onInteract: () => game.dialogue.open(
      'Inscrição do Templo Soterrado',
      [
        '“O Guardião não foi enterrado aqui. Ele foi selado aqui.”',
        '“Quando o Sol Sepultado despertasse, a areia deveria engolir seu nome.”',
        '“A essência de Morvhal atravessou o portal e se fundiu ao que dormia sob estas pedras.”',
        '“Se o selo se romper, não siga a voz que vier do templo. Derrote aquilo que restou do Guardião.”',
      ],
      templeLore.anchor,
    ),
  });

  let fightStart = 0;
  const desertBoss = new Boss(game, bossArena.x, bossArena.z, {
    name: 'Azhur, o Guardião do Sol Sepultado',
    onSummon: () => {
      for (const [x, z] of [[142, 38], [158, 38]]) {
        spawn('hollow', x, z, 'area2-boss-add');
      }
    },
    onDefeated: () => {
      game.onBossDefeated({
        xp: 700,
        gold: 400,
        loot: [
          { itemId: 'hollow_core', amount: 1 },
          { itemId: 'moon_ring', amount: 1 },
        ],
      }, desertBoss.pos);
      game.stats.bossTime = game.time - fightStart;
      exitPortal.rise();
      game.rig.cinematic(exitPortal.pos, 3);
      game.schedule(1.0, () => game.ui.banner('O SOL FOI SEPULTADO', 'Azhur caiu. O portal de retorno foi despertado.', 'victory', 4));
      game.schedule(3.2, () => game.ui.hideBoss());
      game.saveWorldState?.();
      game.ui.toast('O Guardião tombou. Um portal se abriu no extremo norte do deserto.');
    },
  });
  game.addEnemy(desertBoss);

  function startDesertBoss() {
    if (desertBoss.state !== 'dormant' || !exitPortal) return;
    fightStart = game.time;
    desertBoss.awaken();
    game.rig.cinematic(new THREE.Vector3(desertBoss.pos.x, 0, desertBoss.pos.z + 3), 2.4);
    game.schedule(0.8, () => game.ui.banner('AZHUR', 'O Guardião do Sol Sepultado desperta', 'boss', 3));
    game.schedule(1.2, () => game.ui.showBoss(desertBoss.name));
    game.ui.toast('As pedras tremem. Algo antigo acordou sob o templo.');
  }


  // Map-to-map travel is explicit only: no proximity fallback.
  const returnFromStart = new THREE.Object3D();
  returnFromStart.position.copy(entryPortal.pos);
  scene.add(returnFromStart);

  game.interaction.add({
    pos: returnFromStart.position,
    radius: 2.8,
    height: 3.2,
    label: 'Retornar à Floresta de Vhal',
    enabled: () => entryPortal.active,
    onInteract: () => {
      if (!entryPortal.active) return;
      game.enterPreviousArea();
    },
  });

  game.interaction.add({
    pos: exitPortal.pos,
    radius: 2.8,
    height: 3.2,
    label: 'Retornar à Floresta de Vhal',
    enabled: () => exitPortal.active,
    onInteract: () => {
      if (!exitPortal.active) return;
      game.enterPreviousArea();
    },
  });

  const area = {
    name: 'Deserto do Sol Sepultado',
    spawn: { x: ORIGIN.x, z: -41, facing: 0 },
    checkpoint: { x: ORIGIN.x, z: -41, facing: 0 },
    portal: entryPortal,
    exitPortal,
    boss: desertBoss,
    minimap: {
      bounds,
      zones: [
        { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ, label:'Deserto' },
      ],
      arena: { x: bossArena.x, z: bossArena.z, r: bossArena.r },
      portal: { x: ORIGIN.x, z: -45 },
    },

    onStart() {
      game.ui.banner('DESERTO DO SOL SEPULTADO', 'Mapa 2', 'boss', 3.5);
      game.schedule(3.8, () => game.ui.toast('O portal trouxe você a um templo que deveria continuar enterrado.'));
    },

    // Area 1 owns progression on enemy kills. Area 2 is still a prototype,
    // but the core game loop always calls this hook after an enemy dies.
    // Keeping the hook here prevents the render loop from crashing on the
    // first defeated enemy and leaving the whole screen visually frozen.
    onEnemyKilled() {},

    // The main game calls this hook on death before restoring the area's
    // checkpoint. Keeping it explicit makes Area 2 safe even though it has
    // no area-specific respawn sequence yet.
    restoreState(saved = null) {
      if (!saved?.bossDefeated) return;
      desertBoss.alive = false;
      desertBoss.hp = 0;
      desertBoss.state = 'dead';
      desertBoss.root.visible = false;
      desertBoss.anim.revive();
      exitPortal.restoreActive();
      game.ui.hideBoss();
    },

    onRespawn() {
      // A defeated boss stays defeated. Only an interrupted fight is reset.
      if (desertBoss.state !== 'dormant' && desertBoss.state !== 'dead') {
        desertBoss.reset();
        game.ui.hideBoss();
      }
    },

    update(dt,t) {
      entryPortal.update(dt,t);
      exitPortal.update(dt,t);
      water.material.opacity = 0.78 + Math.sin(t*1.8)*0.06;

      // Heat shimmer / drifting sand. Kept lightweight for the prototype.
      if (game.state === 'play' && Math.random() < 0.34) {
        game.fx.particles.spawn(
          game.player.pos.x + (Math.random()-0.5)*18,
          0.35 + Math.random()*1.5,
          game.player.pos.z + (Math.random()-0.5)*18,
          0.25 + Math.random()*0.35,
          0.03,
          (Math.random()-0.5)*0.08,
          0xd7b36d,
          2.4,
          0.12,
          0,
          0
        );
      }

      if (game.state !== 'play' || game.player?.dead) return;

      const p = game.player;
      if (desertBoss.state === 'dormant' && p.pos.z > 36 && p.pos.z < 43 && Math.abs(p.pos.x - ORIGIN.x) < 7) {
        startDesertBoss();
        return;
      }
    },
  };

  decor.build(scene);
  return area;
}
