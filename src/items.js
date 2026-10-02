// Central item definitions for the RPG inventory and loot systems.

export const ITEMS = {
  iron_sword: {
    id: 'iron_sword', sprite: 'uploads/01_espada_de_ferro.png', name: 'Espada de Ferro',
    description: 'Uma lâmina simples, mas confiável.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['knight'] }, stats: { attackMin: 4, attackMax: 7 }, icon: '⚔',
  },
  hunter_bow: {
    id: 'hunter_bow', sprite: 'uploads/02_arco_de_caca.png', name: 'Arco de Caça',
    description: 'Arco leve usado por caçadores da fronteira.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['paladin'] }, stats: { attackMin: 4, attackMax: 7, attackSpeed: 0.02 }, icon: '➶',
  },
  ember_staff: {
    id: 'ember_staff', sprite: 'uploads/03_cajado_da_brasa.png', name: 'Cajado da Brasa',
    description: 'Um foco simples para canalizar magia.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['sorcerer'] }, stats: { attackMin: 5, attackMax: 8, abilityMin: 6, abilityMax: 10 }, icon: '✦',
  },
  verdant_staff: {
    id: 'verdant_staff', sprite: 'uploads/04_cajado_verdejante.png', name: 'Cajado Verdejante',
    description: 'Madeira viva que ainda guarda energia da floresta.', category: 'equipamento', maxStack: 1, value: 80,
    equipment: { slot: 'weapon', vocations: ['druid'] }, stats: { attackMin: 4, attackMax: 7, abilityMin: 5, abilityMax: 9 }, icon: '✧',
  },
  iron_wraps: {
    id: 'iron_wraps', sprite: 'uploads/07_bandagens_reforcadas.png', name: 'Bandagens Reforçadas',
    description: 'Faixas pesadas para proteger os punhos.', category: 'equipamento', maxStack: 1, value: 70,
    equipment: { slot: 'weapon', vocations: ['monk'] }, stats: { attackMin: 3, attackMax: 5, attackSpeed: 0.015 }, icon: '✊',
  },
  iron_armor: {
    id: 'iron_armor', sprite: 'uploads/06_armadura_de_ferro.png', name: 'Armadura de Ferro',
    description: 'Proteção básica de placas.', category: 'equipamento', maxStack: 1, value: 90,
    equipment: { slot: 'armor', vocations: ['knight'] }, stats: { maxHp: 18, armorPercent: 0.02 }, icon: '▣',
  },
  leather_armor: {
    id: 'leather_armor', sprite: 'uploads/08_armadura_de_couro.png', name: 'Armadura de Couro',
    description: 'Leve e flexível, ideal para combate à distância.', category: 'equipamento', maxStack: 1, value: 75,
    equipment: { slot: 'armor', vocations: ['paladin'] }, stats: { maxHp: 12, armorPercent: 0.015 }, icon: '◇',
  },
  mystic_robe: {
    id: 'mystic_robe', sprite: 'uploads/09_manto_mistico.png', name: 'Manto Místico',
    description: 'Tecido encantado que protege sem limitar os movimentos.', category: 'equipamento', maxStack: 1, value: 75,
    equipment: { slot: 'armor', vocations: ['sorcerer', 'druid'] }, stats: { maxHp: 10, abilityMin: 3, abilityMax: 5 }, icon: '◈',
  },
  traveler_garb: {
    id: 'traveler_garb', sprite: 'uploads/10_traje_do_viajante.png', name: 'Traje do Viajante',
    description: 'Roupa leve para quem depende da mobilidade.', category: 'equipamento', maxStack: 1, value: 70,
    equipment: { slot: 'armor', vocations: ['monk'] }, stats: { maxHp: 14, speed: 0.15 }, icon: '◆',
  },

  moon_ring: {
    id: 'moon_ring', sprite: 'https://freegamesprites.com/images/ai-sprites/generated/ring-of-lightning.png', name: 'Anel Lunar',
    description: 'Um anel simples que amplifica a energia do portador.', category: 'equipamento', maxStack: 1, value: 120,
    equipment: { slot: 'ring' }, stats: { maxHp: 8, abilityMin: 2, abilityMax: 3 }, icon: '○',
  },

  worn_cap: {
    id: 'worn_cap', sprite: 'uploads/capuz-gasto.png', name: 'Capuz Gasto',
    description: 'Um capuz velho, melhor que enfrentar a floresta de cabeça descoberta.',
    category: 'equipamento', maxStack: 1, value: 18,
    equipment: { slot: 'head' }, stats: { maxHp: 2, armorPercent: 0.004 }, icon: '⌒',
  },
  worn_leggings: {
    id: 'worn_leggings', sprite: 'uploads/calça-gasta.png', name: 'Calças Gastas',
    description: 'Tecido remendado que oferece uma proteção mínima.',
    category: 'equipamento', maxStack: 1, value: 22,
    equipment: { slot: 'legs' }, stats: { maxHp: 3, armorPercent: 0.003 }, icon: '∥',
  },
  worn_boots: {
    id: 'worn_boots', sprite: 'uploads/bota-gasta.png', name: 'Botas Gastas',
    description: 'Botas velhas, mas ainda firmes o bastante para a estrada.',
    category: 'equipamento', maxStack: 1, value: 20,
    equipment: { slot: 'boots' }, stats: { speed: 0.03 }, icon: '◢',
  },
  simple_amulet: {
    id: 'simple_amulet', sprite: 'uploads/amuleto-simples.png', name: 'Amuleto Simples',
    description: 'Um pequeno amuleto sem grande poder, encontrado entre os restos da floresta.',
    category: 'equipamento', maxStack: 1, value: 28,
    equipment: { slot: 'amulet' }, stats: { maxHp: 4 }, icon: '◇',
  },
  crude_buckler: {
    id: 'crude_buckler', sprite: 'uploads/broquel-simples.png', name: 'Broquel Rústico',
    description: 'Um escudo pequeno e mal acabado, mas ainda útil.',
    category: 'equipamento', maxStack: 1, value: 32,
    equipment: { slot: 'shield', vocations: ['knight', 'paladin'] }, stats: { armorPercent: 0.007 }, icon: '⬟',
  },

  leather_cap: {
    id: 'leather_cap', sprite: 'uploads/capuz-de-couro.png', name: 'Capuz de Couro',
    description: 'Um capuz simples, bem melhor acabado que os trapos encontrados na floresta.',
    category: 'equipamento', maxStack: 1, value: 65,
    equipment: { slot: 'head' }, stats: { maxHp: 5, armorPercent: 0.009 }, icon: '⌒',
  },
  reinforced_leggings: {
    id: 'reinforced_leggings', sprite: 'uploads/calças-reforçadas.png', name: 'Calças Reforçadas',
    description: 'Calças resistentes para atravessar as ruínas com um pouco mais de proteção.',
    category: 'equipamento', maxStack: 1, value: 72,
    equipment: { slot: 'legs' }, stats: { maxHp: 7, armorPercent: 0.007 }, icon: '∥',
  },
  leather_boots: {
    id: 'leather_boots', sprite: 'uploads/bota-de-couro.png', name: 'Botas de Couro',
    description: 'Botas confortáveis que melhoram discretamente a mobilidade.',
    category: 'equipamento', maxStack: 1, value: 68,
    equipment: { slot: 'boots' }, stats: { speed: 0.06 }, icon: '◢',
  },
  warding_amulet: {
    id: 'warding_amulet', sprite: 'uploads/amuleto-de-proteção.png', name: 'Amuleto de Proteção',
    description: 'Um amuleto simples preparado para resistir às energias das ruínas.',
    category: 'equipamento', maxStack: 1, value: 85,
    equipment: { slot: 'amulet' }, stats: { maxHp: 9, armorPercent: 0.004 }, icon: '◇',
  },
  iron_buckler: {
    id: 'iron_buckler', sprite: 'uploads/broquel-de-ferro.png', name: 'Broquel de Ferro',
    description: 'Um pequeno escudo de ferro, confiável sem ser uma peça de alto nível.',
    category: 'equipamento', maxStack: 1, value: 95,
    equipment: { slot: 'shield', vocations: ['knight', 'paladin'] }, stats: { armorPercent: 0.014, maxHp: 4 }, icon: '⬟',
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
  mana_potion: {
    id: 'mana_potion',
    sprite: 'uploads/02_pocao_de_mana.png',
    name: 'Poção de Mana',
    description: 'Recupera uma quantidade de mana ao ser usada.',
    category: 'consumível',
    maxStack: 20,
    value: 22,
    icon: '◆',
    effect: { type: 'restoreMana', value: 40 },
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

/*
 * Catálogo de equipamentos.
 * O catálogo descreve a progressão disponível no projeto sem liberar esses
 * itens automaticamente em lojas ou recompensas.
 */
export const ITEM_CATALOG = {
  starter: [
    'iron_sword', 'hunter_bow', 'ember_staff', 'verdant_staff', 'iron_wraps',
    'iron_armor', 'leather_armor', 'mystic_robe', 'traveler_garb', 'moon_ring',
  ],
  area1: {
    weapons: {
      knight: ['iron_sword'],
      paladin: ['hunter_bow'],
      sorcerer: ['ember_staff'],
      druid: ['verdant_staff'],
      monk: ['iron_wraps'],
    },
    armor: {
      knight: ['iron_armor'],
      paladin: ['leather_armor'],
      sorcerer: ['mystic_robe'],
      druid: ['mystic_robe'],
      monk: ['traveler_garb'],
    },
    accessories: ['moon_ring', 'simple_amulet', 'warding_amulet'],
    head: ['worn_cap', 'leather_cap'],
    legs: ['worn_leggings', 'reinforced_leggings'],
    boots: ['worn_boots', 'leather_boots'],
    shields: ['crude_buckler', 'iron_buckler'],
  },
  plannedSlots: [],
};

export const EQUIPMENT_SLOT_META = {
  head: { name: 'Cabeça', glyph: '◉' },
  armor: { name: 'Armadura', glyph: '♜' },
  legs: { name: 'Pernas', glyph: '∥' },
  boots: { name: 'Botas', glyph: '◢' },
  weapon: { name: 'Arma', glyph: '⚔' },
  shield: { name: 'Escudo', glyph: '⬟' },
  amulet: { name: 'Amuleto', glyph: '◇' },
  ring: { name: 'Anel', glyph: '○' },
};

export function getItem(id) {
  return ITEMS[id] ?? null;
}
