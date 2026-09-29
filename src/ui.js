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
      objective: $('objective'), objText: $('obj-text'), objHint: $('obj-hint'),
      bossBar: $('boss-bar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      toasts: $('toasts'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      vignette: $('vignette'), death: $('death'), fade: $('fade'), help: $('help'),
      skAttack: $('sk-attack'), skAbility: $('sk-ability'), skDash: $('sk-dash'),
      inventory: $('inventory'), inventoryGrid: $('inventory-grid'), inventoryCount: $('inventory-count'),
      profile: $('profile'), profileBody: $('profile-body'),
    };
    this.prompt = this.anchor('prompt');
    this.bubble = this.anchor('bubble');
    this.bubble.el.innerHTML = '<div class="bname"></div><div class="btext"></div><div class="bhint">[E] continuar</div>';
    this.bannerTimer = null;
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
  damageNumber(pos, amount, cls) { this.floatText(pos, String(amount), cls, cls === 'crit' ? 1.1 : 0.85); }

  project(pos) {
    v.copy(pos).project(this.game.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, ok: v.z < 1 };
  }

  update(dt) {
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

  // ---------- HUD ----------
  showHud(voc, character = null) {
    this.el.hud.classList.remove('hidden');
    this.el.pname.innerHTML = `${voc.name}<small>${voc.title}</small>`;
    this.el.portrait.style.setProperty('--vc', voc.color);
    this.el.portrait.textContent = voc.name[0];
    this.el.skAttack.querySelector('.label').textContent = voc.attack.name;
    this.el.skAbility.querySelector('.label').textContent = voc.ability.name;
    this.setProgress(character);
    setTimeout(() => (this.el.help.style.opacity = 0.35), 25000);
  }
  toggleHelp() { this.el.help.classList.toggle('hidden'); }

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
    const slots = character.inventory;
    this.el.inventoryCount.textContent = slots.length + ' / 24 espaços';

    for (const slot of slots) {
      const item = this.game.getItem(slot.id);
      if (!item) continue;

      const el = document.createElement('button');
      el.className = 'inv-slot' + (item.effect ? ' usable' : '');
      el.type = 'button';
      el.title = item.name + ' — ' + item.description;
      el.innerHTML = '<img class="inv-icon" alt=""><span class="inv-name"></span><span class="inv-qty">x' + slot.qty + '</span>';
      if (item.sprite) el.querySelector('.inv-icon').src = item.sprite;
      el.querySelector('.inv-name').textContent = item.name;
      el.onclick = () => this.game.equipItem(slot.id) || this.game.useItem(slot.id);
      grid.appendChild(el);
    }

    for (let i = slots.length; i < 24; i++) {
      const empty = document.createElement('div');
      empty.className = 'inv-slot empty';
      grid.appendChild(empty);
    }
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
      '<div class="profile-section-title">Equipamento</div>' +
      '<div class="profile-grid profile-resources"><div><span>Arma</span><b>' + (character.equipment?.weapon ? (this.game.getItem(character.equipment.weapon)?.name || '—') : '—') + '</b></div><div><span>Armadura</span><b>' + (character.equipment?.armor ? (this.game.getItem(character.equipment.armor)?.name || '—') : '—') + '</b></div></div>' +
      '<div class="profile-section-title">Recursos</div>' +
      '<div class="profile-grid profile-resources">' +
        '<div><span>Inventário</span><b>' + character.inventorySlots + ' / 24</b></div>' +
      '</div>';
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
    const list = $('voc-list'), desc = $('voc-desc');
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
