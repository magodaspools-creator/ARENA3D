import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Collision } from './collision.js';
import { Effects } from './effects.js';
import { Combat } from './combat.js';
import { UI } from './ui.js';
import { Interaction } from './interaction.js';
import { Dialogue } from './npc.js';
import { Player } from './player.js';
import { VOCATIONS } from './vocations.js';
import { CharacterState } from './character-state.js';
import { getItem } from './items.js';
import { GroundLoot, DeathBackpack } from './ground-loot.js';
import { createArea1 } from './areas/area1.js';
import { createArea2 } from './areas/area2.js';
import { MapEditor } from './map-editor.js';

const FOG = 0x0b1220; // Scene background only; local mist is handled by individual areas.

class Game {
  constructor() {
    const container = document.getElementById('game');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = null; // Do not fog the entire map; secret-room mist is local to Area 1.
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 220);

    this.setupLights();

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.48, 0.5, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.time = 0;
    this.frame = 0;
    this.timers = [];
    this.hitstop = 0;
    this.state = 'select';
    this.inputLocked = false;
    this.stats = { kills: 0, deaths: 0, damage: 0, start: 0, bossTime: 0 };

    this.input = new Input(renderer.domElement);
    this.ui = new UI(this);
    this.rig = new CameraRig(this.camera);
    this.collision = new Collision();
    this.fx = new Effects(this);
    this.combat = new Combat(this);
    this.interaction = new Interaction(this);
    this.dialogue = new Dialogue(this);
    this.enemies = [];
    this.npcs = [];
    this.groundLoot = [];
    this.deathBackpacks = [];

    this.area = createArea1(this);
    this.returnArea = null;
    this.startArea = this.area;
    this.player = null;
    this.character = null;

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    // Hidden development tool: opens only with Ctrl+Shift+T.
    this.mapEditor = new MapEditor(this);

    addEventListener('resize', () => this.resize());
    addEventListener('beforeunload', () => this.saveWorldState());
    addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        this.mapEditor.toggle();
        return;
      }
      if (this.mapEditor.active && this.mapEditor.handleKey(e)) return;
      if (e.code === 'Escape' && this.state === 'map-editor') { e.preventDefault(); this.mapEditor.toggle(false); return; }
      if (e.code === 'Escape' && this.state === 'play') { e.preventDefault(); this.pauseGame(); return; }
      if (e.code === 'Escape' && this.state === 'pause-controls') { e.preventDefault(); this.showPauseMenu(); return; }
      if (e.code === 'Escape' && this.state === 'pause') { e.preventDefault(); this.resumeGame(); return; }
      if (e.code === 'KeyH' && this.state === 'play') this.ui.toggleHelp();

      // Hidden admin testing tool: revive the optional mine boss without
      // resetting the character. This is intentionally gated by the same
      // admin password used by the map editor.
      if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyR' && this.state === 'play') {
        e.preventDefault();
        const password = prompt('Senha de administrador:');
        if (password === 't88415890') {
          if (this.area?.reviveMineBossForTesting) this.area.reviveMineBossForTesting();
          else this.ui.toast('A ferramenta de teste só funciona na área da Mina.');
        } else if (password !== null) {
          this.ui.toast('Senha incorreta.');
        }
        return;
      }
      if (e.code.startsWith('Digit') && this.state === 'play') {
        const slot = Number(e.code.slice(5));
        if (slot >= 1 && slot <= 6) {
          e.preventDefault();
          this.useActionBarSlot(slot - 1);
        }
      }
      if (e.code === 'KeyI' && (this.state === 'play' || this.state === 'inventory')) this.toggleInventory();
      if (e.code === 'KeyP' && (this.state === 'play' || this.state === 'profile')) this.toggleProfile();
      if (e.code === 'Escape' && (this.state === 'inventory' || this.state === 'profile')) this.closeOverlay();
      if (e.code === 'Escape' && this.state === 'shop') this.closeShop();
    });
    this.ui.showSelect(VOCATIONS, (id) => this.preview(id), (id) => this.start(id));
    this.fx.resize(renderer.getDrawingBufferSize(new THREE.Vector2()).y);

    document.getElementById('again-btn').onclick = () => location.reload();
    document.getElementById('stay-btn').onclick = () => {
      document.getElementById('complete').classList.add('hidden');
      this.ui.fade(false);
      this.state = 'play';
      this.inputLocked = false;
    };
    document.getElementById('inventory-btn').onclick = () => this.toggleInventory();
    document.getElementById('inventory-close').onclick = () => this.closeOverlay();
    document.getElementById('profile-close').onclick = () => this.closeOverlay();
    document.getElementById('shop-close').onclick = () => this.closeShop();
    document.getElementById('pause-resume').onclick = () => this.resumeGame();
    document.getElementById('pause-controls-btn').onclick = () => this.showPauseControls();
    document.getElementById('map-editor-btn').onclick = () => {
      const password = prompt('Senha do Editor de mapa:');
      if (password !== 't88415890') {
        if (password !== null) this.ui.toast('Senha incorreta.');
        return;
      }
      this.ui.hidePause();
      this.mapEditor.toggle(true);
    };
    document.getElementById('pause-menu').onclick = () => this.returnToCharacterSelect();
    document.getElementById('controls-back').onclick = () => this.showPauseMenu();
    document.getElementById('shop-cancel').onclick = () => this.closeShop();

    this.clock = new THREE.Clock();
    document.getElementById('loading').remove();
    renderer.setAnimationLoop(() => this.loop());
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0x3a4d78, 0x1a2414, 1.1));
    const moon = new THREE.DirectionalLight(0xa9bcff, 1.5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const s = moon.shadow.camera;
    s.left = -28; s.right = 28; s.top = 28; s.bottom = -28; s.near = 1; s.far = 90;
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.03;
    this.moonOffset = new THREE.Vector3(-18, 34, 14);
    this.scene.add(moon, moon.target);
    this.moon = moon;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.fx.resize(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  }

  // ---------- world persistence ----------
  worldStorageKey() {
    const vocation = this.character?.vocation;
    return vocation ? `arena.world.v1.${vocation}` : null;
  }

  saveWorldState() {
    const key = this.worldStorageKey();
    if (!key || !this.area) return;
    try {
      const checkpoint = this.area.checkpoint || this.area.spawn;
      localStorage.setItem(key, JSON.stringify({
        area: this.area === this.startArea ? 'area1' : 'area2',
        checkpoint: {
          x: Number(checkpoint?.x) || 0,
          z: Number(checkpoint?.z) || 0,
          facing: Number(checkpoint?.facing) || 0,
        },
        bossDefeated: this.area === this.startArea ? false : this.area.boss?.state === 'dead',
      }));
    } catch {}
  }

  loadWorldState() {
    const key = this.worldStorageKey();
    if (!key) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (!saved || (saved.area !== 'area1' && saved.area !== 'area2')) return null;
      return saved;
    } catch {
      return null;
    }
  }

  // ---------- flow ----------
  preview(id) {
    this.player?.dispose();
    this.character = new CharacterState(id);
    this.player = new Player(this, id);
    const s = this.area.spawn;
    this.player.place(s.x, s.z, 0);
    this.rig.mode = 'preview';
    this.rig.snap(this.player.pos);
    this.player.anim.attack(this.player.voc.attack.style, 0.8);
  }

  start(id) {
    if (!this.player || this.player.voc.id !== id) this.preview(id);

    const saved = this.loadWorldState();
    if (saved?.area === 'area2') {
      this.returnEnemies = this.enemies;
      this.enemies = [];
      const area2 = createArea2(this);
      this.area = area2;
      this.returnArea = this.startArea;
      const s = saved.checkpoint || area2.checkpoint || area2.spawn;
      this.player.place(s.x, s.z, s.facing);
      area2.restoreState?.(saved);
    } else {
      this.area = this.startArea;
      this.returnArea = null;
      const s = saved?.checkpoint || this.area.checkpoint || this.area.spawn;
      this.player.place(s.x, s.z, s.facing);
    }

    this.rig.mode = 'follow';
    this.state = 'play';
    this.stats.start = this.time;
    this.player.character = this.character;
    this.ui.showHud(this.player.voc, this.character);
    this.area.onStart();
    this.saveWorldState();
    this.spawnPendingDeathBackpacks();
  }

  enterArea2() {
    if (this.state !== 'play' || this.inputLocked || this.area?.name === 'Deserto do Sol Sepultado') return;

    this.returnArea = this.area;
    this.returnEnemies = this.enemies;
    this.enemies = [];
    this.inputLocked = true;
    this.ui.hidePrompt();
    this.ui.fade(true);

    this.schedule(0.75, () => {
      const area2 = createArea2(this);
      this.area = area2;
      this.player.place(area2.spawn.x, area2.spawn.z, area2.spawn.facing);
      this.rig.snap(this.player.pos);
      this.area.onStart();
      this.saveWorldState();
    });

    this.schedule(1.45, () => {
      this.ui.fade(false);
      this.inputLocked = false;
    });
  }

  enterPreviousArea() {
    if (this.state !== 'play' || this.inputLocked || !this.returnArea) return;

    const target = this.returnArea;
    const currentArea = this.area;
    this.inputLocked = true;
    this.ui.hidePrompt();
    this.dialogue.close(false);
    this.ui.fade(true);

    this.schedule(0.75, () => {
      currentArea?.dispose?.();
      this.area = target;
      this.enemies = this.returnEnemies || this.enemies;
      this.returnEnemies = null;
      const spawn = target.checkpoint || target.spawn;
      this.player.place(spawn.x, spawn.z, spawn.facing);
      this.rig.snap(this.player.pos);
      this.area.onStart();
      this.saveWorldState();
    });

    this.schedule(1.45, () => {
      this.ui.fade(false);
      this.inputLocked = false;
    });
  }

  addEnemy(e) { this.enemies.push(e); return e; }

  onEnemyKilled(e, loot = []) {
    if (!e.isBoss) {
      this.stats.kills++;
      this.player?.gainUltimate?.(8);
      const reward = e.rewards || { xp: 0, gold: 0 };
      this.rewardCharacter(reward.xp, reward.gold);
      this.spawnGroundLoot(loot, e.pos);
    }
    this.area.onEnemyKilled(e);
  }

  onBossDefeated(reward = { xp: 0, gold: 0, loot: [] }, dropPos = this.player?.pos) {
    this.rewardCharacter(reward.xp, reward.gold);
    this.spawnGroundLoot(reward.loot || [], dropPos);
  }

  spawnGroundLoot(drops = [], pos) {
    if (!pos) return;
    for (const drop of drops) {
      const amount = Math.max(1, Math.floor(drop.amount || 1));
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.35 + Math.random() * 0.65;
      const dropPos = { x: pos.x + Math.cos(angle) * distance, z: pos.z + Math.sin(angle) * distance };
      this.groundLoot.push(new GroundLoot(this, drop.itemId, amount, dropPos));
    }
  }

  collectGroundLoot(drop) {
    const result = drop.collect();
    if (!result) return false;
    this.groundLoot = this.groundLoot.filter((item) => item !== drop && !item.dead);
    return true;
  }

  spawnDeathBackpack(drop) {
    if (!drop) return;
    this.deathBackpacks.push(new DeathBackpack(this, drop));
  }

  spawnPendingDeathBackpacks() {
    for (const drop of this.character?.deathDrops || []) this.spawnDeathBackpack(drop);
  }


  getItem(itemId) {
    return getItem(itemId);
  }

  equipItem(itemId) {
    if (!this.character) return false;
    const result = this.character.equip(itemId);
    if (!result.ok) {
      if (result.reason === 'wrong_vocation') this.ui.toast('Esse equipamento não pertence à sua vocação.');
      return false;
    }
    this.ui.toast('Equipado: ' + (getItem(itemId)?.name || itemId));
    this.ui.setInventory(this.character);
    return true;
    this.ui.setProgress(this.character);
    if (this.state === 'profile') this.ui.showProfile(this.character);
  }

  unequipItem(slot) {
    if (!this.character) return;
    const result = this.character.unequip(slot);
    if (!result.ok) {
      if (result.reason === 'inventory_full') this.ui.toast('Sem espaço no inventário.');
      return;
    }
    this.ui.toast('Desequipado: ' + (getItem(result.itemId)?.name || result.itemId));
    this.ui.setInventory(this.character);
    this.ui.setProgress(this.character);
    if (this.state === 'profile') this.ui.showProfile(this.character);
  }

  useItem(itemId) {
    if (!this.character || !this.player || this.player.dead) return false;
    const item = getItem(itemId);
    if (!item?.effect) {
      this.ui.toast('Esse item não pode ser usado agora.');
      return false;
    }
    if (item.effect.type === 'healPercent') {
      if (this.player.hp >= this.player.maxHp) {
        this.ui.toast('Sua vida já está cheia.');
        return false;
      }
      if (!this.character.removeItem(itemId, 1)) return false;
      this.player.heal(this.player.maxHp * item.effect.value, true);
      this.ui.setInventory(this.character);
      this.ui.setActionBar(this.character);
      return true;
    }

    if (item.effect.type === 'restoreMana') {
      if (this.player.mana >= this.player.maxMana) {
        this.ui.toast('Sua mana já está cheia.');
        return false;
      }
      const restored = this.player.restoreMana(item.effect.value);
      if (restored <= 0) return false;
      if (!this.character.removeItem(itemId, 1)) return false;
      this.ui.setInventory(this.character);
      this.ui.setActionBar(this.character);
      this.ui.floatText(new THREE.Vector3(this.player.pos.x, 2.55, this.player.pos.z), '+' + Math.round(restored) + ' MANA', 'mana', 1.0);
      return true;
    }

    return false;
  }

  useActionBarSlot(index) {
    if (!this.character || !this.player || this.player.dead) return false;
    const itemId = this.character.actionBar?.[index];
    if (!itemId) return false;
    const used = this.useItem(itemId);
    if (used) this.ui.flashActionBarSlot(index);
    return used;
  }

  pauseGame() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.inputLocked = true;
    this.ui.showPause();
  }

  resumeGame() {
    if (this.state !== 'pause' && this.state !== 'pause-controls') return;
    this.ui.hidePauseControls();
    this.ui.hidePause();
    this.state = 'play';
    this.inputLocked = false;
  }

  showPauseControls() {
    if (this.state !== 'pause') return;
    this.state = 'pause-controls';
    this.ui.showPauseControls();
  }

  showPauseMenu() {
    this.ui.hidePauseControls();
    this.state = 'pause';
    this.ui.showPause();
  }

  returnToCharacterSelect() {
    this.saveWorldState();
    if (this.area !== this.startArea) {
      this.area?.dispose?.();
      this.enemies = this.returnEnemies || [];
      this.returnEnemies = null;
      this.area = this.startArea;
    }
    this.ui.hidePauseControls();
    this.ui.hidePause();
    this.ui.hideInventory();
    this.ui.hideProfile();
    this.ui.hideShop();
    this.state = 'select';
    this.inputLocked = false;
    this.player?.dispose();
    this.player = null;
    this.character = null;
    this.enemies = [];
    this.npcs = [];
    this.groundLoot = [];
    this.deathBackpacks = [];
    this.ui.el.hud.classList.add('hidden');
    this.ui.showSelect(VOCATIONS, (id) => this.preview(id), (id) => this.start(id));
  }

  openShop({ npcName, stock = [] }) {
    if (!this.character || this.player?.dead || !stock.length) return;
    this.state = 'shop';
    this.inputLocked = true;

    const sellPrice = (item) => Math.max(1, Math.floor(Number(item?.value || 0) * 0.30));
    let shopMode = 'buy';
    let shopScrollTop = 0;

    const buildSellStock = () => {
      const byId = new Map();

      for (const slot of this.character.inventory) {
        const item = getItem(slot.id);
        if (!item || item.category === 'quest' || item.sellable === false) continue;
        const entry = byId.get(item.id) || { item, owned: 0, equipped: 0, price: sellPrice(item) };
        entry.owned += slot.qty;
        byId.set(item.id, entry);
      }

      // Equipamentos atualmente usados ficam protegidos contra venda.
      // Apenas cópias que estão na mochila entram no estoque de venda.


      return [...byId.values()].sort((a, b) => a.item.name.localeCompare(b.item.name, 'pt-BR'));
    };

    const render = (mode = shopMode, scrollTop = shopScrollTop) => {
      shopMode = mode === 'sell' ? 'sell' : 'buy';
      shopScrollTop = Math.max(0, Number(scrollTop) || 0);

      const available = stock
        .map((entry) => ({ ...entry, item: getItem(entry.itemId), owned: this.character.getItemCount(entry.itemId) }))
        .filter((entry) => entry.item);

      this.ui.showShop({
        npcName,
        stock: available,
        sellStock: buildSellStock(),
        initialMode: shopMode,
        initialScrollTop: shopScrollTop,
        onModeChange: (mode) => {
          shopMode = mode === 'sell' ? 'sell' : 'buy';
          shopScrollTop = 0;
        },
        onBuy: (itemId, price, quantity = 1) => {
          const item = getItem(itemId);
          if (!item) return;

          const qty = Math.max(1, Math.floor(Number(quantity) || 1));
          const cost = Math.max(0, Math.floor(price || 0)) * qty;

          if (this.character.gold < cost) {
            this.ui.showShopFeedback('Você precisa de ' + cost + ' ouro para comprar ' + qty + 'x ' + item.name + '.', true);
            return;
          }

          const added = this.character.addItem(itemId, qty, item.maxStack || 99);
          if (added.added < qty) {
            if (added.added > 0) this.character.removeItem(itemId, added.added);
            this.ui.showShopFeedback('Sem espaço para comprar ' + qty + 'x ' + item.name + '.', true);
            return;
          }

          const payment = this.character.spendGold(cost);
          if (!payment.ok) {
            this.character.removeItem(itemId, qty);
            this.ui.showShopFeedback('A compra não pôde ser concluída.', true);
            return;
          }

          shopScrollTop = this.ui.el.shopItem?.scrollTop || shopScrollTop;
          this.ui.setProgress(this.character);
          this.ui.setInventory(this.character);
          this.ui.setActionBar(this.character);
          render(shopMode, shopScrollTop);
          this.ui.showShopFeedback('Comprado: ' + qty + 'x ' + item.name + ' · -' + cost + ' ouro');
          this.ui.showShopAmount('-' + cost, itemId);
          this.fx.ring(this.player.pos, 0x9affdd, 1.2, 0.55, 0.7);
        },
        onSellAllItem: (itemId, price) => {
          const item = getItem(itemId);
          if (!item || item.category === 'quest' || item.sellable === false) return;

          const unitValue = Math.max(1, Math.floor(price || sellPrice(item)));
          const inventoryOwned = this.character.getItemCount(itemId);
          let sold = 0;

          if (inventoryOwned > 0) {
            const result = this.character.sellItem(itemId, inventoryOwned);
            if (result.ok) sold += result.quantity;
          }

          if (!sold) {
            this.ui.showShopFeedback('Esse item não está mais disponível para venda.', true);
            return;
          }

          const totalValue = unitValue * sold;
          this.character.addGold(totalValue);
          shopScrollTop = this.ui.el.shopItem?.scrollTop || shopScrollTop;
          this.ui.setProgress(this.character);
          this.ui.setInventory(this.character);
          this.ui.setActionBar(this.character);
          render('sell', shopScrollTop);
          this.ui.showShopFeedback('Vendido tudo: ' + sold + 'x ' + item.name + ' · +' + totalValue + ' ouro');
          this.ui.showShopAmount('+' + totalValue, itemId);
          this.fx.ring(this.player.pos, 0xffd36a, 1.2, 0.55, 0.7);
        },
        onSell: (itemId, price, quantity = 1) => {
          const item = getItem(itemId);
          if (!item || item.category === 'quest' || item.sellable === false) return;

          const requested = Math.max(1, Math.floor(Number(quantity) || 1));
          const unitValue = Math.max(1, Math.floor(price || sellPrice(item)));
          const inventoryOwned = this.character.getItemCount(itemId);

          let remaining = requested;
          let sold = 0;

          if (inventoryOwned > 0) {
            const inventoryResult = this.character.sellItem(itemId, Math.min(remaining, inventoryOwned));
            if (inventoryResult.ok) sold += inventoryResult.quantity;
            remaining -= inventoryResult.quantity || 0;
          }


          if (!sold) {
            this.ui.showShopFeedback('Esse item não está mais disponível para venda.', true);
            return;
          }

          const totalValue = unitValue * sold;
          this.character.addGold(totalValue);
          shopScrollTop = this.ui.el.shopItem?.scrollTop || shopScrollTop;
          this.ui.setProgress(this.character);
          this.ui.setInventory(this.character);
          this.ui.setActionBar(this.character);
          render(shopMode, shopScrollTop);
          this.ui.showShopFeedback('Vendido: ' + sold + 'x ' + item.name + ' · +' + totalValue + ' ouro');
          this.ui.showShopAmount('+' + totalValue, itemId);
          this.fx.ring(this.player.pos, 0xffd36a, 1.2, 0.55, 0.7);
        },
        onClose: () => this.closeShop(),
      });
    };

    render();
  }
  openPotionShop({ npcName, itemId = 'red_potion', price = 20 }) {
    this.openShop({
      npcName,
      stock: [{ itemId, price }],
    });
  }

  closeShop() {
    if (this.state !== 'shop') return;
    this.ui.hideShop();
    this.state = 'play';
    this.inputLocked = false;
  }

  toggleInventory() {
    if (this.state === 'profile') this.ui.hideProfile();
    if (this.state === 'play') {
      this.state = 'inventory';
      this.inputLocked = true;
      this.ui.showInventory(this.character);
    } else if (this.state === 'inventory') {
      this.closeOverlay();
    }
  }

  toggleProfile() {
    if (this.state === 'inventory') this.ui.hideInventory();
    if (this.state === 'play') {
      this.state = 'profile';
      this.inputLocked = true;
      this.ui.showProfile(this.character);
    } else if (this.state === 'profile') {
      this.closeOverlay();
    }
  }

  closeOverlay() {
    if (this.state !== 'inventory' && this.state !== 'profile') return;
    this.ui.hideInventory();
    this.ui.hideProfile();
    this.state = 'play';
    this.inputLocked = false;
  }

  rewardCharacter(xp, gold) {
    if (!this.character) return;
    const result = this.character.addXP(xp);
    const coins = this.character.addGold(gold);
    if (result.gained) {
      this.ui.toast(`+${result.gained} XP`);
      if (result.levels > 0) {
        this.ui.banner(`LEVEL ${this.character.level}`, 'Seu personagem ficou mais experiente.', 'victory', 2.4);
      }
    }
    if (coins) this.ui.toast(`+${coins} ouro`);
    this.ui.setProgress(this.character);
  }

  onPlayerDied() {
    if (this.state === 'dead' || this.player?.dead !== true) return;

    this.state = 'dead';
    this.inputLocked = true;
    this.stats.deaths++;
    this.combat.clearEnemyProjectiles();
    // Boss UI belongs to the current combat encounter. When the player dies,
    // the area may reset the boss before respawn, so never leave a stale HP bar.
    this.ui.hideBoss();

    const xpLoss = this.character?.loseXP(0.10);
    const deathDrop = this.character?.createDeathDrop(this.player?.pos);
    if (deathDrop) this.spawnDeathBackpack(deathDrop);
    this.ui.setProgress(this.character);
    if (xpLoss?.lost) {
      const levelText = xpLoss.level !== xpLoss.oldLevel ? ' · Nível ' + xpLoss.oldLevel + ' → ' + xpLoss.level : '';
      this.ui.toast('Morte: -' + xpLoss.lost + ' XP' + levelText, 4);
    }

    this.schedule(1.0, () => this.ui.showDeath(true));
    this.schedule(2.8, () => this.ui.fade(true));
    this.schedule(3.7, () => {
      if (!this.player?.dead) return;
      const c = this.area.checkpoint;
      this.area.onRespawn();
      for (const e of this.enemies) if (!e.isBoss && e.alive && e.state !== 'idle') e.state = 'return';
      this.player.revive(c.x, c.z, c.facing);
      this.rig.snap(this.player.pos);
      this.state = 'play';
      this.inputLocked = false;
      this.ui.showDeath(false);
      this.ui.fade(false);
      this.ui.setProgress(this.character);
      this.ui.toast('Você desperta junto ao último ponto seguro.');
    });
  }

  completeArea() {
    this.inputLocked = true;
    this.ui.fade(true, true);
    this.schedule(1.4, () => {
      this.state = 'complete';
      const t = Math.round(this.time - this.stats.start);
      document.getElementById('stats').innerHTML = [
        ['Vocação', this.player.voc.name], ['Tempo', `${Math.floor(t / 60)}m ${t % 60}s`],
        ['Inimigos', this.stats.kills], ['Mortes', this.stats.deaths], ['Luta contra o boss', `${Math.round(this.stats.bossTime)}s`],
      ].map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
      document.getElementById('complete').classList.remove('hidden');
    });
  }

  schedule(delay, fn) { this.timers.push({ t: delay, fn }); }

  aimPoint() {
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.mouse.ndcX, this.input.mouse.ndcY), this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, out) ?? this.player.pos.clone();
  }

  /** Keep bodies from overlapping: player vs enemies and enemies vs each other. */
  resolveBodies() {
    const p = this.player;
    const list = this.enemies.filter((e) => e.alive && e.pos.y < 0.5);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (p && !p.dead) {
        // A boss that is currently airborne must own its leap space. Do not
        // run player/boss body separation during the pounce; the attack itself
        // handles the hit radius on landing.
        if (a.state !== 'pounce') {
          const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + p.radius;
          if (d < min && d > 1e-4) this.collision.move(p.pos, (dx / d) * (min - d), (dz / d) * (min - d), p.radius);
        }
      }
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2;
          if (!b.isBoss) this.collision.move(b.pos, (dx / d) * push, (dz / d) * push, b.radius);
          if (!a.isBoss) this.collision.move(a.pos, (-dx / d) * push, (-dz / d) * push, a.radius);
        }
      }
    }
  }

  loop() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.08; }
    this.time += dt;
    this.frame++;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    const p = this.player;
    if (p) {
      if (this.state === 'select') {
        p.root.rotation.y += dt * 0.5;
        p.anim.update(dt, 0);
      } else if (this.state === 'play') {
        p.update(dt);
      }
    }
    if (this.state === 'play') {
      for (const drop of this.groundLoot) drop.update(dt);
      this.groundLoot = this.groundLoot.filter((drop) => !drop.dead);
      for (const backpack of this.deathBackpacks) backpack.update(dt);
      this.deathBackpacks = this.deathBackpacks.filter((backpack) => !backpack.dead);
      for (const e of this.enemies) e.update(dt);
      this.enemies = this.enemies.filter((e) => !e.removed);
      this.resolveBodies();
      this.combat.update(dt);
      this.interaction.update();
      this.dialogue.update(dt);
    }
    // The map editor is a frozen authoring mode. Gameplay/world animation
    // must not continue changing underneath the working copy.
    if (this.state !== 'map-editor') {
      for (const n of this.npcs) n.update(dt);
      this.area.update(dt, this.time);
      this.fx.update(dt);
    }

    if (p) {
      if (this.state === 'map-editor' && this.mapEditor?.active) {
        this.mapEditor.updateNavigation(dt);
        this.rig.update(dt, this.mapEditor.cameraFocus, null);
      } else {
        this.rig.update(dt, p.pos, this.state === 'play' && !this.inputLocked ? this.input : null);
      }
      this.moon.target.position.copy(p.pos);
      this.moon.position.copy(p.pos).add(this.moonOffset);
    }
    this.ui.update(dt);
    this.input.endFrame();
    this.composer.render();
  }
}

window.game = new Game();
