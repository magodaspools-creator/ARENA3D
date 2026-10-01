import * as THREE from 'three';

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
      hud: $('hud'), level: $('level'), xpFill: $('xp-fill'), xpText: $('xp-text'), gold: $('gold'), hpFill: $('hp-fill'), hpText: $('hp-text'), pname: $('pname'), portrait: $('portrait'),
      objective: $('objective'), objText: $('obj-text'), objHint: $('obj-hint'), questTimeline: $('quest-timeline'),
      bossBar: $('boss-bar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      toasts: $('toasts'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      vignette: $('vignette'), death: $('death'), fade: $('fade'), help: $('help'),
      skAttack: $('sk-attack'), skAbility: $('sk-ability'), skDash: $('sk-dash'),
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
    this.minimapCtx = this.el.minimap?.getContext('2d') || null;
    this.minimapLastT = 0;
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
  updateMinimap(force = false) {
    const canvas = this.el.minimap;
    const ctx = this.minimapCtx;
    const area = this.game.area;
    const p = this.game.player;
    if (!canvas || !ctx || !area?.minimap || !p) return;
    if (!force && this.game.time - this.minimapLastT < 0.08) return;
    this.minimapLastT = this.game.time;

    const w = canvas.width, h = canvas.height;
    const { minX, maxX, minZ, maxZ } = area.minimap.bounds;
    const underground = !!area.minimap.underground;
    const focusSpan = underground ? 42 : 46;
    const half = focusSpan * 0.5;

    // The old map showed the entire world at once, which made the player and
    // nearby routes microscopic. The minimap now behaves like a real navigation
    // map: it follows the player and keeps a useful local area in view.
    const centerX = Math.max(minX + half, Math.min(maxX - half, p.pos.x));
    const centerZ = Math.max(minZ + half, Math.min(maxZ - half, p.pos.z));
    const viewMinX = centerX - half;
    const viewMaxX = centerX + half;
    const viewMinZ = centerZ - half;
    const viewMaxZ = centerZ + half;
    const sx = w / (viewMaxX - viewMinX);
    const sy = h / (viewMaxZ - viewMinZ);
    const px = (x) => (x - viewMinX) * sx;
    const pz = (z) => (z - viewMinZ) * sy;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5, 8, 11, 0.94)';
    ctx.fillRect(0, 0, w, h);

    // Subtle coordinate grid gives the map a deliberate cartographic feel.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(205, 177, 116, 0.45)';
    ctx.lineWidth = 1;
    const gridStep = underground ? 5 : 6;
    for (let x = Math.ceil(viewMinX / gridStep) * gridStep; x <= viewMaxX; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(px(x), 0); ctx.lineTo(px(x), h); ctx.stroke();
    }
    for (let z = Math.ceil(viewMinZ / gridStep) * gridStep; z <= viewMaxZ; z += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, pz(z)); ctx.lineTo(w, pz(z)); ctx.stroke();
    }
    ctx.restore();

    // Walkable regions. The local zoom makes corridors and chambers readable.
    ctx.fillStyle = underground
      ? 'rgba(91, 103, 91, 0.62)'
      : 'rgba(83, 115, 83, 0.54)';
    for (const [x1, x2, z1, z2] of area.minimap.zones || []) {
      ctx.fillRect(px(x1), pz(z1), (x2 - x1) * sx, (z2 - z1) * sy);
    }

    // Main route / important structures.
    ctx.strokeStyle = underground
      ? 'rgba(202, 164, 102, 0.72)'
      : 'rgba(205, 177, 116, 0.68)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const path = underground
      ? [[110,101],[110,112],[101,116],[92,116],[84,123],[91,134],[105,139],[121,143],[132,143]]
      : [[0,46],[0.5,38],[-2.5,30],[1.5,22],[-0.5,14],[0,6],[0,-20],[0,-31],[0,-44]];
    path.forEach(([x,z], i) => i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z)));
    ctx.stroke();

    // Boss arena on the surface.
    if (!underground && area.minimap.arena) {
      const a = area.minimap.arena;
      ctx.beginPath();
      ctx.arc(px(a.x), pz(a.z), Math.max(4, a.r * sx), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(155, 47, 72, 0.38)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(225, 106, 125, 0.82)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(245, 210, 170, 0.9)';
      ctx.font = 'bold 10px Segoe UI, sans-serif';
      ctx.fillText('BOSS', px(a.x) + 7, pz(a.z) - 7);
    }

    // Surface secret chamber.
    if (!underground) {
      ctx.fillStyle = 'rgba(104, 164, 196, 0.48)';
      ctx.fillRect(px(24), pz(18), 14 * sx, 14 * sy);

      if (area.minimap.portal) {
        const portal = area.minimap.portal;
        ctx.fillStyle = '#71d9ff';
        ctx.beginPath();
        ctx.arc(px(portal.x), pz(portal.z), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(210, 245, 255, 0.95)';
        ctx.font = 'bold 10px Segoe UI, sans-serif';
        ctx.fillText('PORTAL', px(portal.x) + 7, pz(portal.z) + 4);
      }
    } else {
      // Mine exit is deliberately prominent so the player can always orient
      // himself relative to the way back out.
      const ex = { x: 110, z: 101 };
      ctx.fillStyle = 'rgba(113, 217, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(px(ex.x), pz(ex.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(210, 245, 255, 0.95)';
      ctx.font = 'bold 10px Segoe UI, sans-serif';
      ctx.fillText('SAÍDA', px(ex.x) + 8, pz(ex.z) + 4);
    }

    // Player marker is deliberately large and stays visually dominant.
    ctx.save();
    ctx.translate(px(p.pos.x), pz(p.pos.z));
    ctx.rotate(-p.facing);
    ctx.shadowColor = 'rgba(255, 235, 175, 0.75)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff2bd';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(8, -8);
    ctx.lineTo(0, -4);
    ctx.lineTo(-8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(15, 12, 8, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Border + compass. The stronger frame makes the minimap read as a
    // dedicated navigation element instead of a tiny debug widget.
    ctx.strokeStyle = 'rgba(232,199,122,0.78)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = 'rgba(245, 220, 160, 0.95)';
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.fillText('N', w - 18, 17);
  }

  // ---------- HUD ----------
  showHud(voc, character = null) {
    this.el.hud.classList.remove('hidden');
    this.el.pname.innerHTML = `${voc.name}<small>${voc.title}</small>`;
    this.el.portrait.style.setProperty('--vc', voc.color);
    this.el.portrait.textContent = voc.name[0];
    this.el.skAttack.querySelector('.label').textContent = voc.attack.name;
    this.el.skAbility.querySelector('.label').textContent = voc.ability.name;
    this.setProgress(character);
    this.setActionBar(character);
    setTimeout(() => (this.el.help.style.opacity = 0.35), 25000);
  }
  toggleHelp() { this.el.help.classList.toggle('hidden'); }
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
        ? 'Venda itens encontrados ou equipamentos que não deseja mais'
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
      el.onclick = () => this.game.equipItem(slot.id) || this.game.useItem(slot.id);
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
        const hasActionSource = Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < 6;

        if (hasActionSource) {
          // Dragging directly between action slots: move the item without opening the inventory.
          character.setActionBarSlot(sourceIndex, null);
        } else {
          // Dragging from the inventory keeps the existing duplicate-prevention behavior.
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
    this.el.hpFill.style.width = `${(hp / max) * 100}%`;
    this.el.hpText.textContent = `${Math.ceil(hp)} / ${max}`;
    this.el.vignette.classList.toggle('low', hp > 0 && hp / max < 0.3);
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
    $('start-btn').onclick = () => { $('select').classList.add('hidden'); onStart(current); };
    pick('knight');
  }
}
