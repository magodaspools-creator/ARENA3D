// src/minimap.js — ARENA3D
// Miniatura orgânica do mundo: o mapa-base é construído uma vez em canvas
// offscreen de baixa resolução. Durante o jogo, render() apenas desloca essa
// textura ao redor do jogador e desenha os overlays dinâmicos.
//
// A geometria continua vindo da área ativa (zones/obstacles/POIs), mas a
// apresentação evita a aparência de "grade": terreno texturizado, paredes
// com paths arredondados e pequenos obstáculos agrupados em blobs.

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
    this.ctx.imageSmoothingEnabled = true;

    // Canvas-base deliberadamente reduzido: ele é uma miniatura do mundo,
    // não uma cópia 1:1 da cena 3D.
    this.mapRes = 384;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.mapRes;
    this.mapCanvas.height = this.mapRes;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapCtx.imageSmoothingEnabled = true;

    this.bounds = null;
    this.built = false;
    this.buildKey = '';
    this.player = { x: 0, z: 0, rot: 0 };
    this.entities = [];
    this.dirty = true;

    if (!opts.canvas) this._style();
  }

  _makeGroundMinimapTexture(w, h) {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.createImageData(w, h);
    const data = image.data;
    const scale = 40;

    const hash = (x, z) => {
      const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    const noise2 = (x, z) => {
      const xi = Math.floor(x), zi = Math.floor(z);
      const xf = x - xi, zf = z - zi;
      const u = xf * xf * (3 - 2 * xf);
      const v = zf * zf * (3 - 2 * zf);
      const a = hash(xi, zi);
      const b = hash(xi + 1, zi);
      const c = hash(xi, zi + 1);
      const d = hash(xi + 1, zi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };

    const fbm = (x, z) =>
      noise2(x, z) * 0.6 +
      noise2(x * 2.1, z * 2.1) * 0.3 +
      noise2(x * 4.3, z * 4.3) * 0.1;

    const base = [0x2a, 0x3e, 0x26];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm(x / scale, y / scale);
        const modulation = (n - 0.5) * 0.24;
        const i = (y * w + x) * 4;
        data[i] = Math.max(0, Math.min(255, Math.round(base[0] * (1 + modulation))));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(base[1] * (1 + modulation))));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(base[2] * (1 + modulation))));
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
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
      background: '#0b100d',
      ...pos,
    });
    document.body.appendChild(this.canvas);
  }

  _insideBounds(o, bounds) {
    if (Array.isArray(o)) {
      if (o.length && Array.isArray(o[0])) {
        return o.some(([x, z]) =>
          x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
        );
      }
      const [minX, maxX, minZ, maxZ] = o;
      return maxX >= bounds.minX && minX <= bounds.maxX &&
        maxZ >= bounds.minZ && minZ <= bounds.maxZ;
    }
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

  _zonePath(c, zone, wx, wz, S, append = false) {
    // Backward-compatible path builder: callers may still pass either
    // [minX, maxX, minZ, maxZ] boxes or [[x, z], ...] polygons.
    if (zone?.type === 'circle') {
      if (!append) c.beginPath();
      c.arc(wx(zone.x), wz(zone.z), zone.r * S, 0, Math.PI * 2);
      return true;
    }

    const points = zone?.type === 'polygon'
      ? (zone.points || [])
      : (Array.isArray(zone) && Array.isArray(zone[0]) ? zone : null);

    if (points) {
      if (points.length < 3) return false;
      if (!append) c.beginPath();
      points.forEach(([x, z], i) => i ? c.lineTo(wx(x), wz(z)) : c.moveTo(wx(x), wz(z)));
      c.closePath();
      return true;
    }

    const [minX, maxX, minZ, maxZ] = Array.isArray(zone)
      ? zone
      : [zone?.minX, zone?.maxX, zone?.minZ, zone?.maxZ];

    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return false;

    const x = wx(minX);
    const y = wz(minZ);
    const w = (maxX - minX) * S;
    const h = (maxZ - minZ) * S;
    const r = Math.min(7, Math.max(2, Math.min(w, h) * 0.18));

    if (!append) c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    return true;
  }

  _drawTerrain(c, zones, wx, wz, S, W) {
    // The surface gets a procedural moss/earth texture. The texture is
    // generated once per Minimap instance and then reused by drawImage.
    if (!this.groundMinimapTexture || this.groundMinimapTexture.width !== W || this.groundMinimapTexture.height !== W) {
      this.groundMinimapTexture = this._makeGroundMinimapTexture(W, W);
    }

    c.fillStyle = '#18261b';
    c.fillRect(0, 0, W, W);
    c.drawImage(this.groundMinimapTexture, 0, 0, W, W);

    c.beginPath();
    let validZones = 0;
    for (const zone of zones) {
      if (!zone || !this._insideBounds(zone, this.bounds)) continue;
      if (this._zonePath(c, zone, wx, wz, S, true)) validZones++;
    }

    if (!validZones) return;

    // Surface zones softly tint the procedural ground instead of replacing it.
    c.save();
    c.globalAlpha = 0.35;
    c.fillStyle = '#3a5540';
    c.fill();
    c.globalAlpha = 1;

    // Subtle organic outlines: enough to separate terrain regions without
    // recreating the old rectangular grid.
    c.save();
    c.strokeStyle = 'rgba(90,120,85,0.3)';
    c.lineWidth = Math.max(0.8, S * 0.07);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const zone of zones) {
      if (!zone || !this._insideBounds(zone, this.bounds)) continue;
      this._zonePath(c, zone, wx, wz, S, false);
      c.stroke();
    }
    c.restore();
  }

  _drawWallPath(c, obstacle, wx, wz, S) {
    if (!obstacle.enabled) return;

    const minX = obstacle.minX;
    const maxX = obstacle.maxX;
    const minZ = obstacle.minZ;
    const maxZ = obstacle.maxZ;

    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return;

    const x = wx(minX);
    const y = wz(minZ);
    const w = Math.max(1, (maxX - minX) * S);
    const h = Math.max(1, (maxZ - minZ) * S);
    const r = Math.min(7, Math.max(2, Math.min(w, h) * 0.28));

    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();

    c.fillStyle = 'rgba(20,28,22,.78)';
    c.fill();
    c.strokeStyle = 'rgba(101,119,92,.54)';
    c.lineWidth = Math.max(1.1, S * 0.11);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke();
  }

  _drawObstacleBlobs(c, obstacles, wx, wz, S) {
    const circles = [];
    const regular = [];

    for (const obstacle of obstacles) {
      if (!obstacle?.enabled || !this._insideBounds(obstacle, this.bounds)) continue;
      if (obstacle.type === 'circle' && Number.isFinite(obstacle.x) && Number.isFinite(obstacle.z)) {
        circles.push({
          x: obstacle.x,
          z: obstacle.z,
          r: Math.max(0.35, Number(obstacle.r) || 0.7),
        });
      } else {
        regular.push(obstacle);
      }
    }

    // Retângulos grandes continuam sendo paredes, mas com path arredondado.
    for (const obstacle of regular) {
      this._drawWallPath(c, obstacle, wx, wz, S);
    }

    // Pequenas pedras/árvores próximas viram manchas únicas, reduzindo o
    // aspecto de "pontinhos de grade".
    const used = new Array(circles.length).fill(false);
    for (let i = 0; i < circles.length; i++) {
      if (used[i]) continue;

      const group = [circles[i]];
      used[i] = true;

      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < circles.length; j++) {
          if (used[j]) continue;
          for (const g of group) {
            const reach = Math.max(2.2, (g.r + circles[j].r) * 2.6);
            if (Math.hypot(g.x - circles[j].x, g.z - circles[j].z) <= reach) {
              group.push(circles[j]);
              used[j] = true;
              changed = true;
              break;
            }
          }
        }
      }

      let cx = 0, cz = 0, area = 0, maxR = 0;
      for (const g of group) {
        const a = Math.PI * g.r * g.r;
        cx += g.x * a;
        cz += g.z * a;
        area += a;
        maxR = Math.max(maxR, g.r);
      }
      cx /= Math.max(area, 0.001);
      cz /= Math.max(area, 0.001);

      const blobR = Math.min(4.8, Math.max(maxR * 1.25, Math.sqrt(area / Math.PI) * 1.08));

      c.save();
      c.shadowColor = 'rgba(8,16,10,.65)';
      c.shadowBlur = Math.max(1.5, S * 0.45);
      c.fillStyle = 'rgba(22,35,25,.82)';
      c.beginPath();
      c.arc(wx(cx), wz(cz), blobR * S, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;

      c.strokeStyle = 'rgba(90,112,82,.42)';
      c.lineWidth = Math.max(1, S * 0.1);
      c.beginPath();
      c.arc(wx(cx), wz(cz), blobR * S, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
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
    this._drawTerrain(c, zones, wx, wz, S, W);
    this._drawObstacleBlobs(c, obstacles, wx, wz, S);

    for (const p of pois) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const x = wx(p.x), z = wz(p.z);
      if (p.type === 'pz') {
        c.save();
        c.strokeStyle = 'rgba(91,128,113,.58)';
        c.lineWidth = Math.max(1, S * 0.12);
        c.setLineDash([Math.max(3, S * 0.42), Math.max(3, S * 0.6)]);
        c.beginPath();
        c.arc(x, z, (p.r ?? 1) * S, 0, Math.PI * 2);
        c.stroke();
        c.restore();
        continue;
      }
      c.save();
      c.shadowColor = 'rgba(0,0,0,.45)';
      c.shadowBlur = 3;
      c.fillStyle = this.poiColor(p.type);
      c.beginPath();
      c.arc(x, z, Math.min(9, Math.max(2, (p.r ?? 1.2) * S)), 0, Math.PI * 2);
      c.fill();
      c.restore();
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
    return ({ npc: '#74c69d', mine: '#d49a4a', arena: '#d45c5c', portal: '#66a9bd', pz: '#6a917f', grave: '#9a8bb8' })[type] || '#fff';
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
    const radius = this.size * 0.5 - 1;

    // A máscara circular é aplicada antes de qualquer desenho do frame.
    // Nada consegue escapar da área do minimapa.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0b100d';
    ctx.fillRect(0, 0, this.size, this.size);

    const pxPerUnit = this.size / this.viewWorld;
    const centerX = (this.bounds.minX + this.bounds.maxX) * 0.5;
    const centerZ = (this.bounds.minZ + this.bounds.maxZ) * 0.5;
    const dx = (this.player.x - centerX) * pxPerUnit;
    const dz = (this.player.z - centerZ) * pxPerUnit;
    const drawSize = this._span * pxPerUnit;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this.mapCanvas,
      cx - dx - drawSize * 0.5,
      cy - dz - drawSize * 0.5,
      drawSize,
      drawSize
    );

    // Mobs/NPCs continuam dinâmicos e ficam sempre por cima da miniatura.
    for (const e of this.entities) {
      const ex = cx + (e.x - this.player.x) * pxPerUnit;
      const ez = cy + (e.z - this.player.z) * pxPerUnit;
      if (ex < -6 || ez < -6 || ex > this.size + 6 || ez > this.size + 6) continue;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.7)';
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.arc(ex, ez, e.radius ?? 3, 0, Math.PI * 2);
      ctx.fillStyle = this.entColor(e.type);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.stroke();
      ctx.restore();
    }

    // Jogador: seta orientada para a direção atual.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.player.rot);
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5.5, 6);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(5.5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Borda circular com profundidade: sombra externa + aro discreto.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.72)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,12,9,.95)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(202,215,193,.20)';
    ctx.stroke();
    ctx.restore();

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
