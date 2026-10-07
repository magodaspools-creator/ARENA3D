import * as THREE from 'three';

const hash = (x, z) => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const noise = (x, z) => {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const fbm = (x, z) => {
  let sum = 0, amp = 0.5, freq = 1, total = 0;
  for (let i = 0; i < 4; i++) {
    sum += noise(x * freq, z * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / total;
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const lerp = (a, b, t) => a + (b - a) * t;

const terrainColor = (h, grain) => {
  const stops = [
    [0.00, [20, 35, 23]],
    [0.25, [35, 59, 37]],
    [0.50, [65, 79, 47]],
    [0.70, [112, 103, 60]],
    [0.84, [137, 126, 82]],
    [1.00, [116, 119, 108]],
  ];
  const value = clamp01(h + grain * 0.055);
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      lo = stops[i - 1];
      hi = stops[i];
      break;
    }
  }
  const t = (value - lo[0]) / Math.max(0.0001, hi[0] - lo[0]);
  return [
    lerp(lo[1][0], hi[1][0], t),
    lerp(lo[1][1], hi[1][1], t),
    lerp(lo[1][2], hi[1][2], t),
  ];
};

const insideZone = (x, z, zone) => {
  if (!zone) return false;
  if (zone.type === 'circle') return Math.hypot(x - zone.x, z - zone.z) <= zone.r;
  if (zone.type === 'rect') return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
  if (zone.type === 'polygon' && Array.isArray(zone.points)) {
    let inside = false;
    for (let i = 0, j = zone.points.length - 1; i < zone.points.length; j = i++) {
      const [xi, zi] = zone.points[i];
      const [xj, zj] = zone.points[j];
      const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }
  return false;
};

const insideTerrain = (x, z, zones) => {
  for (const zone of zones) if (insideZone(x, z, zone)) return true;
  return false;
};

export class WorldMap {
  constructor({ canvas, title, subtitle }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.title = title;
    this.subtitle = subtitle;
    this.data = null;
    this.opened = false;
    this.dirty = true;
    this.renderW = 1500;
    this.renderH = 900;
    this.canvas.width = this.renderW;
    this.canvas.height = this.renderH;
  }

  setData(data) {
    this.data = data;
    this.dirty = true;
    if (this.opened) this.render();
  }

  open() {
    this.opened = true;
    this.dirty = true;
    this.render();
  }

  close() {
    this.opened = false;
  }

  resize() {
    this.dirty = true;
    if (this.opened) this.render();
  }

  _projectFactory(bounds, pad = 54) {
    const worldW = Math.max(0.001, bounds.maxX - bounds.minX);
    const worldH = Math.max(0.001, bounds.maxZ - bounds.minZ);
    const usableW = this.renderW - pad * 2;
    const usableH = this.renderH - pad * 2;
    const scale = Math.min(usableW / worldW, usableH / worldH);
    const drawW = worldW * scale;
    const drawH = worldH * scale;
    const ox = (this.renderW - drawW) * 0.5;
    const oy = (this.renderH - drawH) * 0.5;
    return {
      scale,
      x: (wx) => ox + (wx - bounds.minX) * scale,
      y: (wz) => oy + (wz - bounds.minZ) * scale,
      ox, oy, drawW, drawH,
    };
  }

  _drawTerrain(ctx, data, p) {
    const bounds = data.bounds;
    const cols = Math.max(220, Math.min(520, Math.round(p.drawW / 2.2)));
    const rows = Math.max(170, Math.min(360, Math.round(p.drawH / 2.2)));
    const cellW = p.drawW / cols;
    const cellH = p.drawH / rows;
    const image = ctx.createImageData(cols, rows);
    const pixels = image.data;

    for (let py = 0; py < rows; py++) {
      const z = bounds.minZ + ((py + 0.5) / rows) * (bounds.maxZ - bounds.minZ);
      for (let px = 0; px < cols; px++) {
        const x = bounds.minX + ((px + 0.5) / cols) * (bounds.maxX - bounds.minX);
        let hits = 0;
        for (const [sx, sz] of [[-.22,-.22],[.22,-.22],[-.22,.22],[.22,.22]]) {
          const sampleX = x + sx * (bounds.maxX - bounds.minX) / cols;
          const sampleZ = z + sz * (bounds.maxZ - bounds.minZ) / rows;
          if (insideTerrain(sampleX, sampleZ, data.zones)) hits++;
        }

        const i = (py * cols + px) * 4;
        if (!hits) {
          pixels[i] = 7;
          pixels[i + 1] = 11;
          pixels[i + 2] = 9;
          pixels[i + 3] = 255;
          continue;
        }

        const broad = fbm(x / 25, z / 25);
        const fine = noise(x / 4.5, z / 4.5) - 0.5;
        const c = terrainColor(broad + fine * 0.14, fine);
        pixels[i] = c[0];
        pixels[i + 1] = c[1];
        pixels[i + 2] = c[2];
        pixels[i + 3] = Math.round(255 * (0.82 + hits * 0.045));
      }
    }

    const terrain = document.createElement('canvas');
    terrain.width = cols;
    terrain.height = rows;
    terrain.getContext('2d').putImageData(image, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(terrain, p.ox, p.oy, p.drawW, p.drawH);
    ctx.restore();

    // Subtle contour bands. They follow the same continuous field and never
    // create artificial zone borders.
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.ox, p.oy, p.drawW, p.drawH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(12,25,15,.20)';
    ctx.lineWidth = 1;
    for (let band = 0.18; band < 1; band += 0.12) {
      const steps = 170;
      ctx.beginPath();
      let drawing = false;
      for (let i = 0; i <= steps; i++) {
        const wx = bounds.minX + (i / steps) * (bounds.maxX - bounds.minX);
        for (let j = 0; j < 8; j++) {
          const wz = bounds.minZ + ((j + 0.5) / 8) * (bounds.maxZ - bounds.minZ);
          const h = fbm(wx / 30 + j * 0.13, wz / 30);
          if (Math.abs(h - band) < 0.012 && insideTerrain(wx, wz, data.zones)) {
            const x = p.x(wx), y = p.y(wz);
            if (!drawing) { ctx.moveTo(x, y); drawing = true; }
            else ctx.lineTo(x, y);
            break;
          }
        }
      }
      if (drawing) ctx.stroke();
    }
    ctx.restore();
  }

  _drawObstacles(ctx, obstacles, p) {
    for (const o of obstacles || []) {
      if (!o?.enabled) continue;
      if (o.type === 'circle' && Number.isFinite(o.x) && Number.isFinite(o.z)) {
        const r = Math.max(0.25, Number(o.r) || 0.7) * p.scale;
        const x = p.x(o.x), y = p.y(o.z);
        const seed = hash(o.x, o.z);
        ctx.save();
        ctx.fillStyle = 'rgba(31,42,30,.88)';
        ctx.strokeStyle = 'rgba(126,139,106,.62)';
        ctx.lineWidth = Math.max(1, p.scale * 0.06);
        ctx.shadowColor = 'rgba(0,0,0,.5)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const n = 9;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const rr = r * (0.78 + hash(seed * 17 + i, seed * 23 + i) * 0.34);
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if ([o.minX, o.maxX, o.minZ, o.maxZ].every(Number.isFinite)) {
        const x = p.x(o.minX), y = p.y(o.minZ);
        const w = (o.maxX - o.minX) * p.scale;
        const h = (o.maxZ - o.minZ) * p.scale;
        if (w < 1 || h < 1) continue;
        ctx.save();
        ctx.fillStyle = 'rgba(18,27,20,.82)';
        ctx.strokeStyle = 'rgba(94,111,84,.42)';
        ctx.lineWidth = Math.max(1, p.scale * 0.08);
        ctx.beginPath();
        const r = Math.min(9, Math.max(2, Math.min(w, h) * 0.22));
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawPoi(ctx, poi, p) {
    const x = p.x(poi.x), y = p.y(poi.z);
    const colors = {
      arena: '#d96558', portal: '#70c5d5', mine: '#d6a04f',
      pz: '#6ea58c', npc: '#f0c86b', boss: '#b77aff', chest: '#e2b75b',
    };
    const icons = { arena: '◆', portal: '✦', mine: '▰', pz: 'PZ', npc: 'N', boss: '☠', chest: '▣' };
    const color = colors[poi.type] || '#f0d9a8';
    const radius = poi.type === 'pz' ? Math.max(10, (poi.r || 8) * p.scale) : 7;

    ctx.save();
    if (poi.type === 'pz') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(5, radius * 0.62), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#10150f';
    ctx.font = '700 9px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons[poi.type] || '•', x, y + 0.5);
    ctx.restore();

    if (poi.label) {
      ctx.save();
      ctx.font = '600 12px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,7,5,.9)';
      ctx.strokeText(poi.label, x + 11, y - 8);
      ctx.fillStyle = '#ead9ad';
      ctx.fillText(poi.label, x + 11, y - 8);
      ctx.restore();
    }
  }

  _drawEntities(ctx, entities, p) {
    for (const e of entities || []) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) continue;
      const x = p.x(e.x), y = p.y(e.z);
      const isBoss = e.type === 'boss';
      const color = isBoss ? '#b77aff' : e.type === 'npc' ? '#f0c86b' : e.type === 'loot' ? '#e6c15a' : '#e45d58';
      const r = isBoss ? 7 : e.type === 'npc' ? 5 : e.type === 'loot' ? 4 : 4.5;

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = isBoss ? 12 : 6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(5,8,6,.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      if (e.label) {
        ctx.save();
        ctx.font = '600 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(4,7,5,.92)';
        ctx.strokeText(e.label, x, y - r - 7);
        ctx.fillStyle = '#f0e5ca';
        ctx.fillText(e.label, x, y - r - 7);
        ctx.restore();
      }
    }
  }

  _drawPlayer(ctx, player, p) {
    if (!player) return;
    const x = p.x(player.x), y = p.y(player.z);
    ctx.save();
    ctx.shadowColor = 'rgba(255,103,103,.8)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff2dc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x - 5, y - 5);
    ctx.lineTo(x + 5, y - 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = '700 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(4,7,5,.95)';
    ctx.strokeText('VOCÊ', x, y + 22);
    ctx.fillStyle = '#fff0d0';
    ctx.fillText('VOCÊ', x, y + 22);
    ctx.restore();
  }

  render() {
    if (!this.data) return;
    const ctx = this.ctx;
    const data = this.data;
    const p = this._projectFactory(data.bounds, 58);

    ctx.clearRect(0, 0, this.renderW, this.renderH);
    ctx.fillStyle = '#070b09';
    ctx.fillRect(0, 0, this.renderW, this.renderH);

    // Moldura do mapa: um papel cartográfico escuro, sem grid quadriculado.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.65)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#0d1510';
    ctx.beginPath();
    ctx.roundRect(p.ox - 12, p.oy - 12, p.drawW + 24, p.drawH + 24, 18);
    ctx.fill();
    ctx.restore();

    this._drawTerrain(ctx, data, p);
    this._drawObstacles(ctx, data.obstacles, p);

    for (const poi of data.pois || []) this._drawPoi(ctx, poi, p);
    this._drawEntities(ctx, data.entities, p);
    this._drawPlayer(ctx, data.player, p);

    // Header and legend live outside the terrain itself.
    ctx.save();
    ctx.font = '700 25px Georgia, serif';
    ctx.fillStyle = '#f0d9a8';
    ctx.textAlign = 'left';
    ctx.fillText(this.title || 'MAPA', 34, 36);
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#8f9a8a';
    ctx.fillText(this.subtitle || '', 36, 53);

    const legend = [
      ['#ff6b6b', 'Você'],
      ['#e45d58', 'Inimigos'],
      ['#f0c86b', 'NPC'],
      ['#b77aff', 'Boss'],
      ['#d6a04f', 'Ponto de interesse'],
    ];
    let lx = this.renderW - 36;
    ctx.textAlign = 'right';
    ctx.font = '10px "Segoe UI", sans-serif';
    for (const [color, label] of legend) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx - ctx.measureText(label).width - 8, 30, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a7ad9f';
      ctx.fillText(label, lx, 34);
      lx -= ctx.measureText(label).width + 74;
    }

    ctx.fillStyle = '#697465';
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('M · fechar mapa', 36, this.renderH - 28);
    ctx.textAlign = 'right';
    ctx.fillText(data.areaName || '', this.renderW - 36, this.renderH - 28);
    ctx.restore();

    this.dirty = false;
  }
}
