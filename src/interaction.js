import * as THREE from 'three';

// Anything the player can press E on: NPCs, braziers, rune stones...
// The nearest enabled item in range shows a world-anchored prompt.
const tmp = new THREE.Vector3();

export class Interaction {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.busy = false; // true while a dialogue owns the E key
  }
  add({ pos, radius = 2.5, height = 2.2, label, onInteract, enabled = () => true }) {
    const item = { pos, radius, height, label, onInteract, enabled };
    this.items.push(item);
    return item;
  }
  remove(item) { this.items = this.items.filter((i) => i !== item); }

  update() {
    const { player, input, ui } = this.game;
    if (this.busy || !player || player.dead || this.game.inputLocked) { ui.hidePrompt(); return; }
    let best = null, bestD = Infinity;
    for (const it of this.items) {
      if (!it.enabled()) continue;
      const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    if (!best) { ui.hidePrompt(); return; }
    ui.showPrompt(typeof best.label === 'function' ? best.label() : best.label, tmp.copy(best.pos).setY(best.height));
    if (input.wasPressed('KeyE')) best.onInteract();
  }
}
