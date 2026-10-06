import * as THREE from 'three';
import { Minimap } from './minimap.js';

// Minimal DOM HUD + world-anchored elements (damage numbers, HP bars,
// interaction prompts, speech bubbles) projected from 3D each frame.

const $ = (id) => document.getElementById(id);
const v = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    this.layer = $('world-layer');
    this.floaters = [];
    this.anchors = new Set();
    this.el = {
      hud: $('hud'), level: $('level'), xpFill: $('xp-fill'), xpText: $('xp-text'), gold: $('gold'), hpFill: $('hp-fill'), hpText: $('hp-text'), manaFill: $('mana-fill'), manaText: $('mana-text'), pname: $('pname'), portrait: $('portrait'),
      objective: $('objective'), objText: $('obj-text'), objHint: $('obj-hint'), questTimeline: $('quest-timeline'),
      bossBar: $('boss-bar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      toasts: $('toasts'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      vignette: $('vignette'), death: $('death'), fade: $('fade'), help: $('help'),
      skAttack: $('sk-attack'), skAbility: $('sk-ability'), skDash: $('sk-dash'), skUltimate: $('sk-ultimate'),
      inventory: $('inventory'), inventoryGrid: $('inventory-grid'), equipmentGrid: $('equipment-grid'), inventoryCount: $('inventory-count'),
      profile: $('profile'), profileBody: $('profile-body'),
      actionBar: $('action-bar'),
      minimap: $('minimap-canvas'),
      pause: $('pause'), pauseControls: $('pause-controls'),
      shop: $('shop'), shopTitle: $('shop-title'), shopSubtitle: $('shop-subtitle'), shopTabs: $('shop-tabs'), shopFeedback: $('shop-feedback'), shopItem: $('shop-item'), shopBuy: $('shop-buy'), shopClose: $('shop-close'), shopCancel: $('shop-cancel'),

    };
    this.prompt = this.anchor('prompt');
    this.bubble = this.anchor('bubble');
    this.bubble.el.innerHTML = '<div class="bname"></div><div class="btext"></div><div class="bhint">[E] continuar</div>';
    this.bannerTimer = null;
    this.actionBarFlashT = null;
    this.minimap = this.el.minimap
      ? new Minimap({ canvas: this.el.minimap, size: 274, viewWorld: 42 })
      : null;
    this.minimapAreaKey = null;
  }

  // ---------- world anchored ----------
  anchor(cls) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.display = 'none';
    this.layer.appendChild(el);
    const a = { el, pos: new THREE.Vector3(), visible: false, align: cls === 'bubble' ? 'bottom' : 'center' };
    this.anchors.add(a);
    return a;
  }
  showAnchor(a, pos, html) {
    a.pos.copy(pos);
    if (html !== undefined && a.html !== html) { a.el.innerHTML = html; a.html = html; }
    if (!a.visible) { a.el.style.display = ''; a.visible = true; }
  }
  hideAnchor(a) { if (a.visible) { a.el.style.display = 'none'; a.visible = false; } }
  removeAnchor(a) { a.el.remove(); this.anchors.delete(a); }

  createBar() {
    const a = this.anchor('ebar');
    a.el.innerHTML = '<div></div>';
    a.fill = a.el.firstChild;
    return a;
  }
  setBar(a, frac) { a.fill.style.width = `${Math.max(0, frac) * 100}%`; }

  showPrompt(text, pos) { this.showAnchor(this.prompt, pos, `<b>E</b>${text}`); }
  hidePrompt() { this.hideAnchor(this.prompt); }

  showBubble(name, text, pos, hint = '[E] continuar') {
    this.showAnchor(this.bubble, pos);
    this.bubble.el.children[0].textContent = name;
    this.bubble.el.children[1].textContent = text;
    this.bubble.el.children[2].textContent = hint;
  }
  hideBubble() { this.hideAnchor(this.bubble); }

  floatText(pos, text, cls = '', life = 0.9) {
    const el = document.createElement('div');
    el.className = `dmg ${cls}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0, life, dx: (Math.random() - 0.5) * 30 });
  }
  damageNumber(pos, amount, cls = '') {
    const classes = String(cls || '').trim().split(/\\s+/).filter(Boolean);
    const life = classes.includes('crit') ? 1.1 : 0.85;
    this.floatText(pos, String(amount), classes.join(' '), life);
  }

  project(pos) {
    v.copy(pos).project(this.game.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, ok: v.z < 1 };
  }

  update(dt) {
    this.updateMinimap();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const p = f.t / f.life;
      if (p >= 1) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      const s = this.project(f.pos);
      const pop = p < 0.15 ? 1 + (1 - p / 0.15) * 0.6 : 1;
      f.el.style.transform = `translate(${s.x + f.dx * p}px, ${s.y - p * 55}px) translate(-50%,-50%) scale(${pop})`;
      f.el.style.opacity = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
    }
    for (const a of this.anchors) {
      if (!a.visible) continue;
      const s = this.project(a.pos);
      const ty = a.align === 'bottom' ? '-100%' : '-50%';
      a.el.style.transform = `translate(${s.x | 0}px, ${s.y | 0}px) translate(-50%, ${ty})`;
      a.el.style.visibility = s.ok ? 'visible' : 'hidden';
    }
  }

  // ---------- minimap ----------
  _minimapPois(area) {
    const pois = [];
    if (!area?.minimap) return pois;

    if (area.minimap.arena) {
      const a = area.minimap.arena;
      pois.push({ type: 'arena', x: a.x, z: a.z, r: 1.8 });
    }
    if (area.minimap.portal) {
      const p = area.minimap.portal;
      pois.push({ type: 'portal', x: p.x, z: p.z, r: 1.2 });
    }

    // The surface mine entrance is a permanent navigation landmark.
    if (!area.minimap.underground) {
      pois.push({ type: 'mine', x: 12.4, z: 35.0, r: 1.6 });
      pois.push({ type: 'pz', x: 0.1, z: 35.2, r: 8.2 });
    } else {
      // Mine spawn/return shaft.
      pois.push({ type: 'mine', x: 110, z: 101, r: 1.6 });
    }

    return pois;
  }

  _minimapEntities() {
    const entities = [];
    const add = (entry, type, radius = 3) => {
      if (!entry?.pos || entry.dead || entry.removed) return;
      if (entry.root && entry.root.visible === false) return;
      entities.push({ x: entry.pos.x, z: entry.pos.z, type, radius });
    };

    for (const e of this.game.enemies || []) add(e, 'enemy', e.isBoss ? 4 : 3);
    for (const n of this.game.npcs || []) add(n, 'npc', 3.2);
    for (const item of this.game.groundLoot || []) add(item, 'item', 2.5);
    for (const backpack of this.game.deathBackpacks || []) add(backpack, 'item', 2.5);

    return entities;
  }

  updateMinimap(force = false) {
    const area = this.game.area;
    const p = this.game.player;
    if (!this.minimap || !area?.minimap || !p) return;

    const b = area.minimap.bounds;
    const areaKey = [
      b.minX, b.maxX, b.minZ, b.maxZ,
      area.minimap.underground ? 'mine' : 'surface',
    ].join('|');

    if (force || this.minimapAreaKey !== areaKey) {
      this.minimap.buildFromArea({
        bounds: b,
        zones: this.game.collision?.zones || [],
        obstacles: this.game.collision?.obstacles || [],
        pois: this._minimapPois(area),
      });
      this.minimapAreaKey = areaKey;
    }

    this.minimap.update(p, this._minimapEntities());
    this.minimap.render();
  }

  // ---------- vocation select ----------
  showSelect(vocations, onPreview, onStart) {
    const select = $('select');
    const list = $('voc-list'), desc = $('voc-desc');
    select.classList.remove('hidden');
    list.innerHTML = '';
    desc.innerHTML = '';
    $('record').textContent = '';
    let current = null;
    const pick = (id) => {
      current = id;
      for (const c of list.children) c.classList.toggle('sel', c.dataset.id === id);
      const v = vocations[id];
      desc.innerHTML = `${v.desc}<div class="st">HP ${v.hp} · Ataque: ${v.attack.name} (${v.attack.kind === 'melee' ? 'corpo a corpo' : 'distância'}) · Habilidade: ${v.ability.name}</div>`;
      onPreview(id);
    };
    for (const id of Object.keys(vocations)) {
      const v = vocations[id];
      const c = document.createElement('div');
      c.className = 'voc';
      c.dataset.id = id;
      c.style.setProperty('--vc', v.color);
      c.innerHTML = `<div class="dot"></div><div class="vn">${v.name}</div><div class="vt">${v.title}</div>`;
      c.onclick = () => pick(id);
      list.appendChild(c);
    }
    const kills = +(localStorage.getItem('arena.proto.bossKills') || 0);
    if (kills) $('record').textContent = `Registro: Morvhal já foi derrotado ${kills}x neste navegador.`;
    const startBtn = $('start-btn');
    startBtn.onclick = async () => {
      if (!current || startBtn.disabled) return;
      this.setStartLoading(true);
      await onStart(current);
    };
    pick('knight');
  }

  hideSelect() {
    $('select')?.classList.add('hidden');
  }

  setStartLoading(loading) {
    const button = $('start-btn');
    if (!button) return;
    button.disabled = !!loading;
    button.textContent = loading ? 'Carregando personagem...' : 'Entrar na floresta';
    button.setAttribute('aria-busy', loading ? 'true' : 'false');
  }
}
