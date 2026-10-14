import * as THREE from 'three';
import { createHumanoid, createWeapon, glow, mesh, HumanoidAnimator } from './models.js?v=npc-blacksmith-role-20261013e';

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
    if (look.npcRole === 'blacksmith') {
      const hammer = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 6),
        new THREE.MeshStandardMaterial({ color: 0x755035, roughness: 0.95 }));
      handle.position.y = 0.08;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.17, 0.19),
        new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.55, roughness: 0.6 }));
      head.position.y = 0.38;
      hammer.add(handle, head);
      hammer.rotation.z = -0.25;
      this.rig.handR.add(hammer);
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
    this.anim.update(dt, 0);
    // Brom keeps working the glowing blade until the first conversation.
    // The animator resets arm transforms each frame, so apply the hammering
    // pose afterward; once spoken to, leave him at rest permanently.
    if (this.isBlacksmith && !this.hasSpoken) {
      // A readable forging cycle: raise the hammer, accelerate into the strike,
      // then recoil slightly. Keep the feet planted and the torso working over
      // the anvil instead of swinging only the forearm on an upright body.
      const phase = (this.game.time * 2.65) % (Math.PI * 2);
      const cycle = phase / (Math.PI * 2);
      const raise = cycle < 0.34 ? Math.sin((cycle / 0.34) * Math.PI * 0.5) : 1;
      const impact = cycle >= 0.34 && cycle < 0.53
        ? Math.sin(((cycle - 0.34) / 0.19) * Math.PI * 0.5)
        : cycle >= 0.53 && cycle < 0.68
          ? Math.cos(((cycle - 0.53) / 0.15) * Math.PI * 0.5)
          : 0;
      const strike = cycle >= 0.34 && cycle < 0.53 ? impact : 0;
      const recovery = cycle >= 0.53 && cycle < 0.68 ? impact : 0;

      this.rig.body.position.y = -0.035 - strike * 0.045;
      this.rig.torso.rotation.x = 0.16 + strike * 0.24 - recovery * 0.06;
      this.rig.head.rotation.x = 0.12 + strike * 0.1;
      this.rig.armR.rotation.x = -0.05 - raise * 1.12 + strike * 0.78 + recovery * 0.12;
      this.rig.armR.rotation.z = -0.34 - raise * 0.1 + strike * 0.12;
      // The free hand steadies the hot blade while the hammer hand swings.
      this.rig.armL.rotation.x = -0.62 + strike * 0.12;
      this.rig.armL.rotation.z = 0.12;
      this.rig.legL.rotation.x = -0.06;
      this.rig.legR.rotation.x = -0.06;
    } else if (this.isBlacksmith) {
      // Restore a relaxed stance after the first conversation.
      this.rig.body.position.y = 0;
      this.rig.torso.rotation.x = 0;
      this.rig.head.rotation.x = 0;
      this.rig.armR.rotation.set(0, 0, 0);
      this.rig.armL.rotation.set(0, 0, 0);
      this.rig.legL.rotation.x = 0;
      this.rig.legR.rotation.x = 0;
    }
    this.marker.rotation.y += dt * 2;
    this.marker.position.y = 2.75 + Math.sin(this.game.time * 2.5) * 0.08;
    this.light.intensity = 6 + Math.sin(this.game.time * 9) * 0.6;
  }
}
