// Data-driven blacksmith recipes and upgrade economy for Ecos da Eternidade.
export const FORGE_UPGRADES = [
  { level: 1, cost: 45, iron: 2, chance: 0.82 },
  { level: 2, cost: 85, iron: 3, chance: 0.70 },
  { level: 3, cost: 140, iron: 4, chance: 0.56 },
  { level: 4, cost: 220, iron: 5, chance: 0.42 },
  { level: 5, cost: 340, iron: 7, chance: 0.30 },
];

export const FORGE_RECIPES = [
  {
    id: 'reinforced_leggings', itemId: 'reinforced_leggings', name: 'Calças Reforçadas',
    cost: 80, materials: { iron_scrap: 6 },
    description: 'Equipamento confiável para explorar as ruínas.',
  },
  {
    id: 'iron_buckler', itemId: 'iron_buckler', name: 'Broquel de Ferro',
    cost: 100, materials: { iron_scrap: 8 },
    description: 'Um escudo simples, reforçado na forja.',
  },
  {
    id: 'depths_edge', itemId: 'depths_edge', name: 'Lâmina das Profundezas',
    cost: 180, materials: { iron_scrap: 12, gorvak_fang: 1 },
    description: 'Arma especial forjada com a presa de Gorvak.', exclusive: true,
  },
  {
    id: 'morvhal_ward', itemId: 'morvhal_ward', name: 'Égide do Guardião Oco',
    cost: 240, materials: { iron_scrap: 10, wisp_essence: 5, morvhal_heart: 1 },
    description: 'Proteção rara moldada pelo poder de Morvhal.', exclusive: true,
  },
  {
    id: 'azhur_sunbow', itemId: 'azhur_sunbow', name: 'Arco da Brasa Eterna',
    cost: 320, materials: { iron_scrap: 8, moon_herb: 5, azhur_sun_ember: 1 },
    description: 'Arco exclusivo criado com a última brasa de Azhur.', exclusive: true,
  },
];

export const FORGE_RECYCLE = {
  iron_sword: { iron_scrap: 3 },
  hunter_bow: { iron_scrap: 3 },
  ember_staff: { iron_scrap: 3 },
  verdant_staff: { iron_scrap: 3 },
  iron_wraps: { iron_scrap: 2 },
  iron_armor: { iron_scrap: 4 },
  leather_armor: { iron_scrap: 2 },
  mystic_robe: { wisp_essence: 1, iron_scrap: 1 },
  traveler_garb: { iron_scrap: 2 },
  moon_ring: { wisp_essence: 1 },
  worn_cap: { iron_scrap: 1 },
  worn_leggings: { iron_scrap: 1 },
  worn_boots: { iron_scrap: 1 },
  simple_amulet: { iron_scrap: 1 },
  crude_buckler: { iron_scrap: 1 },
  leather_cap: { iron_scrap: 2 },
  reinforced_leggings: { iron_scrap: 2 },
  leather_boots: { iron_scrap: 2 },
  warding_amulet: { iron_scrap: 2, wisp_essence: 1 },
  iron_buckler: { iron_scrap: 3 },
  red_potion: { moon_herb: 1 },
  mana_potion: { wisp_essence: 1 },
  iron_scrap: { iron_scrap: 1 },
  wisp_essence: { wisp_essence: 1 },
  moon_herb: { moon_herb: 1 },
};
