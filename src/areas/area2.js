import * as THREE from 'three';
import { rng, fbm, smooth, Terrain, createGround, Decor, createPortal, createRuneStone, createChest } from '../world.js';
import { Enemy } from '../enemy.js';
import { SunGodBoss } from '../sun-boss.js';
import { NPC } from '../npc.js';
import { Progression } from '../progression.js';

// Prototype Area 2 — Desert of the Buried Sun.
// This is intentionally a standalone prototype: it lives far from Area 1 so
// the first map does not need to be destroyed/rebuilt during the transition.

export function createArea2(game) {
  const { scene, collision } = game;
  const r = rng(24017);

  // Snapshot the shared registries so leaving/re-entering Map 2 cannot leave
  // duplicate bosses, rocks, interactions or collision volumes behind.
  const sceneBaseline = new Set(scene.children);
  const collisionZoneBaseline = collision.zones.length;
  const collisionObstacleBaseline = collision.obstacles.length;
  const interactionBaseline = game.interaction.items.length;
  const areaEnemies = [];

  const ORIGIN = { x: 150, z: 0 };
  const bounds = { minX: 112, maxX: 188, minZ: -48, maxZ: 48 };

  // ---------- desert sunlight / heat haze ----------
  // Map 2 gets its own harsh midday lighting. It is added locally and removed
  // with the area, so the forest/mines keep their existing night-like lighting.
  const desertLights = new THREE.Group();
  desertLights.name = 'area2-desert-sunlight';
  scene.add(desertLights);

  const desertSun = new THREE.DirectionalLight(0xffe3a3, 3.4);
  desertSun.position.set(118, 62, -92);
  desertSun.target.position.set(150, 0, 4);
  desertSun.castShadow = true;
  desertSun.shadow.mapSize.set(2048, 2048);
  desertSun.shadow.camera.left = -48;
  desertSun.shadow.camera.right = 48;
  desertSun.shadow.camera.top = 48;
  desertSun.shadow.camera.bottom = -48;
  desertSun.shadow.camera.near = 1;
  desertSun.shadow.camera.far = 130;
  desertSun.shadow.bias = -0.0006;
  desertSun.shadow.normalBias = 0.025;
  desertLights.add(desertSun, desertSun.target);

  const desertSky = new THREE.HemisphereLight(0xffdca0, 0x9a6b3e, 1.8);
  desertLights.add(desertSky);

  const sunGlow = new THREE.PointLight(0xffc45c, 5.5, 95, 1.6);
  sunGlow.position.set(150, 22, -30);
  desertLights.add(sunGlow);

  const oldBackground = scene.background?.clone?.() || null;
  scene.background = new THREE.Color(0xe0b878);

  // Thin, animated heat bands sit far from the player and read as mirage
  // distortion over the hottest sand. They are deliberately subtle.
  const mirageBands = [];
  const mirageMat = new THREE.MeshBasicMaterial({
    color: 0xffe2a3,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  for (let i = 0; i < 7; i++) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(15 + i * 2.5, 0.8 + (i % 3) * 0.25), mirageMat);
    const a = (i / 7) * Math.PI * 2;
    band.position.set(150 + Math.cos(a) * (24 + (i % 2) * 8), 0.55 + i * 0.11, Math.sin(a) * (24 + (i % 2) * 8));
    band.rotation.x = -Math.PI / 2;
    band.rotation.z = Math.sin(i * 2.7) * 0.08;
    band.userData.baseY = band.position.y;
    band.userData.phase = i * 1.37;
    scene.add(band);
    mirageBands.push(band);
  }
  const heatHaze = { update(t) {
    for (const band of mirageBands) {
      band.position.y = band.userData.baseY + Math.sin(t * 1.8 + band.userData.phase) * 0.08;
      band.scale.x = 1 + Math.sin(t * 1.35 + band.userData.phase) * 0.08;
      band.material.opacity = 0.045 + (Math.sin(t * 2.2 + band.userData.phase) * 0.5 + 0.5) * 0.045;
    }
  }};

  // ---------- walkable space ----------
  collision.addRectZone(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
  collision.addRectZone(126, 174, -62, -42); // southern canyon approach
  collision.addRectZone(126, 174, 42, 62);   // northern temple approach

  const terrain = new Terrain(collision);

  // Smooth dune ridges are part of the ground itself, not meshes placed on
  // top of it. This gives the desert real slopes and lets the player climb
  // over them instead of walking into a fake mound.
  const duneFields = [
    [119, -37, 12, 5.5, 1.35, -0.18],
    [136, -46, 15, 6.5, 1.65, 0.16],
    [166, -44, 13, 5.8, 1.45, -0.12],
    [183, -29, 10, 7.5, 1.2, 0.2],
    [118, -12, 9, 6.5, 0.95, -0.22],
    [184, -8, 12, 6, 1.15, 0.18],
    [117, 18, 11, 7, 1.15, 0.15],
    [184, 17, 12, 7, 1.35, -0.2],
    [121, 39, 15, 6.5, 1.55, 0.16],
    [144, 46, 10, 5.5, 1.0, -0.12],
    [170, 44, 14, 6.5, 1.55, 0.14],
  ];

  const duneHeight = (x, z) => {
    let h = 0;
    for (const [cx, cz, rx, rz, peak, rot] of duneFields) {
      const dx = x - cx;
      const dz = z - cz;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const lx = dx * cs - dz * sn;
      const lz = dx * sn + dz * cs;
      const q = (lx * lx) / (rx * rx) + (lz * lz) / (rz * rz);
      if (q < 1) {
        const t = 1 - q;
        h += peak * t * t * (3 - 2 * t);
      }
    }
    return Math.min(2.15, h);
  };

  const baseTerrainHeight = terrain.height.bind(terrain);
  terrain.height = (x, z) => baseTerrainHeight(x, z) + duneHeight(x, z);

  // Map 2 is a true desert: keep the ground clearly sand-colored instead of
  // inheriting the greener forest palette used by other areas.
  const sandA = new THREE.Color(0xb98a4d);
  const sandB = new THREE.Color(0xd9b76b);
  const sandLight = new THREE.Color(0xf0d28a);
  const rock = new THREE.Color(0x725337);

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
    // Keep the boss arena open: random desert rocks must not spawn inside the
    // combat field and break movement around the guardian.
    if (Math.hypot(x - ORIGIN.x, z - 40) < 9.5) continue;
    const s = 0.5 + r() * 2.4;
    decor.rock(x, 0, z, s, r, r() < 0.7 ? 0x6b523b : 0x806345);
    // Every gameplay-visible rock is also a physical obstacle.
    collision.addCircle(x, z, Math.max(0.5, s * 1.1), { projectiles: false });
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
        1.05,
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

  // ---------- desert guide / pre-boss quest ----------
  // Map 2 deliberately uses a different quest structure from Map 1:
  // one investigation in a buried caravan, followed by a return to Nadir.
  // There are no repeated "activate three points" objectives here.
  const progression = new Progression(game, [
    { id: 'nadir', text: 'Fale com Nadir, o Guardião das Dunas', hint: 'Ele sabe por que o caminho do templo desapareceu.', timeline: 'Falar com Nadir' },
    { id: 'caravan', text: 'Investigue a caravana soterrada', hint: 'Procure os destroços a oeste do oásis.', timeline: 'Investigar a caravana' },
    { id: 'return', text: 'Volte ao oásis e fale com Nadir', hint: 'Você encontrou o Fragmento Solar.', timeline: 'Voltar ao oásis' },
    { id: 'pet', text: 'Desperte seu companheiro do deserto', hint: 'Nadir pode revelar o espírito que respondeu a você.', timeline: 'Despertar companheiro' },
    { id: 'boss', text: 'Entre no Templo do Sol e enfrente Azhur', hint: 'O Fragmento Solar revelou a entrada soterrada.', timeline: 'Enfrentar Azhur' },
    { id: 'portal', text: 'Atravesse o portal do templo', hint: 'Azhur foi derrotado. O caminho adiante está aberto.', timeline: 'Atravessar o portal' },
  ], 'area2');
  progression.load();

  const petNames = {
    knight: 'Lobo Guardião',
    paladin: 'Falcão do Deserto',
    sorcerer: 'Escorpião Arcano',
    druid: 'Cervo da Miragem',
    monk: 'Macaco das Dunas',
  };

  let petGranted = false;
  let desertPetVisual = null;
  const createPetVisual = (vocation) => {
    if (desertPetVisual || !game.player?.root) return;
    const existing = game.player.root.getObjectByName('desert-companion');
    if (existing) { desertPetVisual = existing; return; }
    const group = new THREE.Group();
    group.name = 'desert-companion';
    const mat = new THREE.MeshStandardMaterial({ color: ({ knight:0x6b4936, paladin:0xc7d7e8, sorcerer:0x7b4bb7, druid:0x5b8b50, monk:0xc28a4a }[vocation] || 0xc49a5c), roughness:0.8, emissive: ({ sorcerer:0x3a155f }[vocation] || 0x000000), emissiveIntensity:0.35 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28,10,8), mat); body.position.y=0.55; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8), mat); head.position.set(0,0.78,0.22); group.add(head);
    if (vocation === 'paladin') {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.18,0.55,6), mat); wing.rotation.z=Math.PI/2; wing.position.set(0.3,0.7,0); group.add(wing.clone()); wing.position.x=-0.3; group.add(wing);
    } else if (vocation === 'sorcerer') {
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.28,0.055,6,12,Math.PI*1.5), mat); tail.rotation.x=Math.PI/2; tail.position.set(0,-0.02,-0.2); group.add(tail);
    } else {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09,0.28,5), mat); ear.position.set(0.14,1.0,0.2); group.add(ear.clone()); ear.position.x=-0.14; group.add(ear);
    }
    group.position.set(-0.9,0,0.65);
    game.player.root.add(group);
    desertPetVisual = group;
  };

  const grantDesertPet = () => {
    if (petGranted || game.character?.data?.pet) return;
    const vocation = game.character?.vocation;
    const pet = petNames[vocation];
    if (!pet) return;
    game.character.data.pet = { id: vocation + '_desert', name: pet, vocation, source: 'desert' };
    game.character.save();
    petGranted = true;
    createPetVisual(vocation);
    game.ui.toast(pet + ' despertou ao seu lado.');
  };

  // The quest object is a single buried caravan: an investigation, not a
  // checklist. It has a visible sun-disc and a half-buried wagon silhouette.
  const caravan = new THREE.Group();
  caravan.name = 'buried-caravan';
  caravan.position.set(171, 0, -30);
  scene.add(caravan);

  const caravanWood = new THREE.MeshStandardMaterial({ color: 0x68452d, roughness: 0.95 });
  const caravanCloth = new THREE.MeshStandardMaterial({ color: 0x8f6b3d, roughness: 1, side: THREE.DoubleSide });
  const caravanMetal = new THREE.MeshStandardMaterial({ color: 0x8b6a3f, roughness: 0.65, metalness: 0.25 });

  const wagon = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.25, 2.0), caravanWood);
  wagon.position.y = 0.65;
  wagon.rotation.y = -0.2;
  caravan.add(wagon);

  for (const x of [-1.25, 1.25]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 8, 16), caravanWood);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.6, -0.65);
    caravan.add(wheel);
  }

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.8, 0.12), caravanCloth);
  cloth.position.set(0, 1.55, 0.55);
  cloth.rotation.x = -0.35;
  caravan.add(cloth);

  const buriedSand = new THREE.Mesh(
    new THREE.ConeGeometry(2.0, 0.9, 7),
    new THREE.MeshStandardMaterial({ color: 0xd9b76b, roughness: 1 })
  );
  buriedSand.position.set(0, 0.35, -0.2);
  buriedSand.scale.set(1.5, 0.7, 0.8);
  caravan.add(buriedSand);

  const shard = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34),
    new THREE.MeshStandardMaterial({ color: 0xffcf5b, emissive: 0xf2a51a, emissiveIntensity: 1.8, metalness: 0.25 })
  );
  shard.position.set(0, 2.25, 0.15);
  shard.visible = progression.reached('return');
  caravan.add(shard);

  const caravanHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.05, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc44d, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  caravanHalo.rotation.x = -Math.PI / 2;
  caravanHalo.position.y = 0.06;
  caravan.add(caravanHalo);

  const investigateCaravan = () => {
    if (progression.id !== 'caravan') return;
    shard.visible = true;
    progression.advance('return');
    game.fx.ring(caravan.position, 0xffc44d, 2.2, 1.0);
    game.ui.banner('FRAGMENTO SOLAR ENCONTRADO', 'A caravana foi soterrada tentando levar o artefato até o templo.', 'victory', 3.5);
  };

  game.interaction.add({
    pos: caravan.position,
    radius: 2.8,
    height: 3.2,
    label: () => progression.id === 'caravan' ? 'Investigar a caravana soterrada' : 'Caravana soterrada',
    enabled: () => progression.id === 'caravan',
    onInteract: investigateCaravan,
  });

  const nadir = new NPC(game, {
    name: 'Nadir, Guardião das Dunas',
    x: 142,
    z: 0,
    facing: Math.PI * 0.75,
    look: { head: 0xe0a26f, body: 0x6b472e, legs: 0xc49a5c, feet: 0x3c2c22 },
    dialogue: () => {
      if (progression.id === 'nadir') {
        return {
          lines: [
            '“Você veio pelo portal... então a areia escolheu outro viajante.”',
            '“O caminho até Azhur não desapareceu. Ele foi enterrado.”',
            '“Uma caravana tentou levar um Fragmento Solar ao templo e nunca chegou.”',
            '“Encontre os destroços a oeste do oásis. Se o fragmento ainda existir, traga-o para mim.”',
          ],
          onDone: () => {
            progression.advance('caravan');
            game.ui.banner('NOVA INVESTIGAÇÃO', 'A caravana soterrada está a oeste do oásis.', 'quest', 3);
          },
        };
      }
      if (progression.id === 'return') {
        return {
          lines: [
            '“Eu senti a luz antes mesmo de você chegar.”',
            '“Esse Fragmento Solar pertence ao templo. Ele não abre uma porta... revela o que a areia escondeu.”',
            '“Agora posso despertar um companheiro que sobreviverá ao seu lado no deserto.”',
          ],
          onDone: () => {
            progression.advance('pet');
            game.ui.banner('O CAMINHO FOI REVELADO', 'Nadir pode despertar seu companheiro.', 'victory', 3);
          },
        };
      }
      if (progression.id === 'pet') {
        return {
          lines: [
            '“O espírito já respondeu à sua presença.”',
            '“Aceite sua companhia. Cada vocação desperta uma criatura diferente.”',
            '“Leve-o. O deserto é o primeiro lugar onde você vai precisar dele.”',
          ],
          onDone: () => {
            grantDesertPet();
            progression.advance('boss');
            game.ui.banner('COMPANHEIRO DESPERTADO', petNames[game.character?.vocation] || 'Seu companheiro', 'victory', 3);
          },
        };
      }
      return {
        lines: [
          '“O Fragmento revelou a entrada do templo.”',
          '“Azhur, o Deus Sol, está esperando sob aquelas pedras.”',
          '“Entre. Derrote-o antes que a luz dele transforme o deserto em um túmulo.”',
        ],
      };
    },
  });
  game.npcs.push(nadir);

  progression.on((id) => {
    nadir.setMarker(id === 'nadir' || id === 'return' || id === 'pet' ? 0xffd36a : null);
    if (id === 'return') shard.visible = true;
  });
  nadir.setMarker(progression.id === 'nadir' || progression.id === 'return' || progression.id === 'pet' ? 0xffd36a : null);
  // Restore the mission HUD immediately when Map 2 is entered/reloaded.
  progression.apply(false);

  if (game.character?.data?.pet?.source === 'desert') {
    petGranted = true;
    createPetVisual(game.character.vocation);
  }

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
  // Altar: solid gameplay footprint. Its walkable top is paired with the
  // staircase colliders below so the player can climb and descend naturally.
  addBox(150,0.45,35,15,0.9,11,darkStone);

  const altarStepMat = new THREE.MeshStandardMaterial({ color:0x5b4735, roughness:1, flatShading:true });
  for (const [z, h] of [[27.8,0.3],[28.7,0.5],[29.5,0.7]]) {
    // Give each step enough depth for the player's collision radius to
    // transition cleanly in both directions at the altar edge.
    const step = new THREE.Mesh(new THREE.BoxGeometry(5.2,h,1.8), altarStepMat);
    step.position.set(150,h/2,z);
    step.castShadow = true;
    step.receiveShadow = true;
    temple.add(step);
    collision.addBox(147.35,152.65,z - 0.9,z + 0.9,{ walkableTop:true, topY:h });
  }

  // Raised altar platform: the whole visible slab is solid and walkable
  // on top. Keep the stair mouth open in the center, but make the left and
  // right portions climbable from above and blocking from ground level.
  // Using walkableTop avoids the old invisible vertical-wall behavior.
  collision.addBox(142.5,147.35,29.5,40.5,{ walkableTop:true, topY:0.9, projectiles:false });
  collision.addBox(147.35,152.65,30.4,40.5,{ walkableTop:true, topY:0.9, projectiles:false });
  collision.addBox(152.65,157.5,29.5,40.5,{ walkableTop:true, topY:0.9, projectiles:false });

  for (const [x,z,h] of [[137,35,5.2],[163,35,5.2],[142,43,4],[158,43,4]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.95,h,6),stoneMat);
    c.position.set(x,h/2,z); c.castShadow=true; temple.add(c);
    collision.addCircle(x,z,0.95);
  }
  collision.addBox(130.9,133.1,27,35);   // west entrance wall
  collision.addBox(166.9,169.1,27,35);   // east entrance wall
  // Match the visible north ruin blocks exactly; the previous colliders were
  // shifted 5 units inward and created invisible walls / gaps.
  collision.addBox(131,141,45.9,48.1);
  collision.addBox(159,169,45.9,48.1);
  // The altar slab is a walkable raised platform; its collider is deliberately
  // marked with topY so the player can stand on it instead of being blocked by it.

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
    areaEnemies.push(e);
    game.addEnemy(e);
    return e;
  };

  [
    ['scorpion',129,-27,'Escorpião das Dunas'],
    ['scorpion',143,-33,'Escorpião das Dunas'],
    ['scorpion',174,-21,'Escorpião das Dunas'],
    ['scorpion',181,8,'Escorpião das Dunas'],
    ['wisp',122,12,'Espírito da Miragem'],
    ['wisp',176,15,'Espírito da Miragem'],
    ['zombie',132,-4,'Guardião Soterrado'],
    ['zombie',168,-5,'Guardião Soterrado'],
  ].forEach(([type,x,z,name])=>spawn(type,x,z,name));

  const entryPortal = createPortal(game, ORIGIN.x, -45);
  entryPortal.rise();
  // The north portal is the reward for defeating the desert boss.
  // It stays hidden until the fight is complete.
  const exitPortal = createPortal(game, ORIGIN.x, 35);

  const portalStone = new THREE.Group();
  portalStone.position.set(ORIGIN.x,0,-45);
  scene.add(portalStone);
  for(const x of [-3,3]) {
    const p=new THREE.Mesh(new THREE.BoxGeometry(1.3,3.6,1.3),stoneMat);
    p.position.set(x,1.8,0);
    p.castShadow=true; portalStone.add(p);
    collision.addCircle(ORIGIN.x + x, -45, 0.9);
  }


  // ---------- buried-sun guardian ----------
  // The combat circle is kept in front of the temple's north wall so the
  // guardian never overlaps the ruin geometry or gets visually trapped.
  const bossArena = { x: ORIGIN.x, z: 37, r: 7.5 };
  let bossCooldown = 0;
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
  const desertBoss = new SunGodBoss(game, bossArena.x, bossArena.z, {
    name: 'Azhur, o Deus Sol',
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
      progression.advance('portal');
      exitPortal.rise();
      game.rig.cinematic(exitPortal.pos, 3);
      game.schedule(1.0, () => {
        if (game.area === area) game.ui.banner('O SOL FOI SEPULTADO', 'Azhur caiu. O portal de retorno foi despertado.', 'victory', 4);
      });
      game.schedule(3.2, () => { if (game.area === area) game.ui.hideBoss(); });
      game.saveWorldState?.();
      game.ui.toast('Azhur tombou. O portal de retorno foi despertado.');
    },
  });
  game.addEnemy(desertBoss);
  areaEnemies.push(desertBoss);
  desertBoss.arena = bossArena;

  function startDesertBoss() {
    if (bossCooldown > 0 || desertBoss.state !== 'dormant' || !exitPortal || !progression.reached('boss')) return;
    fightStart = game.time;
    desertBoss.awaken();
    game.rig.cinematic(new THREE.Vector3(desertBoss.pos.x, 0, desertBoss.pos.z + 3), 2.4);
    game.schedule(0.8, () => {
      if (game.area === area) game.ui.banner('AZHUR', 'O Deus Sol desperta sob o templo', 'boss', 3);
    });
    game.schedule(1.2, () => {
      if (game.area === area) game.ui.showBoss(desertBoss.name);
    });
    game.ui.toast('O selo treme. Azhur, Deus Sol, despertou.');
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

  let area;
  area = {
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
      bossPortal: { x: ORIGIN.x, z: 35 },
    },

    onStart() {
      game.ui.banner('DESERTO DO SOL SEPULTADO', 'Mapa 2', 'boss', 3.5);
      game.schedule(3.8, () => {
        if (game.area === area) game.ui.toast('O portal trouxe você a um templo que deveria continuar enterrado.');
      });
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
      progression.advance('portal');
    },

    onRespawn() {
      // A defeated boss stays defeated. An interrupted fight resets with a real cooldown.
      if (desertBoss.state !== 'dormant' && desertBoss.state !== 'dead') {
        desertBoss.reset();
        bossCooldown = 5;
        game.ui.hideBoss();
        game.ui.toast('O selo de Azhur está se recompondo...');
      }
    },

    dispose() {
      // Restore global presentation state changed only for the desert.
      if (oldBackground) scene.background = oldBackground;
      else scene.background = null;
      for (const band of mirageBands) scene.remove(band);
      // Remove every Area 2 interaction and collision entry created after the snapshot.
      game.interaction.items.length = interactionBaseline;
      collision.zones.length = collisionZoneBaseline;
      collision.obstacles.length = collisionObstacleBaseline;

      for (const enemy of areaEnemies) enemy.dispose?.();
      game.enemies = game.enemies.filter((enemy) => !areaEnemies.includes(enemy));

      for (const child of [...scene.children]) {
        if (!sceneBaseline.has(child)) scene.remove(child);
      }
      game.ui.hideBoss();
      game.ui.hidePrompt();
      game.dialogue.close(false);
    },

    update(dt,t) {
      if (bossCooldown > 0) bossCooldown = Math.max(0, bossCooldown - dt);
      entryPortal.update(dt,t);
      exitPortal.update(dt,t);
      heatHaze.update(t);
      water.material.opacity = 0.78 + Math.sin(t*1.8)*0.06;

      // Heat shimmer / drifting sand. Kept lightweight for the prototype.
      if (game.player) {
        const groundY = terrain.height(game.player.pos.x, game.player.pos.z);
        game.player.root.position.y = THREE.MathUtils.damp(game.player.root.position.y, groundY, 10, dt);
      }

      for (const enemy of areaEnemies) {
        if (enemy?.root && !enemy.isBoss) {
          const groundY = terrain.height(enemy.pos.x, enemy.pos.z);
          enemy.root.position.y = THREE.MathUtils.damp(enemy.root.position.y, groundY, 10, dt);
        }
      }

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
      if (bossCooldown <= 0 && progression.reached('boss') && desertBoss.state === 'dormant' && p.pos.z > 32 && p.pos.z < 43 && Math.abs(p.pos.x - ORIGIN.x) < 7) {
        startDesertBoss();
        return;
      }
    },
  };

  decor.build(scene);
  return area;
}
