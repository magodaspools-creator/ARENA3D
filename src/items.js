// Central item definitions for the RPG inventory and loot systems.

export const ITEMS = {
  iron_sword: {
    id: 'iron_sword', sprite: null, name: 'Espada de Ferro',
    description: 'Uma lâmina simples, mas confiável.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['knight'] }, stats: { attackMin: 4, attackMax: 7 }, icon: '⚔',
  },
  hunter_bow: {
    id: 'hunter_bow', sprite: null, name: 'Arco de Caça',
    description: 'Arco leve usado por caçadores da fronteira.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['paladin'] }, stats: { attackMin: 4, attackMax: 7, attackSpeed: 0.02 }, icon: '➶',
  },
  ember_staff: {
    id: 'ember_staff', sprite: null, name: 'Cajado da Brasa',
    description: 'Um foco simples para canalizar magia.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['sorcerer'] }, stats: { attackMin: 5, attackMax: 8, abilityMin: 6, abilityMax: 10 }, icon: '✦',
  },
  verdant_staff: {
    id: 'verdant_staff', sprite: null, name: 'Cajado Verdejante',
    description: 'Madeira viva que ainda guarda energia da floresta.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['druid'] }, stats: { attackMin: 4, attackMax: 7, abilityMin: 5, abilityMax: 9 }, icon: '✧',
  },
  iron_wraps: {
    id: 'iron_wraps', sprite: null, name: 'Bandagens Reforçadas',
    description: 'Faixas pesadas para proteger os punhos.', category: 'equipamento', maxStack: 1, value: 70,
    equipment: { slot: 'weapon', vocations: ['monk'] }, stats: { attackMin: 3, attackMax: 5, attackSpeed: 0.015 }, icon: '✊',
  },
  iron_armor: {
    id: 'iron_armor', sprite: null, name: 'Armadura de Ferro',
    description: 'Proteção básica de placas.', category: 'equipamento', maxStack: 1, value: 90,
    equipment: { slot: 'armor', vocations: ['knight'] }, stats: { maxHp: 18, armorPercent: 0.02 }, icon: '▣',
  },
  leather_armor: {
    id: 'leather_armor', sprite: null, name: 'Armadura de Couro',
    description: 'Leve e flexível, ideal para combate à distância.', category: 'equipamento', maxStack: 1, value: 75,
    equipment: { slot: 'armor', vocations: ['paladin'] }, stats: { maxHp: 12, armorPercent: 0.015 }, icon: '◇',
  },
  mystic_robe: {
    id: 'mystic_robe', sprite: null, name: 'Manto Místico',
    description: 'Tecido encantado que protege sem limitar os movimentos.', category: 'equipamento', maxStack: 1, value: 75,
    equipment: { slot: 'armor', vocations: ['sorcerer', 'druid'] }, stats: { maxHp: 10, abilityMin: 3, abilityMax: 5 }, icon: '◈',
  },
  traveler_garb: {
    id: 'traveler_garb', sprite: null, name: 'Traje do Viajante',
    description: 'Roupa leve para quem depende da mobilidade.', category: 'equipamento', maxStack: 1, value: 70,
    equipment: { slot: 'armor', vocations: ['monk'] }, stats: { maxHp: 14, speed: 0.15 }, icon: '◆',
  },

  moon_ring: {
    id: 'moon_ring', sprite: 'assets/items/hollow-core.svg', name: 'Anel Lunar',
    description: 'Um anel simples que amplifica a energia do portador.', category: 'equipamento', maxStack: 1, value: 120,
    equipment: { slot: 'ring' }, stats: { maxHp: 8, abilityMin: 2, abilityMax: 3 }, icon: '○',
  },
  red_potion: {
    id: 'red_potion',
    sprite: 'assets/items/red-potion.svg',
    name: 'Poção Rubra',
    description: 'Recupera 35% da vida máxima ao ser usada.',
    category: 'consumível',
    maxStack: 20,
    value: 18,
    icon: '◆',
    effect: { type: 'healPercent', value: 0.35 },
  },
  iron_scrap: {
    id: 'iron_scrap',
    sprite: 'assets/items/iron-scrap.svg',
    name: 'Fragmento de Ferro',
    description: 'Metal bruto deixado pelos servos ocos.',
    category: 'material',
    maxStack: 50,
    value: 8,
    icon: '◇',
  },
  wisp_essence: {
    id: 'wisp_essence',
    sprite: 'assets/items/wisp-essence.svg',
    name: 'Essência Fátua',
    description: 'Uma pequena concentração da energia dos fogos-fátuos.',
    category: 'material',
    maxStack: 50,
    value: 14,
    icon: '✦',
  },
  moon_herb: {
    id: 'moon_herb',
    sprite: 'assets/items/moon-herb.svg',
    name: 'Erva Lunar',
    description: 'Planta rara que cresce nas áreas tocadas pela névoa.',
    category: 'material',
    maxStack: 30,
    value: 22,
    icon: '✧',
  },
  hollow_core: {
    id: 'hollow_core',
    sprite: 'assets/items/hollow-core.svg',
    name: 'Núcleo Oco',
    description: 'O núcleo do Guardião Oco. Ainda pulsa com energia residual.',
    category: 'quest',
    maxStack: 10,
    value: 150,
    icon: '●',
  },
};

export function getItem(id) {
  return ITEMS[id] ?? null;
}
