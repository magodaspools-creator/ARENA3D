import * as THREE from 'three';

// Elevated MMORPG-style follow camera. Right-drag rotates, wheel zooms.
// 'preview' mode is the close-up used on the vocation select screen.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.3;
    this.distance = 6;
    this.zoom = 17;
    this.mode = 'preview';
    this.target = new THREE.Vector3();
    this.shakeAmt = 0;
    this.focus = null;
    this.focusT = 0;
    this._v = new THREE.Vector3();
    this._r = new THREE.Vector3();

  }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out = new THREE.Vector3()) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  shake(a) { this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a)); }
  cinematic(pos, duration) { this.focus = pos.clone(); this.focusT = duration; }
  snap(pos) { this.target.copy(pos); }

  update(dt, followPos, input) {
    let goalPitch, goalDist;
    const desired = this._v;
    if (this.mode === 'preview') {
      goalPitch = 0.22; goalDist = 5.6;
      // shift the look target left so the character sits right of the menu
      desired.copy(followPos).addScaledVector(this.right(this._r), -1.7).setY(followPos.y + 1.15);
    } else {
      if (input) {
        this.yaw -= input.dragDX * 0.006;
        this.zoom = THREE.MathUtils.clamp(this.zoom + input.wheel * 0.012, 9, 27);
      }
      goalPitch = 0.93; goalDist = this.zoom;
      desired.copy(this.focusT > 0 ? this.focus : followPos).setY(1);
    }
    this.focusT -= dt;
    const k = 1 - Math.exp(-dt * (this.focusT > 0 ? 2.5 : 7));
    this.target.lerp(desired, k);
    const kz = 1 - Math.exp(-dt * 3);
    this.pitch += (goalPitch - this.pitch) * kz;
    this.distance += (goalDist - this.distance) * kz;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const c = this.camera;
    c.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + sp * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.35;
      c.position.x += (Math.random() - 0.5) * s;
      c.position.y += (Math.random() - 0.5) * s;
      c.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.exp(-dt * 7);
    }
    c.lookAt(this.target);
  }
}
