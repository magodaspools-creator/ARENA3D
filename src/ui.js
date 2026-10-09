import * as THREE from 'three';
import { Minimap } from './minimap.js';
import { WorldMap } from './world-map.js';

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
      hpOrbFill: $('hp-orb')?.querySelector('.orb-fill'), hpOrbText: $('hp-orb-text'),
      manaOrbFill: $('mana-orb')?.querySelector('.orb-fill'), manaOrbText: $('mana-orb-text'),
      profile: $('profile'), profileBody: $('profile-body'),
      actionBar: $('action-bar'),
      minimap: $('minimap-canvas'),
      worldMap: $('world-map-canvas'),
      worldMapOverlay: $('world-map'),
      worldMapClose: $('world-map-close'),
      tutorial: $('tutorial'),
      tutorialClose: $('tutorial-close'),
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
    this.minimapLastZoneCount = null;
    this.worldMap = this.el.worldMap
      ? new WorldMap({ canvas: this.el.worldMap, title: 'MAPA DE VHAL', subtitle: 'Cartografia da área atual' })
      : null;
    this.el.worldMapClose?.addEventListener('click', () => this.game.closeWorldMap?.());
    this.el.tutorialClose?.addEventListener('click', () => this.closeTutorial());
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

  // ---------- mapa-múndi ----------
  _worldMapPois(area) {
    const pois = [];
    if (!area?.minimap) return pois;
    if (area.minimap.arena) {
      const a = area.minimap.arena;
      pois.push({ type: 'arena', x: a.x, z: a.z, r: 2.2, label: 'Arena' });
    }
    if (area.minimap.portal) {
      const p = area.minimap.portal;
      pois.push({ type: 'portal', x: p.x, z: p.z, r: 1.5, label: 'Portal' });
    }
    if (!area.minimap.underground) {
      pois.push({ type: 'mine', x: 12.4, z: 35.0, r: 2.0, label: 'Entrada da Mina' });
      pois.push({ type: 'pz', x: 0.1, z: 35.2, r: 8.2, label: 'Zona Protegida' });
    } else {
      pois.push({ type: 'mine', x: 110, z: 101, r: 2.0, label: 'Mina' });
    }
    return pois;
  }

  _worldMapEntities() {
    const entities = [];
    const add = (entry, type, radius = 3) => {
      if (!entry?.pos || entry.dead || entry.removed) return;
      if (entry.root && entry.root.visible === false) return;
      entities.push({
        x: entry.pos.x,
        z: entry.pos.z,
        type: entry.isBoss ? 'boss' : type,
        radius,
        label: entry.isBoss ? (entry.name || 'Boss') : (entry.name || (type === 'npc' ? 'NPC' : 'Monstro')),
      });
    };
    for (const e of this.game.enemies || []) add(e, 'enemy', e.isBoss ? 4 : 3);
    for (const n of this.game.npcs || []) add(n, 'npc', 3.2);
    for (const loot of this.game.groundLoot || []) {
      if (!loot?.pos || loot.dead) continue;
      entities.push({ x: loot.pos.x, z: loot.pos.z, type: 'loot', label: 'Loot' });
    }
    return entities;
  }

  updateWorldMap() {
    if (!this.worldMap || !this.game.area || !this.game.player) return;
    const area = this.game.area;
    const zones = this.game.collision?.zones || [];
    const obstacles = this.game.collision?.obstacles || [];

    let bounds = area.minimap?.bounds;

    // Se a metadata do minimapa não estiver disponível, derive o mapa
    // diretamente das zonas reais de colisão.
    if (!bounds && zones.length) {
      const xs = [], zs = [];
      for (const zone of zones) {
        if (zone.type === 'rect') {
          xs.push(zone.minX, zone.maxX);
          zs.push(zone.minZ, zone.maxZ);
        } else if (zone.type === 'circle') {
          xs.push(zone.x - zone.r, zone.x + zone.r);
          zs.push(zone.z - zone.r, zone.z + zone.r);
        } else if (zone.type === 'polygon' && Array.isArray(zone.points)) {
          for (const [x, z] of zone.points) {
            xs.push(x);
            zs.push(z);
          }
        }
      }
      if (xs.length) {
        const pad = 3;
        bounds = {
          minX: Math.min(...xs) - pad,
          maxX: Math.max(...xs) + pad,
          minZ: Math.min(...zs) - pad,
          maxZ: Math.max(...zs) + pad,
        };
      }
    }

    // Último fallback: mesmo sem zonas, o overlay continua funcional.
    if (!bounds) {
      const x = this.game.player.pos.x;
      const z = this.game.player.pos.z;
      bounds = { minX: x - 40, maxX: x + 40, minZ: z - 40, maxZ: z + 40 };
    }

    const questTarget = area.progression?.target || null;

    this.worldMap.setData({
      bounds,
      zones,
      obstacles,
      pois: this._worldMapPois(area),
      questTarget,
      entities: this._worldMapEntities(),
      player: { x: this.game.player.pos.x, z: this.game.player.pos.z },
      areaName: area.name || 'Área atual',
    });
  }
  openWorldMap() {
    if (!this.worldMap || !this.game.player || this.game.state !== 'play') return;
    this.updateWorldMap();
    this.el.worldMapOverlay?.classList.remove('hidden');
    this.worldMap.open();
  }

  closeWorldMap() {
    this.worldMap?.close();
    this.el.worldMapOverlay?.classList.add('hidden');
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
    if (!area.minimap.underground) {
      pois.push({ type: 'mine', x: 12.4, z: 35.0, r: 1.6 });
      pois.push({ type: 'pz', x: 0.1, z: 35.2, r: 8.2 });
    } else {
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
    return entities;
  }

  updateMinimap(force = false) {
    const area = this.game.area;
    const p = this.game.player;
    if (!this.minimap || !area?.minimap || !p) return;

    const b = area.minimap.bounds;
    const zones = this.game.collision?.zones || [];

    // Não constrói terreno sem zonas: destination-in apagaria tudo.
    if (!zones.length) {
      if (this.minimapLastZoneCount !== 0) {
        console.log('[minimap] aguardando zones', { zoneCount: 0 });
        this.minimapLastZoneCount = 0;
      }
      return;
    }

    const areaKey = [
      b.minX, b.maxX, b.minZ, b.maxZ,
      area.minimap.underground ? 'mine' : 'surface',
      `zones:${zones.length}`,
      `quest:${area.progression?.id || 'none'}`,
    ].join('|');

    if (force || this.minimapAreaKey !== areaKey) {
      console.log('[minimap] build', { areaKey, zoneCount: zones.length });
      this.minimap.buildFromArea({
        bounds: b,
        zones,
        obstacles: this.game.collision?.obstacles || [],
        pois: this._minimapPois(area),
        questTarget: area.progression?.target || null,
      });
      this.minimapAreaKey = areaKey;
      this.minimapLastZoneCount = zones.length;
    }

    this.minimap.update(p, this._minimapEntities());
    this.minimap.render();
  }

  // ---------- HUD ----------
  showHud(voc, character = null) {
    this.el.hud.classList.remove('hidden');
    this.el.pname.innerHTML = `${voc.name}<small>${voc.title}</small>`;
    this.el.portrait.style.setProperty('--vc', voc.color);
    this.el.portrait.textContent = voc.name[0];
    this.el.skAttack.querySelector('.label').textContent = voc.attack.name;
    this.el.skAbility.querySelector('.label').textContent = `${voc.ability.name}${voc.ability.manaCost ? ` · ${voc.ability.manaCost} MP` : ''}`;
    if (this.el.skUltimate) {
      this.el.skUltimate.classList.toggle('hidden', !['sorcerer', 'knight', 'druid', 'paladin', 'monk'].includes(voc.id));
      const ultimateName = voc.ultimate?.name || 'Ultimate';
      const ultimateCost = voc.ultimate?.manaCost;
      this.el.skUltimate.querySelector('.label').textContent = `${ultimateName}${ultimateCost ? ` · ${ultimateCost} MP` : ''}`;
    }
    this.setProgress(character);
    this.setActionBar(character);
    this.showTutorialIfNeeded();
  }
  setUltimate(progress) {
    const el = this.el.skUltimate;
    if (!el) return;
    const pct = Math.max(0, Math.min(1, Number(progress) || 0)) * 100;
    el.style.setProperty('--ult-progress', pct + '%');
    el.classList.toggle('ready', pct >= 100);
  }

  showTutorialIfNeeded() {
    if (!this.el.tutorial) return;
    let seen = false;
    try { seen = localStorage.getItem('arena3d-controls-tutorial-seen') === '1'; } catch {}
    if (!seen) this.el.tutorial.classList.remove('hidden');
  }

  closeTutorial() {
    this.el.tutorial?.classList.add('hidden');
    try { localStorage.setItem('arena3d-controls-tutorial-seen', '1'); } catch {}
  }

  toggleHelp() { this.el.help?.classList.toggle('hidden'); }
  showPause() { this.el.pause?.classList.remove('hidden'); }
  hidePause() { this.el.pause?.classList.add('hidden'); }
  showPauseControls() { this.el.pauseControls?.classList.remove('hidden'); }
  hidePauseControls() { this.el.pauseControls?.classList.add('hidden'); }

  showShop({ npcName, stock = [], sellStock = [], onBuy, onSell, onSellAllItem, onClose, onModeChange, initialMode = 'buy', initialScrollTop = 0 }) {
    if (!this.el.shop) return;

    let currentMode = initialMode === 'sell' ? 'sell' : 'buy';

    const setQuantity = (card, value) => {
      const input = card?.querySelector('.shop-qty-input');
      if (!input) return 1;
      const max = Math.max(1, Number(input.max) || 1);
      const qty = Math.min(max, Math.max(1, Math.floor(Number(value) || 1)));
      input.value = String(qty);
      const button = card.querySelector('.shop-buy-item');
      const action = button?.dataset.action || 'Comprar';
      if (button) button.textContent = action + ' x' + qty;
      return qty;
    };

    const renderMode = (mode, scrollTop = 0) => {
      currentMode = mode === 'sell' ? 'sell' : 'buy';
      const isSell = currentMode === 'sell';
      const entries = isSell ? sellStock : stock;
      this.el.shopTitle.textContent = 'Comércio — ' + npcName;
      this.el.shopSubtitle.textContent = isSell
        ? 'Venda apenas os itens que estão na mochila'
        : 'Escolha um item para comprar';

      this.el.shopItem.innerHTML = entries.length
        ? entries.map((entry) => {
            const item = entry.item;
            const price = entry.price;
            const owned = entry.owned ?? 0;
            const equipped = entry.equipped ?? 0;
            const maxQty = isSell ? Math.max(1, owned) : Math.max(1, Number(item.maxStack) || 99);
            const icon = item.sprite
              ? '<img class="shop-icon" alt="">'
              : '<span class="shop-icon shop-glyph">' + (item.icon || '◆') + '</span>';
            const ownedText = isSell
              ? 'Você possui: ' + owned + (equipped ? ' · Equipado: ' + equipped : '')
              : 'Você possui: ' + owned;
            const action = isSell ? 'Vender' : 'Comprar';
            return '<div class="shop-item-card" data-shop-item="' + item.id + '">' +
              icon +
              '<div class="shop-item-info"><div class="shop-item-name"></div><div class="shop-item-desc"></div><div class="shop-item-owned">' + ownedText + '</div></div>' +
              '<div class="shop-buy-col">' +
                '<div class="shop-price">' + price + '<small>ouro / un.</small></div>' +
                '<div class="shop-qty"><button class="shop-qty-btn" type="button" data-step="-1" aria-label="Diminuir quantidade">−</button><input class="shop-qty-input" type="number" min="1" max="' + maxQty + '" value="1" inputmode="numeric" aria-label="Quantidade"><button class="shop-qty-btn" type="button" data-step="1" aria-label="Aumentar quantidade">+</button></div>' +
                '<div class="shop-total">Total: <b>' + price + '</b> ouro</div>' +
                '<button class="shop-buy-item" type="button" data-action="' + action + '">' + action + ' x1</button>' +
                (isSell ? '<button class="shop-sell-all-item" type="button">Vender tudo</button>' : '') +
              '</div>' +
            '</div>';
          }).join('')
        : '<div class="shop-empty">' + (isSell ? 'Você não possui itens que possam ser vendidos.' : 'Nenhuma mercadoria disponível.') + '</div>';

      for (const entry of entries) {
        const card = this.el.shopItem.querySelector('[data-shop-item="' + entry.item.id + '"]');
        if (!card) continue;
        card.querySelector('.shop-item-name').textContent = entry.item.name;
        card.querySelector('.shop-item-desc').textContent = entry.item.description;
        if (entry.item.sprite) card.querySelector('.shop-icon').src = entry.item.sprite;

        const input = card.querySelector('.shop-qty-input');
        const total = card.querySelector('.shop-total b');
        const button = card.querySelector('.shop-buy-item');
        const updateQtyUI = () => {
          const qty = setQuantity(card, input.value);
          input.value = String(qty);
          total.textContent = String(entry.price * qty);
        };

        input.addEventListener('input', updateQtyUI);
        input.addEventListener('change', updateQtyUI);
        card.querySelectorAll('.shop-qty-btn').forEach((qtyButton) => {
          qtyButton.onclick = () => updateQtyUIWithStep(qtyButton.dataset.step);
        });

        const updateQtyUIWithStep = (step) => {
          setQuantity(card, Number(input.value) + Number(step));
          total.textContent = String(entry.price * Number(input.value));
        };

        button.onclick = () => {
          const qty = setQuantity(card, input.value);
          if (isSell) onSell(entry.item.id, entry.price, qty);
          else onBuy(entry.item.id, entry.price, qty);
        };

        if (isSell) {
          card.querySelector('.shop-sell-all-item').onclick = () => {
            onSellAllItem?.(entry.item.id, entry.price);
          };
        }
      }

      this.el.shopTabs?.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('active', button.dataset.mode === currentMode);
      });

      this.el.shopItem.scrollTop = Math.max(0, Number(scrollTop) || 0);
    };

    this.el.shopTabs?.querySelectorAll('button').forEach((button) => {
      button.onclick = () => {
        if (this.el.shopFeedback) {
          this.el.shopFeedback.classList.remove('show', 'error');
          this.el.shopFeedback.textContent = '';
        }
        const nextMode = button.dataset.mode || 'buy';
        onModeChange?.(nextMode);
        renderMode(nextMode, 0);
      };
    });

    this.el.shopBuy.classList.add('hidden');
    this.el.shopClose.onclick = onClose;
    this.el.shopCancel.onclick = onClose;
    this.el.shopCancel.textContent = 'Fechar';
    renderMode(currentMode, initialScrollTop);
    this.el.shop.classList.remove('hidden');
  }

  showShopFeedback(text, error = false) {
    const el = this.el.shopFeedback;
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', !!error);
    el.classList.add('show');
    clearTimeout(this.shopFeedbackTimer);
    this.shopFeedbackTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  showShopAmount(text, itemId) {
    const card = itemId ? this.el.shopItem?.querySelector('[data-shop-item="' + itemId + '"]') : null;
    if (!card) return;
    const el = document.createElement('div');
    el.className = 'shop-transaction-float';
    el.textContent = text;
    card.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
  hideShop() {
    this.el.shop?.classList.add('hidden');
  }

  showInventory(character) {
    this.el.inventory.classList.remove('hidden');
    this.setInventory(character);
  }

  hideInventory() {
    this.el.inventory.classList.add('hidden');
  }

  setInventory(character) {
    if (!character) return;

    const grid = this.el.inventoryGrid;
    grid.innerHTML = '';

    const equipmentLabels = {
      head: 'Cabeça',
      armor: 'Armadura',
      legs: 'Pernas',
      boots: 'Botas',
      weapon: 'Arma',
      shield: 'Escudo',
      amulet: 'Amuleto',
      ring: 'Anel',
    };

    const equipmentGlyphs = {
      head: '◉',
      armor: '♜',
      legs: '∥',
      boots: '◢',
      weapon: '⚔',
      shield: '⬟',
      amulet: '◇',
      ring: '○',
    };

    this.el.equipmentGrid.innerHTML = '';

    // Paper-doll: o equipamento fica em uma coluna própria, à direita da mochila.
    for (const slotName of ['head', 'amulet', 'armor', 'weapon', 'legs', 'shield', 'boots', 'ring']) {
      const itemId = character.equipment?.[slotName];
      const item = itemId ? this.game.getItem(itemId) : null;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'equip-slot equip-slot-' + slotName + (item ? ' filled' : '');
      el.dataset.slot = slotName;
      el.title = item
        ? item.name + ' — clique para desequipar'
        : equipmentLabels[slotName];

      const visual = item
        ? (item.sprite
          ? '<img class="equip-slot-icon equip-item-sprite" alt="">'
          : '<span class="equip-slot-icon">' + (item.icon || '◆') + '</span>')
        : '<span class="equip-slot-icon equip-body-glyph">' + equipmentGlyphs[slotName] + '</span>';

      el.innerHTML =
        '<span class="equip-slot-label">' + equipmentLabels[slotName] + '</span>' +
        visual +
        '<span class="equip-slot-item">' + (item ? item.name : 'Vazio') + '</span>';

      if (item?.sprite) el.querySelector('.equip-item-sprite').src = item.sprite;
      if (item) el.onclick = () => this.game.unequipItem(slotName);
      this.el.equipmentGrid.appendChild(el);
    }

    const slots = character.inventory;
    this.el.inventoryCount.textContent = slots.length + ' / 24 espaços';

    for (const slot of slots) {
      const item = this.game.getItem(slot.id);
      if (!item) continue;

      const el = document.createElement('button');
      el.className = 'inv-slot' + (item.effect ? ' usable' : '');
      el.type = 'button';
      el.draggable = true;
      el.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', item.id);
        event.dataTransfer?.setData('application/x-arena-inventory', '1');
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.title = item.name + ' — ' + item.description;
      el.innerHTML =
        (item.sprite ? '<img class="inv-icon" alt="">' : '<span class="inv-icon inv-glyph">' + (item.icon || '◆') + '</span>') +
        '<span class="inv-name"></span><span class="inv-qty">x' + slot.qty + '</span>';
      if (item.sprite) el.querySelector('.inv-icon').src = item.sprite;
      el.querySelector('.inv-name').textContent = item.name;
      el.onclick = () => {
        if (item.effect) this.game.useItem(slot.id);
        else this.game.equipItem(slot.id);
      };
      grid.appendChild(el);
    }

    this.setActionBar(character);

    for (let i = slots.length; i < 24; i++) {
      const empty = document.createElement('div');
      empty.className = 'inv-slot empty';
      grid.appendChild(empty);
    }
  }

  setActionBar(character) {
    if (!character || !this.el.actionBar) return;
    const slots = Array.isArray(character.actionBar) ? character.actionBar : Array(6).fill(null);
    this.el.actionBar.innerHTML = '';

    for (let i = 0; i < 6; i++) {
      const itemId = slots[i];
      const qty = itemId ? character.getItemCount(itemId) : 0;
      if (itemId && qty <= 0) character.setActionBarSlot(i, null);

      const item = itemId && qty > 0 ? this.game.getItem(itemId) : null;
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'action-slot' + (item ? '' : ' empty');
      slot.dataset.index = String(i);
      slot.title = item
        ? item.name + ' — tecla ' + (i + 1) + (item.effect ? ' · clique para usar' : '')
        : 'Arraste um item do inventário para cá';
      slot.innerHTML =
        '<span class="action-key">' + (i + 1) + '</span>' +
        '<span class="action-keycap">' + (i + 1) + '</span>';

      if (item) {
        const icon = item.sprite
          ? '<img class="action-icon" alt="">'
          : '<span class="action-icon action-glyph">' + (item.icon || '◆') + '</span>';
        slot.insertAdjacentHTML('beforeend', icon);
        if (item.sprite) slot.querySelector('.action-icon').src = item.sprite;
        slot.insertAdjacentHTML('beforeend', '<span class="action-qty">x' + qty + '</span>');
        slot.insertAdjacentHTML('beforeend', '<span class="action-name">' + item.name + '</span>');
        slot.draggable = true;
        slot.addEventListener('dragstart', (event) => {
          event.dataTransfer?.setData('text/plain', item.id);
          event.dataTransfer?.setData('application/x-arena-action-slot', String(i));
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
          }
          slot.classList.add('dragging');
        });
        slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
        slot.addEventListener('click', () => {
          if (this.game.useActionBarSlot(i)) this.flashActionBarSlot(i);
        });
      }

      slot.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (!character.actionBar?.[i]) return;
        character.setActionBarSlot(i, null);
        this.setActionBar(character);
      });

      slot.addEventListener('dragover', (event) => {
        event.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', (event) => {
        event.preventDefault();
        slot.classList.remove('drag-over');
        const itemIdFromDrag = event.dataTransfer?.getData('text/plain');
        if (!itemIdFromDrag || !this.game.getItem(itemIdFromDrag)) return;
        const inventorySource = event.dataTransfer?.getData('application/x-arena-inventory') === '1';
        const sourceIndexRaw = event.dataTransfer?.getData('application/x-arena-action-slot');
        const sourceIndex = Number(sourceIndexRaw);
        const hasActionSource = !inventorySource && Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < 6;

        if (hasActionSource) {
          // Only an actual action-bar drag may clear another action slot.
          // Inventory drags must never carry over a stale action-slot source.
          character.setActionBarSlot(sourceIndex, null);
        } else {
          // Inventory drags keep other slots intact unless the same item is
          // already assigned there; in that case the old assignment is moved.
          const previousIndex = character.actionBar.findIndex((assignedId, index) => assignedId === itemIdFromDrag && index !== i);
          if (previousIndex >= 0) character.setActionBarSlot(previousIndex, null);
        }

        character.setActionBarSlot(i, itemIdFromDrag);
        this.setActionBar(character);
        this.setInventory(character);
      });

      this.el.actionBar.appendChild(slot);
    }
  }

  flashActionBarSlot(index) {
    const slot = this.el.actionBar?.querySelector('[data-index="' + index + '"]');
    if (!slot) return;
    slot.classList.remove('used');
    void slot.offsetWidth;
    slot.classList.add('used');
    clearTimeout(this.actionBarFlashT);
    this.actionBarFlashT = setTimeout(() => slot.classList.remove('used'), 180);
  }

  showProfile(character) {
    if (!character) return;
    const voc = this.game.player?.voc;
    const stats = character.stats;
    const xpPct = Math.round(character.xpPercent * 100);
    const attack = stats.attackMin === stats.attackMax ? stats.attackMin : stats.attackMin + '–' + stats.attackMax;
    const ability = stats.abilityMin === stats.abilityMax ? stats.abilityMin : stats.abilityMin + '–' + stats.abilityMax;
    const attackSpeed = (1 / Math.max(0.01, stats.attackCooldown)).toFixed(2);

    this.el.profileBody.innerHTML =
      '<div class="profile-identity">' +
        '<div class="profile-avatar" style="--vc:' + (voc?.color || '#888') + '">' + (voc?.name?.[0] || '?') + '</div>' +
        '<div><div class="profile-vocation">' + (voc?.name || character.vocation) + '</div><div class="profile-title">' + (voc?.title || '') + '</div>' +
        '<div class="profile-level">Nível ' + character.level + '</div></div>' +
      '</div>' +
      '<div class="profile-section-title">Atributos</div>' +
      '<div class="profile-grid profile-stats">' +
        '<div><span>Vida máxima</span><b>' + stats.maxHp + '</b></div>' +
        '<div><span>Ataque</span><b>' + attack + '</b></div>' +
        '<div><span>Dano da habilidade</span><b>' + ability + '</b></div>' +
        '<div><span>Defesa</span><b>' + stats.armorPercent + '%</b></div>' +
        '<div><span>Velocidade</span><b>' + stats.speed + '</b></div>' +
        '<div><span>Alcance</span><b>' + (stats.attackRange ? stats.attackRange.toFixed(1) : '—') + '</b></div>' +
        '<div><span>Velocidade de ataque</span><b>' + attackSpeed + '/s</b></div>' +
        '<div><span>Ouro</span><b>' + character.gold + '</b></div>' +
      '</div>' +
      '<div class="profile-section-title">Progressão</div>' +
      '<div class="profile-xp">' +
        '<div class="profile-xp-head"><span>Experiência</span><b>' + character.xpIntoLevel + ' / ' + character.xpForNextLevel + ' XP</b></div>' +
        '<div class="profile-xp-bar"><div style="width:' + xpPct + '%"></div></div>' +
        '<div class="profile-xp-foot"><span>Nível ' + character.level + '</span><span>' + xpPct + '%</span><span>Próximo: ' + (character.level + 1) + '</span></div>' +
      '</div>' +
      '';
    this.el.profile.classList.remove('hidden');
  }
  hideProfile() {
    this.el.profile.classList.add('hidden');
  }

  setProgress(character) {
    if (!character) return;
    this.el.level.textContent = `Nv. ${character.level}`;
    this.el.xpFill.style.width = `${character.xpPercent * 100}%`;
    this.el.xpText.textContent = `${character.xpIntoLevel} / ${character.xpForNextLevel} XP`;
    this.el.gold.textContent = `Ouro: ${character.gold}`;
  }

  setHP(hp, max) {
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
    this.el.hpFill.style.width = pct + '%';
    this.el.hpText.textContent = Math.ceil(hp) + ' / ' + max;
    if (this.el.hpOrbFill) this.el.hpOrbFill.style.height = pct + '%';
    if (this.el.hpOrbText) this.el.hpOrbText.textContent = Math.ceil(hp);
    this.el.vignette.classList.toggle('low', hp > 0 && hp / Math.max(1, max) < 0.3);
  }

  setMana(mana, max) {
    if (!this.el.manaFill || !this.el.manaText) return;
    const safeMax = Math.max(1, Number(max) || 1);
    const safeMana = Math.max(0, Math.min(safeMax, Number(mana) || 0));
    const pct = (safeMana / safeMax) * 100;
    this.el.manaFill.style.width = pct + '%';
    this.el.manaText.textContent = Math.ceil(safeMana) + ' / ' + safeMax;
    if (this.el.manaOrbFill) this.el.manaOrbFill.style.height = pct + '%';
    if (this.el.manaOrbText) this.el.manaOrbText.textContent = Math.ceil(safeMana);
  }
  setCooldown(which, frac) {
    const el = { attack: this.el.skAttack, ability: this.el.skAbility, dash: this.el.skDash }[which];
    el.firstChild.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    el.classList.toggle('ready', frac <= 0);
  }
  hurtFlash() {
    this.el.vignette.classList.add('hurt');
    clearTimeout(this.hurtT);
    this.hurtT = setTimeout(() => this.el.vignette.classList.remove('hurt'), 160);
  }
  setQuestTimeline(stages, currentIndex) {
    if (!this.el.questTimeline) return;
    this.el.questTimeline.innerHTML = stages.map((stage, i) => {
      const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'locked';
      const label = typeof stage.timeline === 'string' ? stage.timeline : stage.id;
      const icon = state === 'done' ? '✓' : state === 'current' ? '◆' : '○';
      return '<div class="quest-step ' + state + '"><span class="quest-step-icon">' + icon + '</span><span>' + label + '</span></div>';
    }).join('');
  }

  setObjective(text, hint = '') {
    this.el.objText.textContent = text;
    this.el.objHint.textContent = hint;
    this.el.objective.classList.remove('pulse');
    void this.el.objective.offsetWidth;
    this.el.objective.classList.add('pulse');
  }
  toast(text, dur = 3.2) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.el.toasts.appendChild(el);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 500); }, dur * 1000);
  }

  showShopFeedback(text, error = false) {
    const el = this.el.shopFeedback;
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', !!error);
    el.classList.add('show');
    clearTimeout(this.shopFeedbackTimer);
    this.shopFeedbackTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  banner(title, sub = '', cls = '', dur = 3.5) {
    const b = this.el.banner;
    b.className = cls;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    void b.offsetWidth;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      b.classList.add('fade');
      this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 1000);
    }, dur * 1000);
  }
  showBoss(name) { this.el.bossBar.classList.remove('hidden', 'enraged'); this.el.bossName.textContent = name; this.setBoss(1); }
  setBoss(frac, enraged = false) { this.el.bossFill.style.width = `${Math.max(0, frac) * 100}%`; this.el.bossBar.classList.toggle('enraged', enraged); }
  hideBoss() { this.el.bossBar.classList.add('hidden'); }
  showDeath(on) { this.el.death.classList.toggle('hidden', !on); }
  fade(on, white = false) { this.el.fade.classList.toggle('white', white); this.el.fade.classList.toggle('on', on); }

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

  setAssetLoadingProgress(percent, label = 'Carregando gráficos...') {
    const button = $('start-btn');
    if (!button) return;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    button.disabled = p < 100;
    button.textContent = p < 100 ? label + ' ' + p + '%' : 'Entrar na floresta';
    button.setAttribute('aria-busy', p < 100 ? 'true' : 'false');
  }

  showMapLoading(title = 'Preparando mapa...', percent = 0, detail = 'Preparando recursos') {
    let panel = $('map-transition-loading');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'map-transition-loading';
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      Object.assign(panel.style, {
        position: 'fixed', inset: '0', zIndex: '10000', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5, 10, 12, 0.97)', color: '#e8e0cc',
        fontFamily: 'system-ui, sans-serif', letterSpacing: '0.08em',
        textAlign: 'center', padding: '24px', boxSizing: 'border-box',
      });
      panel.innerHTML = '<div id="map-loading-title" style="font-size:clamp(18px,3vw,28px);font-weight:700;margin-bottom:18px"></div><div style="width:min(420px,82vw);height:8px;background:#26322f;border:1px solid #52635c;border-radius:8px;overflow:hidden"><div id="map-loading-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#b87939,#e6c77b);transition:width .12s linear"></div></div><div id="map-loading-detail" style="font-size:12px;margin-top:12px;color:#aebdb5"></div><div id="map-loading-percent" style="font-size:12px;margin-top:6px;color:#e6c77b">0%</div>';
      document.body.appendChild(panel);
    }
    panel.style.display = 'flex';
    $('map-loading-title').textContent = title;
    $('map-loading-detail').textContent = detail;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    $('map-loading-fill').style.width = p + '%';
    $('map-loading-percent').textContent = p + '%';
  }

  updateMapLoading(percent, detail) {
    const panel = $('map-transition-loading');
    if (!panel) return;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    $('map-loading-fill').style.width = p + '%';
    $('map-loading-percent').textContent = p + '%';
    if (detail) $('map-loading-detail').textContent = detail;
  }

  hideMapLoading() {
    const panel = $('map-transition-loading');
    if (panel) panel.style.display = 'none';
  }
}
