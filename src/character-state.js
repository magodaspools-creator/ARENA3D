import { VOCATIONS } from './vocations.js';
import { getItem } from './items.js';

const STORAGE_PREFIX = 'arena.character.v1';

export const EQUIPMENT_SLOTS = ['head', 'armor', 'legs', 'boots', 'weapon', 'shield', 'amulet', 'ring'];

const STARTER_EQUIPMENT = {
  knight: { weapon: 'iron_sword', armor: 'iron_armor' },
  paladin: { weapon: 'hunter_bow', armor: 'leather_armor' },
  sorcerer: { weapon: 'ember_staff', armor: 'mystic_robe' },
  druid: { weapon: 'verdant_staff', armor: 'mystic_robe' },
  monk: { weapon: 'iron_wraps', armor: 'traveler_garb' },
};

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
    equipment: { ...(STARTER_EQUIPMENT[vocation] || {}) },
    deathDrops: [],
    progression: {},
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
        equipment: this.sanitizeEquipment(saved),
        inventory: Array.isArray(saved.inventory)
          ? saved.inventory
              .filter((item) => item && typeof item.id === 'string')
              .map((item) => ({ id: item.id, qty: Math.max(1, Math.floor(item.qty || 1)) }))
          : [],
        progression: saved.progression && typeof saved.progression === 'object' ? saved.progression : {},
        deathDrops: Array.isArray(saved.deathDrops)
          ? saved.deathDrops
              .filter((drop) => drop && typeof drop.id === 'string')
              .map((drop) => ({
                id: drop.id,
                gold: Math.max(0, Math.floor(drop.gold || 0)),
                x: Number(drop.x) || 0,
                z: Number(drop.z) || 0,
                items: Array.isArray(drop.items)
                  ? drop.items
                      .filter((item) => item && typeof item.id === 'string')
                      .map((item) => ({ id: item.id, qty: Math.max(1, Math.floor(item.qty || 1)) }))
                  : [],
              }))
          : [],
      };
    } catch {
      return fresh(this.vocation);
    }
  }

  get key() {
    return `${STORAGE_PREFIX}.${this.vocation}`;
  }

  sanitizeEquipment(saved) {
    if (saved && Object.prototype.hasOwnProperty.call(saved, 'equipment')) {
      const source = saved.equipment;
      const equipment = {};
      for (const slot of EQUIPMENT_SLOTS) if (typeof source?.[slot] === 'string') equipment[slot] = source[slot];
      return equipment;
    }
    return { ...(STARTER_EQUIPMENT[this.vocation] || {}) };
  }

  get level() { return this.data.level; }
  get equipment() { return this.data.equipment; }
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

  // Derived combat stats. Equipment and buffs will be layered on top later.
  get stats() {
    const v = VOCATIONS[this.vocation];
    const levelBonus = Math.max(0, this.level - 1);
    const damageScale = 1 + Math.min(0.75, levelBonus * 0.035);
    const hpScale = 1 + Math.min(2.5, levelBonus * 0.06);
    const speedScale = 1 + Math.min(0.25, levelBonus * 0.01);
    const attackSpeedScale = Math.max(0.8, 1 - levelBonus * 0.005);
    const abilityCooldownScale = Math.max(0.85, 1 - levelBonus * 0.003);

    const equipment = this.equipment;
    const equipmentBonus = Object.values(equipment).reduce((sum, id) => {
      const bonus = id ? this.getEquipmentBonus(id) : {};
      for (const [key, value] of Object.entries(bonus)) sum[key] = (sum[key] || 0) + Number(value || 0);
      return sum;
    }, {});
    const baseReduction = Math.max(0, 1 - v.armor);
    const armorReduction = Math.min(0.65, baseReduction + levelBonus * 0.004 + (equipmentBonus.armorPercent || 0));

    return {
      maxHp: Math.round(v.hp * hpScale + (equipmentBonus.maxHp || 0)),
      critChance: Math.min(0.5, 0.12 + (equipmentBonus.critChance || 0)),
      critMultiplier: Math.max(1.6, 1.6 + (equipmentBonus.critMultiplier || 0)),
      physicalPower: equipmentBonus.physicalPower || 0,
      magicPower: equipmentBonus.magicPower || 0,
      attackMin: Math.round(v.attack.damage[0] * damageScale + (equipmentBonus.attackMin || 0)),
      attackMax: Math.round(v.attack.damage[1] * damageScale + (equipmentBonus.attackMax || 0)),
      abilityMin: Math.round(v.ability.damage[0] * damageScale + (equipmentBonus.abilityMin || 0)),
      abilityMax: Math.round(v.ability.damage[1] * damageScale + (equipmentBonus.abilityMax || 0)),
      armorReduction,
      armorPercent: Math.round(armorReduction * 100),
      damageMultiplier: 1 - armorReduction,
      speed: Number((v.speed * speedScale + (equipmentBonus.speed || 0)).toFixed(2)),
      attackCooldown: Number(Math.max(0.15, v.attack.cooldown * attackSpeedScale - (equipmentBonus.attackSpeed || 0)).toFixed(2)),
      abilityCooldown: Number((v.ability.cooldown * abilityCooldownScale).toFixed(2)),
      attackRange: v.attack.range ?? null,
    };
  }

  getEquipmentBonus(itemId) {
    const item = this.data.equipment && itemId ? itemId : null;
    const def = getItem(item);
    return def?.stats || {};
  }

  equip(itemId) {
    const def = getItem(itemId);
    if (!def?.equipment?.slot) return { ok: false, reason: 'not_equipment' };
    if (def.equipment.vocations && !def.equipment.vocations.includes(this.vocation)) return { ok: false, reason: 'wrong_vocation' };
    const slot = def.equipment.slot;
    const previous = this.data.equipment[slot] || null;
    const removed = this.removeItem(itemId, 1);
    if (!removed) return { ok: false, reason: 'missing' };
    this.data.equipment[slot] = itemId;
    if (previous) this.addItem(previous, 1, getItem(previous)?.maxStack || 1);
    this.save();
    return { ok: true, slot, previous };
  }

  unequip(slot) {
    if (!EQUIPMENT_SLOTS.includes(slot)) return { ok: false };
    const itemId = this.data.equipment[slot];
    if (!itemId) return { ok: false };
    const def = getItem(itemId);
    const result = this.addItem(itemId, 1, def?.maxStack || 1);
    if (!result.added) return { ok: false, reason: 'inventory_full' };
    delete this.data.equipment[slot];
    this.save();
    return { ok: true, itemId };
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

  spendGold(amount) {
    const cost = Math.max(0, Math.floor(amount || 0));
    if (!cost) return { ok: true, spent: 0, remaining: this.data.gold };
    if (this.data.gold < cost) {
      return { ok: false, reason: 'insufficient_gold', cost, available: this.data.gold };
    }
    this.data.gold -= cost;
    this.save();
    return { ok: true, spent: cost, remaining: this.data.gold };
  }

  loseXP(percent = 0.1) {
    const rate = Math.max(0, Math.min(1, Number(percent) || 0));
    const beforeXP = this.data.xp;
    const beforeLevel = this.level;
    const lost = Math.min(beforeXP, Math.floor(beforeXP * rate));
    this.data.xp = Math.max(0, beforeXP - lost);
    while (this.data.level > 1 && this.data.xp < this.levelStartXP) this.data.level--;
    this.save();
    return { lost, oldLevel: beforeLevel, level: this.level };
  }

  createDeathDrop(pos = { x: 0, z: 0 }) {
    const items = this.data.inventory.map((item) => ({ id: item.id, qty: item.qty }));
    const gold = this.data.gold;
    if (!items.length && !gold) return null;

    const drop = {
      id: 'death-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      gold,
      x: Number(pos?.x) || 0,
      z: Number(pos?.z) || 0,
      items,
    };
    this.data.inventory = [];
    this.data.gold = 0;
    this.data.deathDrops.push(drop);
    this.save();
    return drop;
  }

  get deathDrops() {
    return this.data.deathDrops;
  }

  getProgression(areaId) {
    const saved = this.data.progression?.[areaId];
    if (!saved || typeof saved !== 'object') return null;
    return {
      index: Math.max(0, Math.floor(saved.index || 0)),
      counters: saved.counters && typeof saved.counters === 'object' ? { ...saved.counters } : {},
    };
  }

  saveProgression(areaId, index, counters = {}) {
    if (!areaId) return;
    this.data.progression[areaId] = {
      index: Math.max(0, Math.floor(index || 0)),
      counters: { ...counters },
    };
    this.save();
  }

  claimDeathDrop(dropId) {
    const index = this.data.deathDrops.findIndex((drop) => drop.id === dropId);
    if (index < 0) return { ok: false, reason: 'missing' };
    const drop = this.data.deathDrops[index];
    const remaining = [];
    let restoredItems = 0;

    for (const item of drop.items) {
      const def = getItem(item.id);
      const result = this.addItem(item.id, item.qty, def?.maxStack ?? 99);
      restoredItems += result.added;
      if (result.remaining > 0) remaining.push({ id: item.id, qty: result.remaining });
    }

    if (remaining.length) {
      drop.items = remaining;
      this.save();
      return { ok: false, reason: 'inventory_full', restoredGold: 0, restoredItems };
    }

    this.data.gold += drop.gold;
    const restoredGold = drop.gold;
    this.data.deathDrops.splice(index, 1);
    this.save();
    return { ok: true, restoredGold, restoredItems };
  }

  get inventory {
    return this.data.inventory;
  }

  get inventorySlots() {
    return this.data.inventory.length;
  }

  addItem(itemId, amount = 1, maxStack = 99, maxSlots = 24) {
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

    if (remaining && this.data.inventory.length < maxSlots) {
      const add = Math.min(maxStack, remaining);
      this.data.inventory.push({ id: itemId, qty: add });
      remaining -= add;
    }

    const added = qty - remaining;
    if (added) this.save();
    return { added, remaining };
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
