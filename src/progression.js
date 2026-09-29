// Linear stage list per area. Stages only move forward; each one sets the
// objective text in the HUD. Areas 2..5 can reuse this with their own list.
export class Progression {
  constructor(game, stages) {
    this.game = game;
    this.stages = stages;
    this.index = 0;
    this.counters = {};
    this.listeners = [];
  }
  get id() { return this.stages[this.index].id; }
  indexOf(id) { return this.stages.findIndex((s) => s.id === id); }
  reached(id) { return this.index >= this.indexOf(id); }
  on(fn) { this.listeners.push(fn); }
  advance(id) {
    const i = this.indexOf(id);
    if (i <= this.index) return false;
    this.index = i;
    this.apply();
    for (const fn of this.listeners) fn(id);
    return true;
  }
  setCounter(key, value) { this.counters[key] = value; this.apply(false); }
  apply(pulse = true) {
    const s = this.stages[this.index];
    const text = typeof s.text === 'function' ? s.text(this.counters) : s.text;
    if (pulse || text !== this.lastText) this.game.ui.setObjective(text, s.hint);
    this.lastText = text;
  }
}
