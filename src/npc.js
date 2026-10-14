import * as THREE from 'three';
import { createHumanoid, createWeapon, glow, mesh, HumanoidAnimator } from './models.js?v=npc-blacksmith-role-20261013e';

const BLACKSMITH_SPRITES = {
  work: './uploads/03_[Work_Loop].png',
  idle: './uploads/01_[Idle].png',
  dialog: './uploads/11_[Dialog_I[Stand]].png',
};

const tmp = new THREE.Vector3();

/** Speech bubble conversation anchored in the world, typed out letter by letter. */
export class Dialogue {
  constructor(game) {
    this.game = game;
    this.active = null;
  }
  open(name, lines, anchor, onDone) {
    this.active = { name, lines, anchor, onDone, i: 0, chars: 0, frame: this.game.frame };
    this.game.interaction.busy = true;
  }
  close(finished) {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.game.ui.hideBubble();
    this.game.interaction.busy = false;
    if (finished && a.onDone) a.onDone();
  }
  update(dt) {
    const a = this.active;
    if (!a) return;
    const { player, input, ui } = this.game;
    if (!player || player.dead || Math.hypot(player.pos.x - a.anchor.x, player.pos.z - a.anchor.z) > 7) return this.close(false);
    const line = a.lines[a.i];
    a.chars = Math.min(line.length, a.chars + dt * 55);
    if (input.wasPressed('KeyE') && a.frame !== this.game.frame) {
      if (a.chars < line.length) a.chars = line.length;
      else if (++a.i >= a.lines.length) return this.close(true);
      else a.chars = 0;
    }
    const last = a.i === a.lines.length - 1;
    ui.showBubble(a.name, a.lines[a.i].slice(0, Math.floor(a.chars)), tmp.copy(a.anchor),
      `${a.i + 1}/${a.lines.length}  ·  [E] ${last ? 'encerrar' : 'continuar'}`);
  }
}

export class NPC {
  /** dialogue(): returns { lines, onDone } for the current quest state */
  constructor(game, { name, x, z, facing = 0, look, dialogue, service = null }) {
    this.game = game;
    this.name = name;
    this.dialogue = dialogue;
    this.service = service;
    this.hasSpoken = false;
    this.isBlacksmith = look.npcRole === 'blacksmith';
    this.rig = createHumanoid({ ...look, npcStyle: true });
    if (this.isBlacksmith) {
      // Use the artist's original pixel-art animation strips instead of the
      // procedural humanoid/hammer. Keep the rig only as the interaction root.
      this.rig.root.traverse((object) => {
        if (object.isMesh || object.isSkinnedMesh) object.visible = false;
      });
      this.blacksmithSprite = new THREE.Mesh(
        new THREE.PlaneGeometry(1.65, 1.65),
        new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: false })
      );
      this.blacksmithSprite.position.set(0, 0.83, 0);
      this.blacksmithSprite.renderOrder = 2;
      this.rig.root.add(this.blacksmithSprite);
      this.blacksmithTextures = {};
      this.blacksmithAnimation = 'work';
      this.blacksmithFrameElapsed = 0;
      const loader = new THREE.TextureLoader();
      for (const [state, url] of Object.entries(BLACKSMITH_SPRITES)) {
        loader.load(url, (texture) => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.userData = { frameWidth: 64, frameCount: Math.max(1, Math.round(texture.image.width / 64)) };
          texture.repeat.set(1 / texture.userData.frameCount, 1);
          this.blacksmithTextures[state] = texture;
          if (state === this.blacksmithAnimation) this.blacksmithSprite.material.map = texture;
          this.blacksmithSprite.material.needsUpdate = true;
        });
      }
    } else {
      this.rig.handR.add(createWeapon('lanternStaff'));
    }
    this.root = this.rig.root;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = facing;
    this.baseFacing = facing;
    this.pos = this.root.position;
    this.anim = new HumanoidAnimator(this.rig);
    game.scene.add(this.root);
    game.collision.addCircle(x, z, 0.6);

    // floating quest marker
    this.marker = mesh(new THREE.OctahedronGeometry(0.2), glow(0xffc34a, 0.85), 0, 2.75, 0);
    this.marker.scale.y = 1.6;
    this.marker.castShadow = false;
    this.root.add(this.marker);
    this.light = new THREE.PointLight(0xffb45a, 2.8, 6, 1.6);
    this.light.position.set(0.3, 2, 0.3);
    this.root.add(this.light);

    this.head = new THREE.Vector3(x, 2.85, z);
    game.interaction.add({
      pos: this.pos, radius: 3.2, height: 2.6, label: `Falar com ${name}`,
      onInteract: () => this.talk(),
    });
  }
  setMarker(color) {
    this.marker.visible = !!color;
    if (color) this.marker.material = glow(color, 0.85);
  }
  talk() {
    const d = this.dialogue();
    if (this.hasSpoken && d.repeatLines) d.lines = d.repeatLines;
    this.hasSpoken = true;
    if (this.isBlacksmith) this.blacksmithAnimation = 'dialog';
    const onDone = () => {
      if (d.onDone) d.onDone();
      if (this.service) this.service();
    };
    this.game.dialogue.open(this.name, d.lines, this.head, onDone);
    this.anim.attack('cast', 0.8);
  }
  update(dt) {
    const p = this.game.player;
    let want = this.baseFacing;
    // While working, Brom keeps his attention on the anvil; he only turns to
    // face the player after the player starts a conversation.
    if (!(this.isBlacksmith && !this.hasSpoken) && p && this.pos.distanceTo(p.pos) < 7) {
      want = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    }
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 4);
    if (!this.isBlacksmith) {
      this.anim.update(dt, 0);
    } else {
      // Advance one frame of the real sprite strip; no per-frame allocations.
      const state = this.hasSpoken ? 'dialog' : 'work';
      if (this.blacksmithAnimation !== state) {
        this.blacksmithAnimation = state;
        this.blacksmithFrameElapsed = 0;
        const texture = this.blacksmithTextures[state];
        if (texture) this.blacksmithSprite.material.map = texture;
        this.blacksmithSprite.material.needsUpdate = true;
      }
      const texture = this.blacksmithTextures[state];
      if (texture?.image?.width) {
        const frames = texture.userData.frameCount;
        this.blacksmithFrameElapsed += dt;
        if (this.blacksmithFrameElapsed >= 0.12) {
          this.blacksmithFrameElapsed = 0;
          const frame = Math.floor(this.game.time / 0.12) % frames;
          texture.offset.x = frame / frames;
        }
      }
    }
    this.marker.rotation.y += dt * 2;
    this.marker.position.y = 2.75 + Math.sin(this.game.time * 2.5) * 0.08;
    this.light.intensity = 6 + Math.sin(this.game.time * 9) * 0.6;
  }
}
