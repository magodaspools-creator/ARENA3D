// src/minimap.js — ARENA3D
const minimapHash = (x, z) => {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const minimapNoise2 = (x, z) => {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = minimapHash(xi, zi);
  const b = minimapHash(xi + 1, zi);
  const c = minimapHash(xi, zi + 1);
  const d = minimapHash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const minimapFbm = (x, z) => {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;

  for (let octave = 0; octave < 4; octave++) {
    sum += minimapNoise2(x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return sum / total;
};

const minimapRamp = (value) => {
  const stops = [
    [0.00, [0x16, 0x24, 0x18]],
    [0.34, [0x2f, 0x49, 0x2c]],
    [0.60, [0x67, 0x68, 0x3e]],
    [0.78, [0x9a, 0x82, 0x4d]],
    [1.00, [0x7b, 0x7d, 0x74]],
  ];

  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (value - a) / Math.max(0.0001, b - a);
      const smooth = t * t * (3 - 2 * t);
      return [
        ca[0] + (cb[0] - ca[0]) * smooth,
        ca[1] + (cb[1] - ca[1]) * smooth,
        ca[2] + (cb[2] - ca[2]) * smooth,
      ];
    }
  }

  return stops[stops.length - 1][1];
};

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
    // Cache por bounds: a textura/height-field só é recalculada quando a
    // área geométrica do minimapa realmente muda.
    this.groundMinimapCache = new Map();
    this.player = { x: 0, z: 0, rot: 0 };
    this.entities = [];
    this.dirty = true;

    if (!opts.canvas) this._style();
  }

  _makeGroundMinimapTexture(bounds, field, noise2, fbm, ramp, buildKey) {
    if (this.groundMinimapCache.has(buildKey)) return this.groundMinimapCache.get(buildKey);

    // Diâmetro do círculo = dimensão diagonal do bounding box.
    const diag = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const radius = Math.ceil(diag / 2);
    const size = radius * 2;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
    const S = 1 / diag;

    const heightData = new Float32Array(size * size);

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        // Coordenadas polares: distância e ângulo do centro.
        const dx = (px - radius) / radius;
        const dz = (py - radius) / radius;
        const r = Math.sqrt(dx * dx + dz * dz);

        // Só desenha dentro do círculo.
        if (r > 1) continue;

        // Coordenadas do mundo — campo contínuo, sem emendas.
        const x = centerX + dx * diag * 0.5;
        const z = centerZ + dz * diag * 0.5;

        // Campo suave e contínuo.
        const broad = fbm(x / 30, z / 30);
        const grain = noise2(x / 6, z / 6) - 0.5;
        const fieldValue = Math.max(0, Math.min(1, broad + grain * 0.12));
        heightData[py * size + px] = fieldValue;

        const i = (py * size + px) * 4;
        const color = ramp(fieldValue);
        data[i] = Math.round(color[0]);
        data[i + 1] = Math.round(color[1]);
        data[i + 2] = Math.round(color[2]);
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const result = {
      canvas,
      heightField: { data: heightData, width: size, height: size },
      width: size,
      height: size,
      radius
    };

    if (!this.groundMinimapCache) this.groundMinimapCache = new Map();
    this.groundMinimapCache.set(buildKey, result);
    return result;
  }

  _drawContours(c, heightField, S) {
    // Curvas de nível derivadas do MESMO campo escalar da textura.
    // Cada linha corresponde a frac(h * k) = 0.5, sem usar nenhum polígono
    // da área. O marching-squares mantém as curvas suaves e antialiasadas.
    if (!heightField?.data || !heightField.width || !heightField.height) return;

    const W = heightField.width;
    const H = heightField.height;
    const field = heightField.data;
    const k = 7;

    c.save();
    c.globalAlpha = 0.10;
    c.strokeStyle = 'rgba(218,218,184,1)';
    c.lineWidth = Math.max(0.65, Math.min(1.15, S * 0.055));
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.beginPath();

    // Cada nível é h = (n + 0.5) / k. Isso é exatamente o cruzamento de
    // frac(h * k) com 0.5, mas sem o problema de interpolação no salto do frac.
    for (let level = 0; level < k; level++) {
      const threshold = (level + 0.5) / k;

      const edgePoint = (a, b, ax, ay, bx, by) => {
        const da = a - threshold;
        const db = b - threshold;
        if ((da < 0 && db < 0) || (da > 0 && db > 0) || a === b) return null;

        const t = da / (da - db);
        return [ax + (bx - ax) * t, ay + (by - ay) * t];
      };

      for (let y = 0; y < H - 1; y++) {
        for (let x = 0; x < W - 1; x++) {
          const i = y * W + x;
          const v0 = field[i];
          const v1 = field[i + 1];
          const v2 = field[i + W + 1];
          const v3 = field[i + W];

          const points = [];
          const p0 = edgePoint(v0, v1, x, y, x + 1, y);
          const p1 = edgePoint(v1, v2, x + 1, y, x + 1, y + 1);
          const p2 = edgePoint(v3, v2, x, y + 1, x + 1, y + 1);
          const p3 = edgePoint(v0, v3, x, y, x, y + 1);

          if (p0) points.push(p0);
          if (p1) points.push(p1);
          if (p2) points.push(p2);
          if (p3) points.push(p3);

          if (points.length >= 2) {
            c.moveTo(points[0][0], points[0][1]);
            c.lineTo(points[1][0], points[1][1]);

            // Caso ambíguo do marching-squares: há dois segmentos.
            if (points.length === 4) {
              c.moveTo(points[2][0], points[2][1]);
              c.lineTo(points[3][0], points[3][1]);
            }
          }
        }
      }
    }

    c.stroke();
    c.restore();
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

  _terrainContains(x, z, zones) {
    // O minimapa NÃO desenha os polígonos. Ele apenas consulta a área
    // caminhável real do sistema de colisão e transforma essa informação em
    // um campo raster contínuo.
    for (const zone of zones) {
      if (!zone) continue;

      if (zone.type === 'circle') {
        if (Math.hypot(x - zone.x, z - zone.z) <= zone.r) return true;
        continue;
      }

      if (zone.type === 'rect') {
        if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return true;
        continue;
      }

      if (zone.type === 'polygon' && Array.isArray(zone.points)) {
        let inside = false;
        for (let i = 0, j = zone.points.length - 1; i < zone.points.length; j = i++) {
          const [xi, zi] = zone.points[i];
          const [xj, zj] = zone.points[j];
          const hit = ((zi > z) !== (zj > z)) &&
            (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
          if (hit) inside = !inside;
        }
        if (inside) return true;
      }
    }
    return false;
  }

  _buildTerrainMask(zones, wx, wz, S, W, bounds, offX = 0, offZ = 0) {
    // A máscara continua sendo uma união raster da área caminhável real.
    // Nenhuma zona é desenhada como path e nenhuma fronteira interna é criada.
    if (!this.terrainMask || this.terrainMask.width !== W || this.terrainMask.height !== W) {
      this.terrainMask = document.createElement('canvas');
      this.terrainMask.width = W;
      this.terrainMask.height = W;
      this.terrainMaskCtx = this.terrainMask.getContext('2d', { willReadFrequently: true });
    }

    const ctx = this.terrainMaskCtx;
    const image = ctx.createImageData(W, W);
    const data = image.data;

    // Grade 4x4 por pixel. A cobertura agora é contínua (0..255), em vez
    // de quantizada em apenas cinco níveis de alpha.
    const sampleOffsets = [-0.375, -0.125, 0.125, 0.375];
    const totalSamples = sampleOffsets.length * sampleOffsets.length;

    for (let py = 0; py < W; py++) {
      const z = bounds.minZ + ((py + 0.5) / S);

      for (let px = 0; px < W; px++) {
        const x = bounds.minX + ((px + 0.5) / S);
        let hits = 0;

        for (const sx of sampleOffsets) {
          for (const sz of sampleOffsets) {
            if (this._terrainContains(x + sx / S, z + sz / S, zones)) hits++;
          }
        }

        const alpha = Math.round(255 * hits / totalSamples);
        const i = (py * W + px) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = alpha;
      }
    }

    ctx.putImageData(image, 0, 0);

    // Suaviza somente a transição rasterizada. O raio menor evita que
    // pequenos vazios internos sejam "fechados" visualmente.
    const softened = document.createElement('canvas');
    softened.width = W;
    softened.height = W;
    const sc = softened.getContext('2d');

    sc.filter = 'blur(0.7px)';
    sc.drawImage(this.terrainMask, 0, 0);
    sc.filter = 'none';

    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(softened, 0, 0);

    return true;
  }


  _drawTerrain(c, zones, wx, wz, S, W, bounds, buildKey, offX, offZ) {
    if (!this._buildTerrainMask(zones, wx, wz, S, W, bounds, offX, offZ)) return;

    c.fillStyle = '#18261b';
    c.fillRect(0, 0, W, W);

    // A máscara continua disponível para o mapa-base legado, mas a textura
    // circular do terreno é renderizada diretamente em render().
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

    // A chave depende somente dos bounds, como solicitado. Ela é definida
    // antes da textura para que o cache possa ser consultado na construção.
    const buildKey = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].join('|');

    c.clearRect(0, 0, W, W);
    this._makeGroundMinimapTexture(bounds, null, minimapNoise2, minimapFbm, minimapRamp, buildKey);
    this._drawTerrain(c, zones, wx, wz, S, W, bounds, buildKey, offX, offZ);
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
    this.buildKey = buildKey;
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

    // Fundo
    ctx.fillStyle = '#0b100d';
    ctx.fillRect(0, 0, this.size, this.size);

    // Desenha a textura circular centralizada e deslocada pelo jogador.
    const tex = this.groundMinimapCache.get(this.buildKey);
    if (tex) {
      const cx = this.size / 2;
      const cy = this.size / 2;
      const scale = this.size / (tex.radius * 2);

      const centerX = (this.bounds.minX + this.bounds.maxX) * 0.5;
      const centerZ = (this.bounds.minZ + this.bounds.maxZ) * 0.5;
      const dx = (this.player.x - centerX) * scale;
      const dz = (this.player.z - centerZ) * scale;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, this.size / 2 - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        tex.canvas,
        cx - tex.radius * scale - dx,
        cy - tex.radius * scale - dz,
        tex.radius * scale * 2,
        tex.radius * scale * 2
      );
      ctx.restore();
    }

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
