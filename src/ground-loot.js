import * as THREE from 'three';
import { getItem } from './items.js';

const COLORS = {
  equipamento: 0xe8c77a,
  consumível: 0x65d88a,
  material: 0x8bb6ff,
  quest: 0xd58cff,
};

export class GroundLoot {
  constructor(game, itemId, amount, pos) {
    this.game = game;
    this.itemId = itemId;
    this.amount = amount;
    this.item = getItem(itemId);
    this.pos = new THREE.Vector3(pos.x, 0.08, pos.z);
    this.age = 0;
    this.dead = false;
    this.phase = Math.random() * Math.PI * 2;

    const color = COLORS[this.item?.category] ?? 0xe8c77a;
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);

    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.35,
      metalness: 0.1,
    });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 20), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    this.ring = ring;

    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), orbMat);
    orb.position.y = 0.32;
    orb.castShadow = true;
    this.orb = orb;

    this.root.add(ring, orb);
    game.scene.add(this.root);

    this.anchor = game.ui.anchor('loot-drop');
    this.label = this.item?.name ?? itemId;
  }

  update(dt) {
    if (this.dead) return;

    this.age += dt;
    this.root.position.y = this.pos.y + Math.sin(this.age * 3 + this.phase) * 0.07;
    this.ring.rotation.z += dt * 1.8;
    this.orb.rotation.x += dt * 1.6;
    this.orb.rotation.y += dt * 2.2;

    const player = this.game.player;
    if (!player || player.dead || this.game.state !== 'play') {
      this.game.ui.hideAnchor(this.anchor);
      return;
    }

    const distance = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (distance <= 1.7) {
      const result = this.game.collectGroundLoot(this);
      if (result) return;
    }

    if (distance <= 5.5) {
      this.game.ui.showAnchor(
        this.anchor,
        this.root.position.clone().setY(0.95),
        '<b>' + this.label + (this.amount > 1 ? ' x' + this.amount : '') + '</b>'
      );
    } else {
      this.game.ui.hideAnchor(this.anchor);
    }
  }

  collect() {
    if (this.dead) return false;
    const result = this.game.character?.addItem(this.itemId, this.amount, this.item?.maxStack ?? 99);
    if (!result?.added) return false;

    this.dead = true;
    this.game.ui.removeAnchor(this.anchor);

    const text = '+' + result.added + ' ' + this.label;
    this.game.ui.toast(text, 2.5);
    this.game.ui.setInventory(this.game.character);

    const color = COLORS[this.item?.category] ?? 0xe8c77a;
    this.game.fx.emit(
      this.root.position.clone().setY(0.55),
      { count: 14, color, speed: 2.4, up: 1.8, life: 0.65, size: 0.18, drag: 1.2 }
    );

    this.game.scene.remove(this.root);
    return result.remaining > 0 ? 'partial' : true;
  }
}
