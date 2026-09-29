// Lightweight loot rolls. Loot tables are data-driven so each area can
// define drops without changing the reward system.

export function rollLoot(table = []) {
  const drops = [];
  for (const entry of table) {
    const chance = Math.max(0, Math.min(1, Number(entry.chance) || 0));
    if (Math.random() > chance) continue;
    const min = Math.max(1, Math.floor(entry.min ?? 1));
    const max = Math.max(min, Math.floor(entry.max ?? min));
    const amount = min + Math.floor(Math.random() * (max - min + 1));
    drops.push({ itemId: entry.itemId, amount });
  }
  return drops;
}
