// src/minimap.js — ARENA3D
// Fonte única do mapa: collision.zones + collision.obstacles.
// O mapa-base é desenhado uma vez em um canvas offscreen; durante o jogo,
// render() apenas recorta a janela ao redor do jogador com drawImage().

export class Minimap {
  constructor(opts = {}) {
    this.size = opts.size ?? 220;
    this.viewWorld = opts.viewWorld ?? 42;
    this.margin = opts.margin ?? 18;
    this.position = opts.position ?? 'bottom-right';
    this.canvas = opts.canvas ?? document.createElement('canvas');

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.mapRes = 512;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.mapRes;
    this.mapCanvas.height = this.mapRes;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapCtx.imageSmoothingEnabled = false;

    this.bounds = null;
    this.built = false;
    this.buildKey = '';
    this.player = { x: 0, z: 0, rot: 0 };
    this.entities = [];
    this.dirty = true;

    if (!opts.canvas) this._style();
  }

  _style() {
    const pos = {
      'top-left': { top: this.margin + 'px', left: this.margin + 'px' },
      'top-right': { top: this.margin + 'px', right: this.margin + 'px' },
      'bottom-left': { bottom: this.margin + 'px', left: this.margin + 'px' },
      'bottom-right': { bottom: this.margin + 'px', right: this.margin + 'px' },
    }[this.position];

    Object.assign(this.canvas.style, {
      position: 'fixed',
      zIndex: 9999,
      pointerEvents: 'none',
      borderRadius: '50%',
      border: '3px solid rgba(20,22,30,.9)',
      boxShadow: '0 6px 18px rgba(0,0,0,.45), inset 0 0 0 2px rgba(255,255,255,.06)',
      background: '#0e1018',
      ...pos,
    });
    document.body.appendChild(this.canvas);
  }

  _insideBounds(o, bounds) {
    if (o.type === 'circle') {
      return o.x + o.r >= bounds.minX && o.x - o.r <= bounds.maxX &&
        o.z + o.r >= bounds.minZ && o.z - o.r <= bounds.maxZ;
    }
    if (o.type === 'polygon') {
      return o.points?.some(([x, z]) =>
        x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
      ) || false;
    }
    return o.maxX >= bounds.minX && o.minX <= bounds.maxX &&
      o.maxZ >= bounds.minZ && o.minZ <= bounds.maxZ;
  }

  _drawZone(c, zone, wx, wz, S) {
    c.fillStyle = '#3f6b4a';
    if (zone.type === 'circle') {
      c.beginPath();
      c.arc(wx(zone.x), wz(zone.z), zone.r * S, 0, Math.PI * 2);
      c.fill();
      return;
    }
    if (zone.type === 'polygon') {
      const points = zone.points || [];
      if (points.length < 3) return;
      c.beginPath();
      points.forEach(([x, z], i) => i ? c.lineTo(wx(x), wz(z)) : c.moveTo(wx(x), wz(z)));
      c.closePath();
      c.fill();
      return;
    }
    c.fillRect(wx(zone.minX), wz(zone.minZ), (zone.maxX - zone.minX) * S, (zone.maxZ - zone.minZ) * S);
  }

  _drawObstacle(c, obstacle, wx, wz, S) {
    if (!obstacle.enabled) return;
    c.fillStyle = '#2b2f3d';
    if (obstacle.type === 'circle') {
      c.beginPath();
      c.arc(wx(obstacle.x), wz(obstacle.z), obstacle.r * S, 0, Math.PI * 2);
      c.fill();
      return;
    }
    c.fillRect(wx(obstacle.minX), wz(obstacle.minZ),
      (obstacle.maxX - obstacle.minX) * S,
      (obstacle.maxZ - obstacle.minZ) * S);
  }

  buildFromArea({ bounds, zones = [], obstacles = [], pois = [] }) {
    if (!bounds) return;

    this.bounds = { ...bounds };
    const c = this.mapCtx;
    const W = this.mapRes;
    const wSpan = Math.max(0.001, bounds.maxX - bounds.minX);
    const hSpan = Math.max(0.001, bounds.maxZ - bounds.minZ);
    const span = Math.max(wSpan, hSpan);
    const S = W / span;
    const offX = (W - wSpan * S) / 2;
    const offZ = (W - hSpan * S) / 2;
    const wx = (x) => offX + (x - bounds.minX) * S;
    const wz = (z) => offZ + (z - bounds.minZ) * S;

    c.clearRect(0, 0, W, W);
    c.fillStyle = '#12141c';
    c.fillRect(0, 0, W, W);

    for (const zone of zones) {
      if (!zone || !this._insideBounds(zone, bounds)) continue;
      this._drawZone(c, zone, wx, wz, S);
    }

    for (const obstacle of obstacles) {
      if (!obstacle || !this._insideBounds(obstacle, bounds)) continue;
      this._drawObstacle(c, obstacle, wx, wz, S);
    }

    for (const p of pois) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      c.fillStyle = this.poiColor(p.type);
      c.beginPath();
      c.arc(wx(p.x), wz(p.z), Math.min(10, Math.max(2, (p.r ?? 1.2) * S)), 0, Math.PI * 2);
      c.fill();
    }

    this._S = S;
    this._span = span;
    this._offX = offX;
    this._offZ = offZ;
    this.buildKey = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].join('|');
    this.built = true;
    this.dirty = true;
  }

  poiColor(type) {
    return ({ npc: '#5ec9a0', mine: '#c98b3a', arena: '#c94f4f', portal: '#5890a6', grave: '#8a7fa8' })[type] || '#fff';
  }

  update(player, entities = []) {
    if (!player?.pos) return;
    this.player.x = player.pos.x;
    this.player.z = player.pos.z;
    this.player.rot = player.facing ?? player.rotation ?? player.rot ?? player.root?.rotation?.y ?? 0;
    this.entities = entities;
    this.dirty = true;
  }

  render() {
    if (!this.built || !this.dirty || !this.bounds) return;

    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);

    const cx = this.size * 0.5;
    const cy = this.size * 0.5;
    const radius = Math.min(this.size, this.size) * 0.5 - 1;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0e1018';
    ctx.fillRect(0, 0, this.size, this.size);

    const pxPerUnit = this.size / this.viewWorld;
    const centerX = (this.bounds.minX + this.bounds.maxX) * 0.5;
    const centerZ = (this.bounds.minZ + this.bounds.maxZ) * 0.5;
    const dx = (this.player.x - centerX) * pxPerUnit;
    const dz = (this.player.z - centerZ) * pxPerUnit;
    const drawSize = this._span * pxPerUnit;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.mapCanvas,
      cx - dx - drawSize * 0.5,
      cy - dz - drawSize * 0.5,
      drawSize,
      drawSize
    );

    for (const e of this.entities) {
      const ex = cx + (e.x - this.player.x) * pxPerUnit;
      const ez = cy + (e.z - this.player.z) * pxPerUnit;
      if (ex < -6 || ez < -6 || ex > this.size + 6 || ez > this.size + 6) continue;

      ctx.beginPath();
      ctx.arc(ex, ez, e.radius ?? 3, 0, Math.PI * 2);
      ctx.fillStyle = this.entColor(e.type);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.player.rot);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, this.size * 0.5 - 2, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.stroke();

    this.dirty = false;
  }

  entColor(type) {
    return ({ enemy: '#ff4757', ally: '#2ed573', item: '#ffd32a', npc: '#a29bfe' })[type] || '#fff';
  }

  destroy() {
    if (!this.canvas.parentNode) return;
    this.canvas.remove();
  }
}
