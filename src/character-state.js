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

  save() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }
}
