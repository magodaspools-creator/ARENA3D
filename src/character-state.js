const STORAGE_PREFIX = 'arena.character.v1';

export const XP = {
  forLevel(level) {
    const n = Math.max(1, Math.floor(level));
    return Math.floor(100 * Math.pow(n, 1.55));
  },
  totalForLevel(level) {
    let total = 0;
    for (let n = 1; n < level; n++) total += this.forLevel(n);
    return total;
  },
};

function fresh(vocation) {
  return {
    version: 1,
    vocation,
    level: 1,
    xp: 0,
    gold: 0,
    inventory: [],
  };
}

export class CharacterState {
  constructor(vocation) {
    this.vocation = vocation;
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return fresh(this.vocation);
      const saved = JSON.parse(raw);
      if (saved?.vocation !== this.vocation || saved?.version !== 1) return fresh(this.vocation);
      return {
        ...fresh(this.vocation),
        ...saved,
        level: Math.max(1, Math.floor(saved.level || 1)),
        xp: Math.max(0, Math.floor(saved.xp || 0)),
        gold: Math.max(0, Math.floor(saved.gold || 0)),
        inventory: Array.isArray(saved.inventory)
          ? saved.inventory
              .filter((item) => item && typeof item.id === 'string')
              .map((item) => ({ id: item.id, qty: Math.max(1, Math.floor(item.qty || 1)) }))
          : [],
      };
    } catch {
      return fresh(this.vocation);
    }
  }

  get key() {
    return `${STORAGE_PREFIX}.${this.vocation}`;
  }

  get level() { return this.data.level; }
  get xp() { return this.data.xp; }
  get gold() { return this.data.gold; }

  get levelStartXP() {
    return XP.totalForLevel(this.level);
  }

  get nextLevelXP() {
    return this.level < Number.MAX_SAFE_INTEGER ? XP.totalForLevel(this.level + 1) : this.xp;
  }

  get xpIntoLevel() {
    return Math.max(0, this.xp - this.levelStartXP);
  }

  get xpForNextLevel() {
    return Math.max(1, this.nextLevelXP - this.levelStartXP);
  }

  get xpPercent() {
    return Math.min(1, this.xpIntoLevel / this.xpForNextLevel);
  }

  addXP(amount) {
    const gained = Math.max(0, Math.floor(amount || 0));
    if (!gained) return { gained: 0, levels: 0 };

    const oldLevel = this.level;
    this.data.xp += gained;

    while (this.xp >= this.nextLevelXP) {
      this.data.level++;
    }

    this.save();
    return { gained, levels: this.level - oldLevel };
  }

  addGold(amount) {
    const gained = Math.max(0, Math.floor(amount || 0));
    if (!gained) return 0;
    this.data.gold += gained;
    this.save();
    return gained;
  }

  get inventory() {
    return this.data.inventory;
  }

  get inventorySlots() {
    return this.data.inventory.length;
  }

  addItem(itemId, amount = 1, maxStack = 99) {
    const qty = Math.max(0, Math.floor(amount || 0));
    if (!itemId || !qty) return { added: 0, remaining: qty };

    let remaining = qty;
    for (const slot of this.data.inventory) {
      if (slot.id !== itemId || slot.qty >= maxStack) continue;
      const space = maxStack - slot.qty;
      const add = Math.min(space, remaining);
      slot.qty += add;
      remaining -= add;
      if (!remaining) break;
    }

    if (remaining) {
      this.data.inventory.push({ id: itemId, qty: remaining });
      remaining = 0;
    }

    this.save();
    return { added: qty, remaining };
  }

  removeItem(itemId, amount = 1) {
    let remaining = Math.max(0, Math.floor(amount || 0));
    const requested = remaining;
    if (!itemId || !remaining) return 0;

    for (let i = this.data.inventory.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.data.inventory[i];
      if (slot.id !== itemId) continue;
      const take = Math.min(slot.qty, remaining);
      slot.qty -= take;
      remaining -= take;
      if (slot.qty <= 0) this.data.inventory.splice(i, 1);
    }

    const removed = requested - remaining;
    if (removed) this.save();
    return removed;
  }

  getItemCount(itemId) {
    return this.data.inventory
      .filter((slot) => slot.id === itemId)
      .reduce((sum, slot) => sum + slot.qty, 0);
  }

  save() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }
}
