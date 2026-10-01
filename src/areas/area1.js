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

  // ---------- protection zone: NPC plaza ----------
  // Maren and Doran share a single safe plaza. The circle is deliberately
  // visual and generous enough to contain both NPCs and the approach around
  // them, without becoming a hidden collision boundary.
  const npcPz = {
    x: 0.1,
    z: 35.2,
    radius: 8.2,
  };

  const pzGroup = new THREE.Group();
  pzGroup.name = 'npc-protection-zone';
  scene.add(pzGroup);

  const pzFloorMat = new THREE.MeshStandardMaterial({
    color: 0xaaa895,
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const pzFloor = new THREE.Mesh(
    new THREE.CircleGeometry(npcPz.radius, 64),
    pzFloorMat
  );
  pzFloor.rotation.x = -Math.PI / 2;
  pzFloor.position.set(npcPz.x, 0.018, npcPz.z);
  pzFloor.receiveShadow = true;
  pzGroup.add(pzFloor);

  const pzInnerMat = new THREE.MeshBasicMaterial({
    color: 0xd6d2bd,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pzInner = new THREE.Mesh(
    new THREE.CircleGeometry(npcPz.radius * 0.92, 64),
    pzInnerMat
  );
  pzInner.rotation.x = -Math.PI / 2;
  pzInner.position.set(npcPz.x, 0.026, npcPz.z);
  pzGroup.add(pzInner);

  const pzRingMat = new THREE.MeshBasicMaterial({
    color: 0x7f9f9a,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pzRing = new THREE.Mesh(
    new THREE.RingGeometry(npcPz.radius - 0.16, npcPz.radius, 64),
    pzRingMat
  );
  pzRing.rotation.x = -Math.PI / 2;
  pzRing.position.set(npcPz.x, 0.035, npcPz.z);
  pzGroup.add(pzRing);

  // Tibia-inspired PZ marker: a simple floating shield, kept as geometry so
  // there is no external texture or asset dependency.
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
      color: 0x5e9b91,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  shield.scale.setScalar(0.72);
  pzIcon.add(shield);

  const shieldCore = new THREE.Mesh(
    new THREE.ShapeGeometry(shieldShape),
    new THREE.MeshBasicMaterial({
      color: 0xdce8df,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  shieldCore.scale.setScalar(0.39);
  shieldCore.position.z = 0.01;
  pzIcon.add(shieldCore);

  // Small cross in the center makes the symbol read as protection at a glance.
  const pzCrossMat = new THREE.MeshBasicMaterial({
    color: 0x4f8179,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.34), pzCrossMat);
  const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.10), pzCrossMat);
  crossV.position.z = 0.02;
  crossH.position.z = 0.021;
  pzIcon.add(crossV, crossH);

  // Face the shield toward the default camera direction while keeping it
  // upright in the world. It is an icon, not an interactable object.
  pzIcon.rotation.x = -Math.PI / 2;
  pzIcon.rotation.z = 0;

  // ---------- quest ----------


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

  game.interaction.add({
    pos: mineEntrance.position,
    radius: 3.0,
    height: 4.0,
    label: () => mine.active ? 'Descer para a mina abandonada' : 'Entrar na mina abandonada',
    enabled: () => !mine.active,
    onInteract: enterMine,
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