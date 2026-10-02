// Every vocation shares the same Player code; only data changes here.
export const VOCATIONS = {
  knight: {
    id: 'knight', name: 'Knight', title: 'Guardião de Aço', color: '#8fb4ff', hp: 230, speed: 6.0, armor: 0.8,
    desc: 'Combate corpo a corpo e muita resistência. Golpes em arco acertam vários inimigos de uma vez.',
    look: { skin: 0xe0b08c, body: 0x3d5078, legs: 0x2a3244, accent: 0xbfc7d5, head: 'helm', shoulder: true, metal: 0.18, metalRough: 0.78, cape: 0x1f3a78, weapon: 'sword', offhand: 'shield', glow: 0x8fb4ff },
    attack: { kind: 'melee', name: 'Golpe', range: 2.9, arc: 2.2, damage: [26, 34], cooldown: 0.6, style: 'slash', color: 0xcfe0ff },
    ability: { kind: 'whirl', name: 'Redemoinho', radius: 4.2, damage: [48, 62], cooldown: 6, color: 0x8fb4ff },
    ultimate: { kind: 'colossalStrike', name: 'Golpe Colossal', radius: 4.6, arc: 2.6, damage: [150, 190], color: 0x9fc4ff },
  },
  paladin: {
    id: 'paladin', name: 'Paladin', title: 'Arqueiro Sagrado', color: '#ffd76a', hp: 190, speed: 6.2, armor: 0.9,
    desc: 'Flechas sagradas a distância. Equilibra alcance e resistência.',
    look: { skin: 0xd9a47c, body: 0xe8dcc0, legs: 0x6b5a3a, accent: 0xd9b04a, head: 'hair', hair: 0x6b4a2a, shoulder: true, cape: 0xb8902a, weapon: 'bow', glow: 0xffd76a },
    attack: { kind: 'projectile', name: 'Flecha', visual: 'arrow', speed: 30, range: 22, damage: [20, 27], cooldown: 0.5, style: 'shoot', color: 0xffe6a0 },
    ability: { kind: 'volley', name: 'Chuva Sagrada', count: 7, spread: 0.9, damage: [22, 28], cooldown: 6, color: 0xffd76a },
  },
  sorcerer: {
    id: 'sorcerer', name: 'Sorcerer', title: 'Mestre das Chamas', color: '#ff7a3d', hp: 150, speed: 5.9, armor: 1,
    desc: 'Frágil, mas devastador. Bolas de fogo explodem em área e o Meteoro arrasa grupos.',
    look: { skin: 0xe3b592, body: 0x5a1f2a, legs: 0x2a1216, robe: 0x4a1622, accent: 0xd08a2a, head: 'hat', weapon: 'staff', orb: 0xff6a2a, glow: 0xff7a3d },
    attack: { kind: 'projectile', name: 'Bola de Fogo', visual: 'fire', speed: 17, range: 18, damage: [30, 38], splash: 1.8, cooldown: 0.8, style: 'cast', color: 0xff6a2a },
    ability: { kind: 'meteor', name: 'Meteoro', radius: 4, damage: [80, 100], cooldown: 7, delay: 0.8, color: 0xff5a1a },
    ultimate: { kind: 'arcaneCataclysm', name: 'Cataclisma Arcano', radius: 5.2, damage: [105, 135], color: 0xb875ff },
  },
  druid: {
    id: 'druid', name: 'Druid', title: 'Voz da Floresta', color: '#7dff9a', hp: 175, speed: 6.0, armor: 1,
    desc: 'Espinhos mágicos e cura. Aguenta lutas longas sozinho.',
    look: { skin: 0xc99a74, body: 0x2f4a2a, legs: 0x3a2e20, robe: 0x2a3f24, accent: 0x9acd5a, head: 'hood', hood: 0x3a5530, weapon: 'staff', orb: 0x7dff9a, glow: 0x7dff9a },
    attack: { kind: 'projectile', name: 'Espinho', visual: 'thorn', speed: 22, range: 19, damage: [21, 27], cooldown: 0.6, style: 'cast', color: 0x7dff9a },
    ability: { kind: 'bloom', name: 'Florescer', radius: 4.8, heal: 0.45, damage: [28, 36], cooldown: 9, color: 0x7dff9a },
  },
  monk: {
    id: 'monk', name: 'Monk', title: 'Punho Sereno', color: '#ffb45a', hp: 200, speed: 6.9, armor: 0.95,
    desc: 'Rápido e ágil. Socos em sequência e uma investida que atravessa os inimigos.',
    look: { skin: 0xd39c70, body: 0xd9822b, legs: 0x5a3a22, accent: 0xffd08a, head: 'band', weapon: 'fists', bareArms: true, glow: 0xffb45a },
    attack: { kind: 'melee', name: 'Soco', range: 2.3, arc: 1.9, damage: [14, 19], cooldown: 0.3, style: 'punch', color: 0xffc27a },
    ability: { kind: 'dash', name: 'Investida', distance: 8, damage: [42, 55], cooldown: 5, color: 0xffb45a },
  },
};
