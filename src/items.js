// Central item definitions for the RPG inventory and loot systems.

export const ITEMS = {
  red_potion: {
    id: 'red_potion',
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
    name: 'Fragmento de Ferro',
    description: 'Metal bruto deixado pelos servos ocos.',
    category: 'material',
    maxStack: 50,
    value: 8,
    icon: '◇',
  },
  wisp_essence: {
    id: 'wisp_essence',
    name: 'Essência Fátua',
    description: 'Uma pequena concentração da energia dos fogos-fátuos.',
    category: 'material',
    maxStack: 50,
    value: 14,
    icon: '✦',
  },
  moon_herb: {
    id: 'moon_herb',
    name: 'Erva Lunar',
    description: 'Planta rara que cresce nas áreas tocadas pela névoa.',
    category: 'material',
    maxStack: 30,
    value: 22,
    icon: '✧',
  },
  hollow_core: {
    id: 'hollow_core',
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
