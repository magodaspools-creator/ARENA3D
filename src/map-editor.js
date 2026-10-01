import * as THREE from 'three';
import { ITEMS } from './items.js';
import { listSharedMaps, publishSharedMap } from './map-editor-api.js';

const STORAGE_KEY = 'arena3d.map-editor.v1';
const CREATOR_ID_KEY = 'arena3d.map-editor.creator-id.v1';
const CREATOR_NAME_KEY = 'arena3d.map-editor.creator-name.v1';

const TERRAIN = [
  { id:'floor', name:'Chão', icon:'·', kind:'terrain', terrainType:'floor', collision:false, color:0x273329 },
  { id:'grass', name:'Grama', icon:'♣', kind:'terrain', terrainType:'grass', collision:false, color:0x30452d },
  { id:'dirt', name:'Terra', icon:'▪', kind:'terrain', terrainType:'dirt', collision:false, color:0x5a4030 },
  { id:'stone-floor', name:'Pedra', icon:'▦', kind:'terrain', terrainType:'stone-floor', collision:false, color:0x4a4d52 },
  { id:'stone-path', name:'Caminho pedra', icon:'▥', kind:'terrain', terrainType:'stone-path', collision:false, color:0x66666a },
  { id:'dirt-path', name:'Caminho terra', icon:'═', kind:'terrain', terrainType:'dirt-path', collision:false, color:0x75513a },
  { id:'mud', name:'Lama', icon:'≈', kind:'terrain', terrainType:'mud', collision:false, color:0x3e352d },
  { id:'sand', name:'Areia', icon:'░', kind:'terrain', terrainType:'sand', collision:false, color:0x8a7754 },
];

const BUILTIN = [
  { id: 'stone', name: 'Pedra', icon: '◆', kind: 'stone', collision: true },
  { id: 'wall', name: 'Parede', icon: '▰', kind: 'wall', collision: true },
  { id: 'crate', name: 'Caixote', icon: '▦', kind: 'crate', collision: true },
  { id: 'pillar', name: 'Pilar', icon: '▮', kind: 'pillar', collision: true },
  { id: 'ore', name: 'Minério', icon: '✦', kind: 'ore', collision: false },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class MapEditor {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.camera;
    this.renderer = game.renderer;
    this.ground = game.ground;
    this.raycaster = new THREE.Raycaster();
    this.group = new THREE.Group();
    this.group.name = 'MapEditorObjects';
    this.scene.add(this.group);

    this.objects = [];
    this.selected = null;
    this.active = false;
    this.palette = 'terrain';
    this.selectedTool = BUILTIN[0];
    this.seq = 0;
    this.selectionHelper = null;
    this.collisionHelpers = new Map();
    this.preview = null;
    this.sessionSnapshot = [];
    this.textureLoader = new THREE.TextureLoader();
    this.itemTextures = new Map();
    this.creatorId = this.getCreatorId();
    this.creatorName = localStorage.getItem(CREATOR_NAME_KEY) || '';

    this.buildUI();
    // Editor data is never injected into the live map at boot. It is loaded
    // only when the editor session is explicitly opened.
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.renderer.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  get itemTools() {
    return Object.values(ITEMS)
      .filter((item) => item?.sprite)
      .map((item) => ({
        id: 'item:' + item.id,
        name: item.name,
        kind: 'item',
        itemId: item.id,
        sprite: item.sprite,
        collision: false,
      }));
  }

  buildUI() {
    const root = document.createElement('div');
    root.id = 'map-editor';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="map-editor-panel">
        <div class="map-editor-head">
          <div>
            <div class="map-editor-kicker">FERRAMENTA OCULTA</div>
            <div class="map-editor-title">EDITOR DE MAPA</div>
            <div class="map-editor-status" id="map-editor-status">Ctrl+Shift+T para fechar</div>
          </div>
          <button id="map-editor-close" class="map-editor-close" type="button">×</button>
        </div>

        <div class="map-editor-tabs">
          <button type="button" data-editor-tab="terrain" class="active">Terreno</button>
          <button type="button" data-editor-tab="world">Objetos</button>
          <button type="button" data-editor-tab="items">Itens</button>
        </div>

        <div id="map-editor-palette" class="map-editor-palette"></div>

        <div class="map-editor-selected" id="map-editor-selected">Nenhum objeto selecionado.</div>

        <div class="map-editor-actions">
          <button type="button" data-editor-action="collision">Colisão ON/OFF</button>
          <button type="button" data-editor-action="rotate">Girar [R]</button>
          <button type="button" data-editor-action="scaleDown">− Escala</button>
          <button type="button" data-editor-action="scaleUp">+ Escala</button>
          <button type="button" data-editor-action="delete" class="danger">Apagar [Del]</button>
        </div>

        <div class="map-editor-save">
          <button type="button" data-editor-action="save">Salvar</button>
          <button type="button" data-editor-action="export">Exportar JSON</button>
          <button type="button" data-editor-action="import">Importar JSON</button>
          <button type="button" data-editor-action="clear" class="danger">Limpar criados</button>
          <input id="map-editor-file" type="file" accept="application/json,.json" hidden>
        </div>

        <div class="map-editor-online">
          <div class="map-editor-online-head">
            <div>
              <div class="map-editor-online-title">MAPAS COMPARTILHADOS</div>
              <div class="map-editor-online-sub" id="map-editor-online-count">Carregando…</div>
            </div>
            <button type="button" data-editor-action="refreshOnline" class="map-editor-online-refresh">Atualizar</button>
          </div>
          <div class="map-editor-online-fields">
            <input id="map-editor-author" maxlength="32" placeholder="Seu nome">
            <input id="map-editor-map-name" maxlength="48" placeholder="Nome do mapa">
          </div>
          <div class="map-editor-online-actions">
            <button type="button" data-editor-action="publish">Publicar mapa</button>
            <button type="button" data-editor-action="loadCode">Carregar código</button>
          </div>
          <div class="map-editor-online-code">
            <input id="map-editor-code" maxlength="16" placeholder="Código do mapa, ex.: MINE-A1B2C3">
          </div>
          <div id="map-editor-online-status" class="map-editor-online-status"></div>
          <div id="map-editor-online-list" class="map-editor-online-list"></div>
        </div>

        <div class="map-editor-help">
          <b>Esquerdo:</b> colocar/selecionar · <b>R:</b> girar · <b>[ / ]:</b> escala ·
          <b>C:</b> colisão · <b>Delete:</b> apagar · <b>Ctrl+Shift+T:</b> sair
        </div>
      </div>
    `;
    document.getElementById('ui').appendChild(root);
    this.el = root;

    root.querySelector('#map-editor-close').onclick = () => this.toggle(false);
    root.querySelectorAll('[data-editor-tab]').forEach((button) => {
      button.onclick = () => this.setPalette(button.dataset.editorTab);
    });
    root.querySelectorAll('[data-editor-action]').forEach((button) => {
      button.onclick = () => this.action(button.dataset.editorAction);
    });
    root.querySelector('#map-editor-file').addEventListener('change', (e) => this.importFile(e));
    root.querySelector('#map-editor-author').value = this.creatorName;
    root.querySelector('#map-editor-author').addEventListener('input', (e) => {
      this.creatorName = e.target.value.trim().slice(0, 32);
      localStorage.setItem(CREATOR_NAME_KEY, this.creatorName);
    });
    this.renderPalette();
    this.refreshOnlineMaps();
  }

  toggle(force = !this.active) {
    if (force === this.active) return;
    if (force) {
      // Start a fresh sandbox session from the last editor save. The gameplay
      // map itself is never modified by opening the editor.
      this.clearWithoutPrompt();
      this.loadSavedLayer();
      this.sessionSnapshot = this.serialize();
      this.active = true;
      this.el.classList.remove('hidden');
      if (this.game.state === 'play') this.game.state = 'map-editor';
      this.game.inputLocked = true;
      this.game.ui.toast('Editor de mapa aberto.');
      this.setStatus('EDITOR ATIVO — alterações só ficam permanentes ao salvar.');
      this.select(null);
      this.updatePreviewFromPointer();
    } else {
      this.discardSession();
      this.active = false;
      this.el.classList.add('hidden');
      if (this.game.state === 'map-editor') this.game.state = 'play';
      this.game.inputLocked = false;
      this.setStatus('Fechado sem salvar.');
      this.select(null);
      this.hidePreview();
    }
  }

  getCreatorId() {
    let id = localStorage.getItem(CREATOR_ID_KEY);
    if (!id) {
      const random = (globalThis.crypto?.randomUUID?.() || ('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx').replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));
      id = 'creator-' + random;
      localStorage.setItem(CREATOR_ID_KEY, id);
    }
    return id;
  }

  setOnlineStatus(text, error = false) {
    const el = this.el?.querySelector('#map-editor-online-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!error);
  }

  setStatus(text) {
    const el = this.el.querySelector('#map-editor-status');
    if (el) el.textContent = text;
  }

  setPalette(tab) {
    this.palette = tab === 'items' ? 'items' : tab === 'world' ? 'world' : 'terrain';
    this.el.querySelectorAll('[data-editor-tab]').forEach((b) => b.classList.toggle('active', b.dataset.editorTab === this.palette));
    this.renderPalette();
  }

  renderPalette() {
    const palette = this.el.querySelector('#map-editor-palette');
    const tools = this.palette === 'items' ? this.itemTools : this.palette === 'world' ? BUILTIN : TERRAIN;
    palette.innerHTML = tools.map((tool) => {
      const visual = tool.sprite
        ? `<img src="${tool.sprite}" alt="" loading="lazy">`
        : `<span>${tool.icon || '◆'}</span>`;
      return `<button type="button" class="map-tool ${this.selectedTool.id === tool.id ? 'active' : ''}" data-tool="${tool.id}">
        <span class="map-tool-icon">${visual}</span><span>${tool.name}</span>
      </button>`;
    }).join('');

    palette.querySelectorAll('[data-tool]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.tool;
        const next = tools.find((tool) => tool.id === id);
        if (!next) return;
        this.selectedTool = next;
        this.select(null);
        this.renderPalette();
        this.setStatus('Selecionado: ' + next.name + ' — mova o mouse para posicionar.');
        this.updatePreviewFromPointer();
      };
    });
  }

  action(action) {
    if (action === 'collision') return this.toggleCollision();
    if (action === 'rotate') return this.rotateSelected();
    if (action === 'scaleDown') return this.scaleSelected(0.9);
    if (action === 'scaleUp') return this.scaleSelected(1.1);
    if (action === 'delete') return this.deleteSelected();
    if (action === 'save') return this.save();
    if (action === 'export') return this.exportMap();
    if (action === 'import') return this.el.querySelector('#map-editor-file').click();
    if (action === 'clear') return this.clearCreated();
    if (action === 'publish') return this.publishOnline();
    if (action === 'refreshOnline') return this.refreshOnlineMaps();
    if (action === 'loadCode') return this.loadOnlineCode();
  }

  getGroundPointFromEvent(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  onWheel(event) {
    if (!this.active) return;
    event.preventDefault();
    const step = (event.deltaY > 0 ? -1 : 1) * THREE.MathUtils.degToRad(5);
    if (this.selected) {
      this.rotateSelected(step);
      return;
    }
    if (this.preview) {
      this.preview.rotation += step;
      this.preview.root.rotation.y = this.preview.rotation;
      this.setStatus('Rotação: ' + Math.round(THREE.MathUtils.radToDeg(this.preview.rotation)) + '°');
    }
  }

  onPointerMove(event) {
    if (!this.active) return;
    const point = this.getGroundPointFromEvent(event);
    if (!point) {
      this.hidePreview();
      return;
    }
    this.updatePreview(point.x, point.z);
  }

  updatePreviewFromPointer() {
    // The next pointermove will position it; hide stale previews immediately.
    this.hidePreview();
  }

  createPreviewVisual() {
    const tool = this.selectedTool;
    let visual;
    if (tool.kind === 'terrain') {
      visual = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({
        color: tool.color, roughness: tool.terrainType.includes('path') ? 0.92 : 1,
        transparent: true, opacity: 0.62, side: THREE.DoubleSide,
      }));
      visual.rotation.x = -Math.PI / 2;
      visual.position.y = 0.025;
    } else if (tool.kind === 'item') {
      const texture = this.getItemTexture(tool.itemId);
      visual = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        alphaTest: 0.04,
        opacity: 0.58,
      }));
      visual.scale.set(1.4, 1.4, 1);
      visual.position.y = 0.75;
    } else if (tool.kind === 'stone') {
      visual = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({
        color: 0x8b9098, roughness: 1, flatShading: true, transparent: true, opacity: 0.55
      }));
      visual.scale.set(0.95, 0.8, 0.9);
      visual.position.y = 0.55;
    } else if (tool.kind === 'wall') {
      visual = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.9), new THREE.MeshStandardMaterial({
        color: 0x8b9098, roughness: 1, flatShading: true, transparent: true, opacity: 0.45
      }));
      visual.position.y = 1.3;
    } else if (tool.kind === 'crate') {
      visual = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, 1.25), new THREE.MeshStandardMaterial({
        color: 0x9a7950, roughness: 0.95, flatShading: true, transparent: true, opacity: 0.55
      }));
      visual.position.y = 0.58;
    } else if (tool.kind === 'pillar') {
      visual = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.7, 7), new THREE.MeshStandardMaterial({
        color: 0x8b9098, roughness: 1, flatShading: true, transparent: true, opacity: 0.5
      }));
      visual.position.y = 1.35;
    } else if (tool.kind === 'ore') {
      visual = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({
        color: 0x6f9ab0, roughness: 0.75, metalness: 0.15, flatShading: true, transparent: true, opacity: 0.55
      }));
      visual.position.y = 0.55;
      visual.scale.set(1.0, 0.7, 0.9);
    }
    if (!visual) return null;
    visual.renderOrder = 50;
    visual.userData.editorPreview = true;
    return visual;
  }

  updatePreview(x, z) {
    if (!this.preview || this.preview.toolId !== this.selectedTool.id) {
      this.hidePreview();
      const visual = this.createPreviewVisual();
      if (!visual) return;
      const root = new THREE.Group();
      root.userData.editorPreview = true;
      root.add(visual);
      this.scene.add(root);
      this.preview = { root, visual, toolId: this.selectedTool.id, rotation: 0 };
    }
    this.preview.root.position.set(x, 0, z);
    this.preview.root.rotation.y = this.preview.rotation || 0;
    this.preview.root.scale.setScalar(1);
    this.preview.root.visible = true;
  }

  hidePreview() {
    if (!this.preview) return;
    this.scene.remove(this.preview.root);
    this.preview.root.traverse((o) => {
      if (o.material && o.material !== this.itemTextures.get(this.selectedTool.itemId)) {
        o.material.dispose?.();
      }
    });
    this.preview = null;
  }

  onPointerDown(event) {
    if (!this.active || event.button !== 0) return;

    const point = this.getGroundPointFromEvent(event);
    if (!point) return;

    const hits = this.raycaster.intersectObjects(this.group.children, true);
    const hitObject = hits.find((hit) => {
      let o = hit.object;
      while (o && o !== this.group) {
        if (o.userData?.editorId) return true;
        o = o.parent;
      }
      return false;
    });

    if (hitObject) {
      let o = hitObject.object;
      while (o && o !== this.group && !o.userData?.editorId) o = o.parent;
      if (o?.userData?.editorId) {
        this.select(this.objects.find((entry) => entry.id === o.userData.editorId) || null);
        return;
      }
    }

    this.place(point.x, point.z);
  }

  place(x, z) {
    const data = {
      id: 'editor-' + (++this.seq),
      kind: this.selectedTool.kind,
      terrainType: this.selectedTool.terrainType || null,
      itemId: this.selectedTool.itemId || null,
      x: Number(x.toFixed(3)),
      y: 0,
      z: Number(z.toFixed(3)),
      rotation: this.preview?.rotation || 0,
      scale: 1,
      collision: !!this.selectedTool.collision,
      radius: this.selectedTool.kind === 'wall' ? 1.35 : this.selectedTool.kind === 'terrain' ? 0 : 0.65,
      width: this.selectedTool.kind === 'wall' ? 3.2 : this.selectedTool.kind === 'terrain' ? 4 : 1.4,
      depth: this.selectedTool.kind === 'wall' ? 0.9 : this.selectedTool.kind === 'terrain' ? 4 : 1.4,
      height: this.selectedTool.kind === 'wall' ? 2.6 : this.selectedTool.kind === 'terrain' ? 0.02 : 1.2,
    };
    this.hidePreview();
    this.objects.push(data);
    this.createObject(data);
    this.select(data);
    this.setStatus('Colocado. Clique em Salvar para confirmar.');
  }

  createObject(data) {
    const root = new THREE.Group();
    root.position.set(data.x, data.y, data.z);
    root.rotation.y = data.rotation;
    root.scale.setScalar(data.scale);
    root.userData.editorId = data.id;

    let visual;
    if (data.kind === 'terrain') {
      const tool = TERRAIN.find((entry) => entry.terrainType === data.terrainType) || TERRAIN[0];
      visual = new THREE.Mesh(new THREE.PlaneGeometry(data.width || 4, data.depth || 4), new THREE.MeshStandardMaterial({
        color: tool.color, roughness: tool.terrainType.includes('path') ? 0.92 : 1, side: THREE.DoubleSide,
      }));
      visual.rotation.x = -Math.PI / 2;
      visual.position.y = 0.025;
    } else if (data.kind === 'item') {
      const texture = this.getItemTexture(data.itemId);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, alphaTest: 0.04 });
      visual = new THREE.Sprite(material);
      visual.scale.set(1.4, 1.4, 1);
      visual.position.y = 0.75;
    } else if (data.kind === 'stone') {
      visual = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x5b5e64, roughness: 1, flatShading: true }));
      visual.scale.set(0.95, 0.8, 0.9);
      visual.position.y = 0.55;
      visual.rotation.set(0.1, 0.3, -0.08);
    } else if (data.kind === 'wall') {
      visual = new THREE.Mesh(new THREE.BoxGeometry(data.width, data.height, data.depth), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 1, flatShading: true }));
      visual.position.y = data.height / 2;
    } else if (data.kind === 'crate') {
      visual = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, 1.25), new THREE.MeshStandardMaterial({ color: 0x60462f, roughness: 0.95, flatShading: true }));
      visual.position.y = 0.58;
    } else if (data.kind === 'pillar') {
      visual = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.7, 7), new THREE.MeshStandardMaterial({ color: 0x5a5c62, roughness: 1, flatShading: true }));
      visual.position.y = 1.35;
    } else if (data.kind === 'ore') {
      visual = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0x4d7185, roughness: 0.75, metalness: 0.15, flatShading: true }));
      visual.position.y = 0.55;
      visual.scale.set(1.0, 0.7, 0.9);
    }

    if (!visual) return;
    visual.userData.editorId = data.id;
    root.add(visual);
    root.userData.visual = visual;
    this.group.add(root);

    this.applyCollision(data);
    this.refreshHelper(data);
  }

  getItemTexture(itemId) {
    if (this.itemTextures.has(itemId)) return this.itemTextures.get(itemId);
    const item = ITEMS[itemId];
    const texture = this.textureLoader.load(item.sprite);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    this.itemTextures.set(itemId, texture);
    return texture;
  }

  applyCollision(data) {
    if (data.collision) {
      data._collider = this.game.collision.addCircle(data.x, data.z, data.radius * data.scale, { projectiles: false });
    }
  }

  removeCollision(data) {
    if (data._collider) {
      data._collider.enabled = false;
      data._collider = null;
    }
  }

  refreshCollision(data) {
    this.removeCollision(data);
    this.applyCollision(data);
  }

  refreshHelper(data) {
    const old = this.collisionHelpers.get(data.id);
    if (old) {
      old.geometry.dispose();
      old.material.dispose();
      this.scene.remove(old);
      this.collisionHelpers.delete(data.id);
    }

    if (!this.active) return;

    const color = data.collision ? 0xffb45a : 0x687080;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.15, data.radius * data.scale * 0.82), Math.max(0.18, data.radius * data.scale), 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(data.x, 0.035, data.z);
    ring.userData.editorHelper = true;
    this.scene.add(ring);
    this.collisionHelpers.set(data.id, ring);
  }

  select(data) {
    this.selected = data;
    if (this.selectionHelper) {
      this.selectionHelper.geometry.dispose();
      this.selectionHelper.material.dispose();
      this.scene.remove(this.selectionHelper);
      this.selectionHelper = null;
    }

    if (data) {
      const size = Math.max(0.8, data.radius * data.scale * 2.2);
      this.selectionHelper = new THREE.Mesh(
        new THREE.RingGeometry(size * 0.48, size * 0.55, 32),
        new THREE.MeshBasicMaterial({ color: 0x9ec8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
      );
      this.selectionHelper.rotation.x = -Math.PI / 2;
      this.selectionHelper.position.set(data.x, 0.055, data.z);
      this.scene.add(this.selectionHelper);
    }

    const label = this.el.querySelector('#map-editor-selected');
    if (label) {
      label.textContent = data
        ? `${data.kind === 'item' ? (ITEMS[data.itemId]?.name || data.itemId) : data.kind} · ${data.collision ? 'COLISÃO ON' : 'COLISÃO OFF'} · ${data.x.toFixed(1)}, ${data.z.toFixed(1)}`
        : 'Nenhum objeto selecionado.';
    }
    for (const entry of this.objects) this.refreshHelper(entry);
  }

  toggleCollision() {
    if (!this.selected) return this.setStatus('Selecione um objeto primeiro.');
    this.selected.collision = !this.selected.collision;
    this.refreshCollision(this.selected);
    this.refreshHelper(this.selected);
    this.setStatus(this.selected.collision ? 'Colisão ativada. Clique em Salvar para confirmar.' : 'Colisão removida. Clique em Salvar para confirmar.');
    this.select(this.selected);
  }

  rotateSelected(step = Math.PI / 12) {
    if (!this.selected) return this.setStatus('Selecione um objeto primeiro.');
    this.selected.rotation += step;
    const root = this.group.children.find((o) => o.userData?.editorId === this.selected.id);
    if (root) root.rotation.y = this.selected.rotation;
    this.setStatus('Objeto girado. Clique em Salvar para confirmar.');
  }

  scaleSelected(factor) {
    if (!this.selected) return this.setStatus('Selecione um objeto primeiro.');
    this.selected.scale = clamp(this.selected.scale * factor, 0.35, 3.5);
    const root = this.group.children.find((o) => o.userData?.editorId === this.selected.id);
    if (root) root.scale.setScalar(this.selected.scale);
    this.refreshCollision(this.selected);
    this.refreshHelper(this.selected);
    this.setStatus('Escala: ' + this.selected.scale.toFixed(2) + ' — clique em Salvar para confirmar.');
  }

  deleteSelected() {
    if (!this.selected) return this.setStatus('Selecione um objeto primeiro.');
    const id = this.selected.id;
    this.removeCollision(this.selected);
    const root = this.group.children.find((o) => o.userData?.editorId === id);
    if (root) {
      root.traverse((o) => {
        if (o.material?.map && o.material.map !== this.itemTextures.get(this.selected?.itemId)) {
          o.material.dispose?.();
        }
        o.geometry?.dispose?.();
      });
      this.group.remove(root);
    }
    const helper = this.collisionHelpers.get(id);
    if (helper) {
      helper.geometry.dispose();
      helper.material.dispose();
      this.scene.remove(helper);
      this.collisionHelpers.delete(id);
    }
    this.objects = this.objects.filter((o) => o.id !== id);
    this.select(null);
    this.setStatus('Objeto apagado. Clique em Salvar para confirmar.');
  }

  clearCreated() {
    if (!this.objects.length) return this.setStatus('Não há objetos criados pelo editor.');
    if (!confirm('Apagar todos os objetos criados pelo editor?')) return;
    for (const data of [...this.objects]) {
      this.selected = data;
      this.deleteSelected();
    }
    this.select(null);
    this.setStatus('Objetos do editor removidos. Clique em Salvar para confirmar.');
  }

  serialize() {
    return this.objects.map(({ _collider, ...data }) => ({ ...data }));
  }

  async refreshOnlineMaps() {
    this.setOnlineStatus('Atualizando mapas compartilhados…');
    try {
      const all = await listSharedMaps({ limit: 60 });
      const mine = all.filter((map) => map.creator_id === this.creatorId);
      const count = this.el.querySelector('#map-editor-online-count');
      if (count) count.textContent = 'Seus mapas: ' + mine.length + '/3 · Comunidade: ' + all.length;
      this.renderOnlineMaps(all);
      this.setOnlineStatus(mine.length >= 3 ? 'Você já usou os 3 slots de publicação.' : 'Você ainda pode publicar ' + (3 - mine.length) + ' mapa(s).');
    } catch (error) {
      console.warn('[MapEditor] Shared maps failed:', error);
      this.setOnlineStatus('Não foi possível conectar aos mapas compartilhados.', true);
      const count = this.el.querySelector('#map-editor-online-count');
      if (count) count.textContent = 'Servidor indisponível';
    }
  }

  renderOnlineMaps(maps) {
    const list = this.el.querySelector('#map-editor-online-list');
    if (!list) return;
    if (!maps.length) {
      list.innerHTML = '<div class="map-editor-online-empty">Nenhum mapa publicado ainda.</div>';
      return;
    }
    list.innerHTML = maps.map((map) => {
      const mine = map.creator_id === this.creatorId;
      const objects = Array.isArray(map.map_payload?.objects) ? map.map_payload.objects.length : 0;
      const date = map.created_at ? new Date(map.created_at).toLocaleDateString('pt-BR') : '';
      return '<div class="map-editor-online-card' + (mine ? ' mine' : '') + '">' +
        '<div class="map-editor-online-card-main">' +
          '<div class="map-editor-online-card-title">' + this.escapeHtml(map.map_name) + '</div>' +
          '<div class="map-editor-online-card-meta">' + this.escapeHtml(map.creator_name) + ' · ' + objects + ' objetos · ' + date + '</div>' +
          '<div class="map-editor-online-card-code">' + this.escapeHtml(map.map_code) + (mine ? ' · SEU MAPA' : '') + '</div>' +
        '</div>' +
        '<button type="button" data-load-map-id="' + this.escapeHtml(map.id) + '">Carregar</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-load-map-id]').forEach((button) => {
      button.onclick = async () => {
        const map = maps.find((entry) => entry.id === button.dataset.loadMapId);
        if (!map) return;
        await this.loadOnlineMap(map);
      };
    });
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }

  generateMapCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'MINE-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async publishOnline() {
    const author = (this.el.querySelector('#map-editor-author')?.value || '').trim().slice(0, 32);
    const mapName = (this.el.querySelector('#map-editor-map-name')?.value || '').trim().slice(0, 48);
    if (!author) return this.setOnlineStatus('Digite seu nome antes de publicar.', true);
    if (!mapName) return this.setOnlineStatus('Digite um nome para o mapa.', true);
    this.creatorName = author;
    localStorage.setItem(CREATOR_NAME_KEY, author);

    const button = this.el.querySelector('[data-editor-action="publish"]');
    if (button) button.disabled = true;
    this.setOnlineStatus('Publicando mapa…');
    try {
      const mine = await listSharedMaps({ creatorId: this.creatorId, limit: 3 });
      if (mine.length >= 3) {
        this.setOnlineStatus('Limite atingido: cada criador pode publicar apenas 3 mapas inicialmente.', true);
        return;
      }
      const mapCode = this.generateMapCode();
      await publishSharedMap({
        creatorId: this.creatorId,
        creatorName: author,
        mapName,
        mapCode,
        objects: this.serialize(),
      });
      const codeInput = this.el.querySelector('#map-editor-code');
      if (codeInput) codeInput.value = mapCode;
      this.setOnlineStatus('Mapa publicado! Código: ' + mapCode);
      await this.refreshOnlineMaps();
    } catch (error) {
      console.warn('[MapEditor] Publish failed:', error);
      this.setOnlineStatus('Falha ao publicar: ' + error.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async loadOnlineCode() {
    const code = (this.el.querySelector('#map-editor-code')?.value || '').trim().toUpperCase();
    if (!code) return this.setOnlineStatus('Digite o código do mapa.', true);
    try {
      const maps = await listSharedMaps({ limit: 100 });
      const map = maps.find((entry) => entry.map_code.toUpperCase() === code);
      if (!map) return this.setOnlineStatus('Mapa não encontrado.', true);
      await this.loadOnlineMap(map);
    } catch (error) {
      this.setOnlineStatus('Falha ao buscar mapa: ' + error.message, true);
    }
  }

  async loadOnlineMap(map) {
    const payload = map?.map_payload;
    if (!payload || !Array.isArray(payload.objects)) {
      this.setOnlineStatus('Esse mapa está em um formato inválido.', true);
      return;
    }
    this.clearWithoutPrompt();
    for (const raw of payload.objects) {
      const data = { ...raw, _collider: null };
      this.objects.push(data);
      this.seq = Math.max(this.seq, Number(String(data.id).replace('editor-', '')) || 0);
      this.createObject(data);
    }
    // Loading a shared map replaces the current working copy only. It does
    // not silently save it or affect the normal game map.
    this.sessionSnapshot = this.serialize();
    this.select(null);
    this.setOnlineStatus('Carregado: ' + map.map_name + ' · código ' + map.map_code);
    this.setStatus('Mapa compartilhado carregado.');
  }

  discardSession() {
    // Closing the editor means abandoning the working copy. Do NOT rebuild
    // the saved editor layer here: the live gameplay map must return exactly
    // to its original state.
    this.clearWithoutPrompt();
    this.selected = null;
    this.sessionSnapshot = [];
  }

  loadSavedLayer() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!Array.isArray(payload.objects)) return;
      for (const rawData of payload.objects) {
        const data = { ...rawData, _collider: null };
        this.objects.push(data);
        this.seq = Math.max(this.seq, Number(String(data.id).replace('editor-', '')) || 0);
        this.createObject(data);
      }
    } catch (error) {
      console.warn('[MapEditor] Falha ao carregar camada salva:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  commitSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, objects: this.serialize() }));
      this.sessionSnapshot = this.serialize();
      this.setStatus('Alterações salvas neste navegador.');
    } catch (error) {
      console.warn('[MapEditor] Falha ao salvar:', error);
      this.setStatus('Não foi possível salvar.');
    }
  }

  save() {
    this.commitSession();
  }

  exportMap() {
    const blob = new Blob([JSON.stringify({ version: 1, objects: this.serialize() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arena-map-editor.json';
    a.click();
    URL.revokeObjectURL(url);
    this.setStatus('JSON exportado.');
  }

  importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!Array.isArray(payload.objects)) throw new Error('Formato inválido');
        this.clearWithoutPrompt();
        for (const data of payload.objects) {
          this.objects.push(data);
          this.seq = Math.max(this.seq, Number(String(data.id).replace('editor-', '')) || 0);
          this.createObject(data);
        }
        this.sessionSnapshot = this.serialize();
        this.setStatus('JSON importado na sessão. Clique em Salvar para confirmar.');
      } catch (error) {
        this.setStatus('JSON inválido.');
        console.warn('[MapEditor] Import failed:', error);
      }
    };
    reader.readAsText(file);
  }

  clearWithoutPrompt() {
    for (const data of [...this.objects]) {
      this.selected = data;
      this.deleteSelected();
    }
    this.selected = null;
  }

  handleKey(e) {
    if (!this.active) return false;
    if (e.code === 'KeyR') { e.preventDefault(); this.rotateSelected(); return true; }
    if (e.code === 'BracketLeft') { e.preventDefault(); this.scaleSelected(0.9); return true; }
    if (e.code === 'BracketRight') { e.preventDefault(); this.scaleSelected(1.1); return true; }
    if (e.code === 'KeyC') { e.preventDefault(); this.toggleCollision(); return true; }
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); this.deleteSelected(); return true; }
    return false;
  }

  dispose() {
    for (const data of [...this.objects]) {
      this.selected = data;
      this.removeCollision(data);
    }
    this.group.clear();
    this.scene.remove(this.group);
    this.el.remove();
  }
}
