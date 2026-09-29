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
      this.game.ui.showAnchor(this.anchor, this.root.position.clone().setY(0.95), '<b>Inventário cheio</b>');
      return;
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


export class DeathBackpack {
  constructor(game, drop) {
    this.game = game;
    this.dropId = drop.id;
    this.pos = new THREE.Vector3(drop.x, 0.05, drop.z);
    this.dead = false;
    this.age = 0;
    this.phase = Math.random() * Math.PI * 2;

    this.root = new THREE.Group();
    this.root.position.copy(this.pos);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3b2a1d,
      roughness: 0.8,
      metalness: 0.05,
      emissive: 0x140b06,
      emissiveIntensity: 0.4,
    });
    const strapMat = new THREE.MeshStandardMaterial({
      color: 0x8d6035,
      roughness: 0.75,
      metalness: 0.05,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.58, 0.36), bodyMat);
    body.position.y = 0.34;
    body.castShadow = true;

    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.42), strapMat);
    flap.position.set(0, 0.66, 0.01);
    flap.rotation.x = -0.12;
    flap.castShadow = true;

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xd3a84d, metalness: 0.7, roughness: 0.3 })
    );
    buckle.position.set(0, 0.58, -0.23);

    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.045, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0xd3a84d,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.08;

    this.root.add(body, flap, buckle, glow);
    game.scene.add(this.root);
    this.glow = glow;

    this.anchor = game.ui.anchor('loot-drop');
    this.label = 'Mochila perdida';
  }

  update(dt) {
    if (this.dead) return;
    this.age += dt;
    this.root.position.y = this.pos.y + Math.sin(this.age * 2.4 + this.phase) * 0.045;
    this.glow.rotation.z += dt * 1.4;

    const player = this.game.player;
    if (!player || player.dead || this.game.state !== 'play') {
      this.game.ui.hideAnchor(this.anchor);
      return;
    }

    const distance = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (distance <= 1.7) {
      const result = this.collect();
      if (result) return;
      this.game.ui.showAnchor(this.anchor, this.root.position.clone().setY(1.15), '<b>Inventário cheio</b>');
      return;
    }

    if (distance <= 5.5) {
      const drop = this.game.character?.deathDrops?.find((item) => item.id === this.dropId);
      const gold = drop?.gold || 0;
      const itemCount = drop?.items?.reduce((sum, item) => sum + item.qty, 0) || 0;
      this.game.ui.showAnchor(
        this.anchor,
        this.root.position.clone().setY(1.15),
        '<b>Mochila perdida</b><br><small>' + itemCount + ' item(s) · ' + gold + ' ouro</small>'
      );
    } else {
      this.game.ui.hideAnchor(this.anchor);
    }
  }

  collect() {
    if (this.dead) return false;
    const result = this.game.character?.claimDeathDrop(this.dropId);
    if (!result?.ok) return false;

    this.dead = true;
    this.game.ui.removeAnchor(this.anchor);
    this.game.ui.toast(
      'Mochila recuperada: ' + result.restoredItems + ' item(s) · +' + result.restoredGold + ' ouro',
      3.5
    );
    this.game.ui.setInventory(this.game.character);
    this.game.ui.setProgress(this.game.character);

    this.game.fx.emit(
      this.root.position.clone().setY(0.55),
      { count: 24, color: 0xd3a84d, speed: 3, up: 2.2, life: 0.75, size: 0.2, drag: 1.2 }
    );
    this.game.scene.remove(this.root);
    return true;
  }
}
