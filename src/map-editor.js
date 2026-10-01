import * as THREE from 'three';
import { MapEditorCore } from './map-editor-core.js';
import { ITEMS } from './items.js';
import { listSharedMaps, publishSharedMap } from './map-editor-api.js';

const STORAGE_KEY = 'arena3d.map-editor.v1';
const CREATOR_ID_KEY = 'arena3d.map-editor.creator-id.v1';
const CREATOR_NAME_KEY = 'arena3d.map-editor.creator-name.v1';
const TERRAIN_ASSET = (name) => new URL('../assets/map-editor/terrain/' + name + '.svg', import.meta.url).href;
const KENNEY_DUNGEON_ASSET = new URL('../assets/map-editor/packs/kenney-roguelike-caves-dungeons/roguelikeDungeon_transparent.png', import.meta.url).href;
const KENNEY_DUNGEON = { width: 492, height: 305, tile: 16, spacing: 1, columns: 29, rows: 18 };

const TERRAIN = [
  { id:'floor', name:'Chão', icon:'·', kind:'terrain', terrainType:'floor', collision:false, color:0x273329, sprite:TERRAIN_ASSET('floor') },
  { id:'grass', name:'Grama suave', icon:'♣', kind:'terrain', terrainType:'grass-soft', collision:false, color:0x3f6237, sprite:TERRAIN_ASSET('grass-soft') },
  { id:'grass-wild', name:'Grama alta', icon:'♣', kind:'terrain', terrainType:'grass-wild', collision:false, color:0x35582f, sprite:TERRAIN_ASSET('grass-wild') },
  { id:'grass-flower', name:'Grama florida', icon:'✿', kind:'terrain', terrainType:'grass-flower', collision:false, color:0x42683a, sprite:TERRAIN_ASSET('grass-flower') },
  { id:'grass-dark', name:'Grama escura', icon:'♣', kind:'terrain', terrainType:'grass-dark', collision:false, color:0x29472c, sprite:TERRAIN_ASSET('grass-dark') },
  { id:'dirt', name:'Terra seca', icon:'▪', kind:'terrain', terrainType:'dirt-dry', collision:false, color:0x765033, sprite:TERRAIN_ASSET('dirt-dry') },
  { id:'dirt-rocky', name:'Terra pedregosa', icon:'▪', kind:'terrain', terrainType:'dirt-rocky', collision:false, color:0x67442f, sprite:TERRAIN_ASSET('dirt-rocky') },
  { id:'dirt-red', name:'Terra vermelha', icon:'▪', kind:'terrain', terrainType:'dirt-red', collision:false, color:0x70402f, sprite:TERRAIN_ASSET('dirt-red') },
  { id:'dirt-dark', name:'Terra escura', icon:'▪', kind:'terrain', terrainType:'dirt-dark', collision:false, color:0x523729, sprite:TERRAIN_ASSET('dirt-dark') },
  { id:'stone', name:'Pedra laje', icon:'▦', kind:'terrain', terrainType:'stone-slate', collision:false, color:0x4e5358, sprite:TERRAIN_ASSET('stone-slate') },
  { id:'stone-cracked', name:'Pedra rachada', icon:'▦', kind:'terrain', terrainType:'stone-cracked', collision:false, color:0x55595d, sprite:TERRAIN_ASSET('stone-cracked') },
  { id:'stone-moss', name:'Pedra com musgo', icon:'▦', kind:'terrain', terrainType:'stone-moss', collision:false, color:0x4b5350, sprite:TERRAIN_ASSET('stone-moss') },
  { id:'stone-brick', name:'Piso de blocos', icon:'▦', kind:'terrain', terrainType:'stone-brick', collision:false, color:0x55565a, sprite:TERRAIN_ASSET('stone-brick') },
  { id:'stone-path', name:'Caminho de paralelepípedo', icon:'▥', kind:'terrain', terrainType:'path-cobble', collision:false, color:0x6a6a69, sprite:TERRAIN_ASSET('path-cobble') },
  { id:'stone-path-dark', name:'Caminho de pedra escuro', icon:'▥', kind:'terrain', terrainType:'path-cobble-dark', collision:false, color:0x555655, sprite:TERRAIN_ASSET('path-cobble-dark') },
  { id:'dirt-path', name:'Caminho de terra', icon:'═', kind:'terrain', terrainType:'path-dirt', collision:false, color:0x765239, sprite:TERRAIN_ASSET('path-dirt') },
  { id:'dirt-path-rock', name:'Caminho de terra pedregoso', icon:'═', kind:'terrain', terrainType:'path-dirt-rock', collision:false, color:0x6b4933, sprite:TERRAIN_ASSET('path-dirt-rock') },
  { id:'sand', name:'Areia clara', icon:'░', kind:'terrain', terrainType:'sand-light', collision:false, color:0xa38e65, sprite:TERRAIN_ASSET('sand-light') },
  { id:'sand-rocky', name:'Areia pedregosa', icon:'░', kind:'terrain', terrainType:'sand-rocky', collision:false, color:0x907a55, sprite:TERRAIN_ASSET('sand-rocky') },
  { id:'mud', name:'Lama molhada', icon:'≈', kind:'terrain', terrainType:'mud-wet', collision:false, color:0x403832, sprite:TERRAIN_ASSET('mud-wet') },
  { id:'mud-stones', name:'Lama com pedras', icon:'≈', kind:'terrain', terrainType:'mud-stones', collision:false, color:0x463b32, sprite:TERRAIN_ASSET('mud-stones') },
  { id:'water', name:'Água', icon:'≈', kind:'terrain', terrainType:'water', collision:false, color:0x234c63, sprite:TERRAIN_ASSET('water') },
  { id:'deep-water', name:'Água profunda', icon:'≈', kind:'terrain', terrainType:'deep-water', collision:true, color:0x18384e, sprite:TERRAIN_ASSET('deep-water') },
  { id:'snow', name:'Neve', icon:'*', kind:'terrain', terrainType:'snow', collision:false, color:0xb7c4c7, sprite:TERRAIN_ASSET('snow') },
  { id:'ice', name:'Gelo', icon:'◇', kind:'terrain', terrainType:'ice', collision:false, color:0x6e9ba7, sprite:TERRAIN_ASSET('ice') },
  { id:'gravel', name:'Cascalho', icon:'·', kind:'terrain', terrainType:'gravel', collision:false, color:0x66635d, sprite:TERRAIN_ASSET('gravel') },
  { id:'volcanic', name:'Rocha vulcânica', icon:'◆', kind:'terrain', terrainType:'volcanic', collision:false, color:0x3f2925, sprite:TERRAIN_ASSET('volcanic') },
  { id:'wood-floor', name:'Piso de madeira', icon:'═', kind:'terrain', terrainType:'wood-floor', collision:false, color:0x65452f, sprite:TERRAIN_ASSET('wood-floor') },
  { id:'marble', name:'Mármore', icon:'▦', kind:'terrain', terrainType:'marble', collision:false, color:0x77787a, sprite:TERRAIN_ASSET('marble') },
];

const BUILTIN = [
  { id: 'stone', name: 'Pedra', icon: '◆', kind: 'stone', collision: true },
  { id: 'wall', name: 'Parede', icon: '▰', kind: 'wall', collision: true },
  { id: 'wall-short', name: 'Parede Curta', icon: '▬', kind: 'wall-short', collision: true },
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

    // O Core agora é o dono do ciclo de vida dos Object3D do editor.
    this.group = new THREE.Group();
    this.group.name = 'MapEditorObjects';
    this.scene.add(this.group);

    this.core = new MapEditorCore({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      objectContainer: this.group,
      gridSize: 2,
      createMesh: (data) => this.createObjectVisual(typeof data === 'string' ? { kind: data, id: null, scale: 1 } : data),
      collisionAdapter: {
        add: (object, data) => this.applyCollision(data),
        remove: (object, data) => this.removeCollision(data),
        clear: () => {
          for (const data of this.objects) this.removeCollision(data);
        },
      },
      resolveY: () => 0,
      disposeObject: (object) => this.disposeEditorObjectResources(object),
    });
    this.objects = [];
    this.selected = null;
    this.active = false;
    this.palette = 'terrain';
    this.selectedTool = BUILTIN[0];
    this.seq = 0;
    this.selectionHelper = null;
    this.collisionHelpers = new Map();
    this.preview = null;
    this.placementRotation = 0;
    this.sessionSnapshot = [];
    this.previousState = 'play';
    this.cameraFocus = new THREE.Vector3();
    this.navKeys = new Set();
    this.edgePointer = { x: 0, y: 0, active: false };
    this.textureLoader = new THREE.TextureLoader();
    this.itemTextures = new Map();
    this.terrainTextures = new Map();
    this.creatorId = this.getCreatorId();
    this.creatorName = localStorage.getItem(CREATOR_NAME_KEY) || '';

    this.buildUI();
    // Editor data is never injected into the live map at boot. It is loaded
    // only when the editor session is explicitly opened.
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.renderer.domElement.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.renderer.domElement.addEventListener('pointermove', (e) => this.updateEdgePointer(e));
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
        this.navKeys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.navKeys.delete(e.code);
    });
  }

  get kenneyTools() {
    const tools = [];
    for (let row = 0; row < KENNEY_DUNGEON.rows; row++) {
      for (let col = 0; col < KENNEY_DUNGEON.columns; col++) {
        const index = row * KENNEY_DUNGEON.columns + col + 1;
        tools.push({ id: 'kenney-dungeon:' + col + ':' + row, name: 'Tile ' + index, kind: 'terrain-atlas', atlas: 'kenney-dungeon', atlasX: col, atlasY: row, collision: false });
      }
    }
    return tools;
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
          <button type="button" data-editor-tab="kenney">Kenney</button>
        </div>

        <div id="map-editor-palette" class="map-editor-palette"></div>

        <div class="map-editor-select-row">
          <button type="button" id="map-editor-select-tool" class="map-editor-select-tool">Selecionar</button>
        </div>

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
          <b>C:</b> colisão · <b>Delete:</b> apagar · <b>Ctrl+Shift+T:</b> sair · <b>Kenney:</b> 522 tiles reais
        </div>
      </div>
    `;
    document.getElementById('ui').appendChild(root);
    this.el = root;

    root.querySelector('#map-editor-close').onclick = () => this.toggle(false);
    root.querySelectorAll('[data-editor-tab]').forEach((button) => {
      button.onclick = () => this.setPalette(button.dataset.editorTab);
    });
    root.querySelector('#map-editor-select-tool').onclick = () => this.setEditorTool('select');
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
      this.previousState = this.game.state === 'map-editor' ? 'play' : this.game.state;
      this.active = true;
      this.cameraFocus.copy(this.game.player?.pos || this.game.rig.target);
      this.el.classList.remove('hidden');
      this.game.state = 'map-editor';
      this.game.inputLocked = true;
      this.game.ui.toast('Editor de mapa aberto.');
      this.setStatus('EDITOR ATIVO — alterações só ficam permanentes ao salvar.');
      this.select(null);
      this.updatePreviewFromPointer();
    } else {
      this.discardSession();
      this.active = false;
      this.el.classList.add('hidden');
      if (this.game.state === 'map-editor') this.game.state = this.previousState === 'pause-controls' || this.previousState === 'pause' ? 'play' : this.previousState;
      this.game.inputLocked = false;
      this.navKeys.clear();
      this.edgePointer.active = false;
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
    this.palette = tab === 'items' ? 'items' : tab === 'world' ? 'world' : tab === 'kenney' ? 'kenney' : 'terrain';
    this.el.querySelectorAll('[data-editor-tab]').forEach((b) => b.classList.toggle('active', b.dataset.editorTab === this.palette));
    this.renderPalette();
  }

  setEditorTool(toolId) {
    if (toolId === 'select') {
      this.selectedTool = { id: 'select', name: 'Selecionar', kind: 'select', collision: false };
      this.hidePreview();
      this.el.querySelector('#map-editor-select-tool')?.classList.add('active');
      this.setStatus('Modo Selecionar: clique em um objeto para editar.');
      this.renderPalette();
      return;
    }
    this.el.querySelector('#map-editor-select-tool')?.classList.remove('active');
  }

  renderPalette() {
    const palette = this.el.querySelector('#map-editor-palette');
    const tools = this.palette === 'items' ? this.itemTools : this.palette === 'world' ? BUILTIN : this.palette === 'kenney' ? this.kenneyTools : TERRAIN;
    palette.innerHTML = tools.map((tool) => {
      const visual = tool.atlas === 'kenney-dungeon'
        ? `<span class="map-tool-atlas" style="background-image:url('${KENNEY_DUNGEON_ASSET}');background-size:984px 610px;background-position:-${tool.atlasX * 34}px -${tool.atlasY * 34}px"></span>`
        : tool.sprite
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
        this.placementRotation = 0;
        this.el.querySelector('#map-editor-select-tool')?.classList.remove('active');
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
    // O Core é a fonte única do raycast de posicionamento e do snap.
    this.core.updatePointer(event);
    return this.core.getGroundPoint();
  }

  onWheel(event) {
    if (!this.active) return;
    // Rotation belongs to the editor canvas. Always consume the wheel while
    // editing so the browser never steals it for page scrolling/zooming.
    event.preventDefault();
    event.stopPropagation();

    const step = (event.deltaY > 0 ? -1 : 1) * THREE.MathUtils.degToRad(5);

    // A placed object stays selected, so it can be rotated immediately
    // without requiring a second click on the Select tool.
    // In placement mode, the wheel rotates the tool currently "in hand".
    // It must NOT rotate the last object that happened to be placed.
    if (this.selectedTool?.kind !== 'select') {
      this.placementRotation += step;
      if (this.preview) {
        this.preview.rotation = this.placementRotation;
        this.preview.root.rotation.y = this.placementRotation;
      }
      this.setStatus('Rotação do item em mãos: ' + Math.round(THREE.MathUtils.radToDeg(this.placementRotation)) + '°');
      return;
    }

    // Only the explicit Select tool rotates an already placed object.
    if (this.selected) this.rotateSelected(step);
  }

  updateEdgePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const margin = 55;
    this.edgePointer.active = true;
    this.edgePointer.x = event.clientX - rect.left;
    this.edgePointer.y = event.clientY - rect.top;
    this.edgePointer.w = rect.width;
    this.edgePointer.h = rect.height;
    this.edgePointer.margin = margin;
  }

  updateNavigation(dt) {
    if (!this.active) return;
    const speed = 9.5;
    const dir = new THREE.Vector3();
    const forward = this.game.rig.forward(new THREE.Vector3());
    const right = this.game.rig.right(new THREE.Vector3());
    if (this.navKeys.has('KeyW')) dir.add(forward);
    if (this.navKeys.has('KeyS')) dir.sub(forward);
    if (this.navKeys.has('KeyD')) dir.add(right);
    if (this.navKeys.has('KeyA')) dir.sub(right);

    if (this.edgePointer.active) {
      const { x, y, w, h, margin } = this.edgePointer;
      if (x < margin) dir.sub(right);
      if (x > w - margin) dir.add(right);
      if (y < margin) dir.add(forward);
      if (y > h - margin) dir.sub(forward);
    }
    dir.y = 0;
    if (dir.lengthSq() > 0) {
      dir.normalize();
      this.cameraFocus.addScaledVector(dir, speed * dt);
    }
  }

  onPointerMove(event) {
    if (!this.active) return;

    const point = this.getGroundPointFromEvent(event);
    if (!point) {
      this.hidePreview();
      return;
    }

    // Ghost/preview acompanha o grid do Core, não coordenadas brutas do mouse.
    this.updatePreview(this.snapPlacement(point.x), this.snapPlacement(point.z));
  }

  updatePreviewFromPointer() {
    // The next pointermove will position it; hide stale previews immediately.
    this.hidePreview();
  }

  createPreviewVisual() {
    const tool = this.selectedTool;
    let visual;
    if (tool.kind === 'terrain-atlas') {
      const texture = this.getKenneyDungeonTexture(tool.atlasX, tool.atlasY);
      visual = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 1, transparent: true, opacity: 0.62, side: THREE.DoubleSide }));
      visual.rotation.x = -Math.PI / 2;
      visual.position.y = 0.025;
    } else if (tool.kind === 'terrain') {
      const texture = this.getTerrainTexture(tool.terrainType);
      visual = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({
        map: texture, color: 0xffffff, roughness: tool.terrainType.includes('path') ? 0.92 : 1,
        transparent: true, opacity: 0.62, side: THREE.DoubleSide,
      }));
      visual.rotation.x = -Math.PI / 2;
      visual.position.y = 0.025;
    } else if (tool.kind === 'item') {
      const texture = this.getItemTexture(tool.itemId);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        alphaTest: 0.04,
        // Never show Three.js's 1x1 white texture while the real item image
        // is still loading/being processed.
        opacity: 0,
      });
      this.applyWhiteCutout(material);
      this.bindItemTextureReady(texture, material, 0.58);
      visual = new THREE.Sprite(material);
      visual.scale.set(1.4, 1.4, 1);
      visual.position.y = 0.75;
    } else if (tool.kind === 'stone') {
      visual = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({
        color: 0x8b9098, roughness: 1, flatShading: true, transparent: true, opacity: 0.55
      }));
      visual.scale.set(0.95, 0.8, 0.9);
      visual.position.y = 0.55;
    } else if (tool.kind === 'wall' || tool.kind === 'wall-short') {
      const wallWidth = tool.kind === 'wall-short' ? 0.95 : 3.2;
      visual = new THREE.Mesh(new THREE.BoxGeometry(wallWidth, 2.6, 0.9), new THREE.MeshStandardMaterial({
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
      this.preview = { root, visual, toolId: this.selectedTool.id, rotation: this.placementRotation || 0 };
    }
    this.preview.root.position.set(x, 0, z);
    this.preview.root.rotation.y = this.preview.rotation ?? this.placementRotation ?? 0;
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
    if (!this.active) return;

    // Click-through protection: HTML UI nunca deve colocar/remover objetos no canvas.
    if (event.target !== this.renderer.domElement) return;

    // Sincroniza o ponteiro no instante exato do clique.
    this.core.updatePointer(event);
    // O raycaster legado de seleção usa as mesmas coordenadas NDC do Core.
    this.raycaster.setFromCamera(this.core.pointer, this.camera);

    // Shift + clique ou botão direito remove o objeto atingido.
    if (event.button === 2 || event.shiftKey) {
      if (event.button === 2) event.preventDefault();

      const hits = this.core.raycaster.intersectObjects([...this.core.objects.keys()], true);
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
        const data = o?.userData?.editorId
          ? this.objects.find((entry) => entry.id === o.userData.editorId)
          : null;
        if (data) {
          this.select(data);
          this.deleteSelected();
        }
      }
      return;
    }

    if (event.button !== 0) return;

    const point = this.getGroundPointFromEvent(event);
    if (!point) return;

    const hits = this.core.raycaster.intersectObjects([...this.core.objects.keys()], true);
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

    if (this.selectedTool.kind === 'select') {
      this.select(null);
      this.setStatus('Nenhum objeto selecionado.');
      return;
    }

    this.place(point.x, point.z);
  }

  snapPlacement(value) {
    // Walls are construction geometry: their placement must not be forced
    // onto the editor's 2m gameplay grid. Short walls especially need fine
    // positioning so they can be packed together to form curves.
    const fineSnap = this.selectedTool?.kind === 'wall' || this.selectedTool?.kind === 'wall-short' ? 0.25 : this.core.gridSize;
    return Math.round(Number(value) / fineSnap) * fineSnap;
  }

  place(x, z) {
    const data = {
      id: 'editor-' + (++this.seq),
      kind: this.selectedTool.kind,
      terrainType: this.selectedTool.terrainType || null,
      atlas: this.selectedTool.atlas || null,
      atlasX: Number.isInteger(this.selectedTool.atlasX) ? this.selectedTool.atlasX : null,
      atlasY: Number.isInteger(this.selectedTool.atlasY) ? this.selectedTool.atlasY : null,
      itemId: this.selectedTool.itemId || null,
      x: Number(this.snapPlacement(x).toFixed(3)),
      y: 0,
      z: Number(this.snapPlacement(z).toFixed(3)),
      rotation: this.placementRotation || 0,
      scale: 1,
      collision: !!this.selectedTool.collision,
      radius: this.selectedTool.kind === 'wall' ? 1.35 : (this.selectedTool.kind === 'wall-short' ? 0.48 : (this.selectedTool.kind === 'stone' ? 0.42 : (this.selectedTool.kind === 'terrain' || this.selectedTool.kind === 'terrain-atlas') ? 0 : 0.65)),
      width: this.selectedTool.kind === 'wall' ? 3.2 : (this.selectedTool.kind === 'wall-short' ? 0.95 : (this.selectedTool.kind === 'stone' ? 0.95 : (this.selectedTool.kind === 'terrain' || this.selectedTool.kind === 'terrain-atlas') ? 4 : 1.4)),
      depth: this.selectedTool.kind === 'wall' ? 0.9 : (this.selectedTool.kind === 'wall-short' ? 0.9 : (this.selectedTool.kind === 'stone' ? 0.9 : (this.selectedTool.kind === 'terrain' || this.selectedTool.kind === 'terrain-atlas') ? 4 : 1.4)),
      height: this.selectedTool.kind === 'wall' || this.selectedTool.kind === 'wall-short' ? 2.6 : (this.selectedTool.kind === 'terrain' || this.selectedTool.kind === 'terrain-atlas') ? 0.02 : 1.2,
    };
    const blockedBy = this.findPlacementBlocker(data);
    if (blockedBy) {
      const blockerName = blockedBy.kind === 'item' ? (ITEMS[blockedBy.itemId]?.name || blockedBy.itemId) : blockedBy.kind;
      this.setStatus('Espaço ocupado por ' + blockerName + '. Não é possível sobrepor objetos sólidos.');
      return;
    }
    this.hidePreview();
    this.objects.push(data);
    this.createObject(data);

    // Placement mode keeps the palette tool in hand. The newly placed object
    // is NOT selected automatically; existing objects are edited only through
    // the explicit Select tool.
    this.hidePreview();
    this.setStatus('Colocado. Continue posicionando o item ou use Selecionar para editar um objeto existente.');
  }

  findPlacementBlocker(candidate) {
    const candidateRadius = Math.max(0.15, (candidate.radius || 0.65) * (candidate.scale || 1));
    for (const existing of this.objects) {
      // Walls are map geometry: adjacent wall segments are allowed to touch
      // or overlap. The old circular blocker used the wall's gameplay radius
      // and incorrectly rejected valid wall-to-wall placement.
      if ((candidate.kind === 'wall' || candidate.kind === 'wall-short') && (existing.kind === 'wall' || existing.kind === 'wall-short')) continue;

      const existingRadius = Math.max(0.15, (existing.radius || 0.65) * (existing.scale || 1));
      const dx = candidate.x - existing.x;
      const dz = candidate.z - existing.z;
      const minDistance = candidateRadius + existingRadius;
      if (dx * dx + dz * dz < minDistance * minDistance && (candidate.collision || existing.collision)) return existing;
    }
    return null;
  }

  createObject(data) {
    const object = this.core.addObject(data);
    if (!object) return null;
    this.refreshHelper(data);
    return object;
  }

  createObjectVisual(data) {
    const root = new THREE.Group();
    root.userData.editorId = data.id;
    root.userData.mapData = data;
    let visual;
    if (data.kind === 'terrain-atlas') {
      const texture = this.getKenneyDungeonTexture(data.atlasX, data.atlasY);
      visual = new THREE.Mesh(new THREE.PlaneGeometry(data.width || 4, data.depth || 4), new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 1, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide }));
      visual.rotation.x = -Math.PI / 2; visual.position.y = 0.025;
    } else if (data.kind === 'terrain') {
      const tool = TERRAIN.find((entry) => entry.terrainType === data.terrainType) || TERRAIN[0];
      const texture = this.getTerrainTexture(tool.terrainType);
      visual = new THREE.Mesh(new THREE.PlaneGeometry(data.width || 4, data.depth || 4), new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: tool.terrainType.includes('path') ? 0.92 : 1, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide }));
      visual.rotation.x = -Math.PI / 2; visual.position.y = 0.025;
    } else if (data.kind === 'item') {
      const texture = this.getItemTexture(data.itemId);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, alphaTest: 0.04, opacity: 0 });
      this.applyWhiteCutout(material); this.bindItemTextureReady(texture, material, 1);
      visual = new THREE.Sprite(material); visual.scale.set(1.4, 1.4, 1); visual.position.y = 0.75;
    } else if (data.kind === 'stone') {
      visual = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x5b5e64, roughness: 1, flatShading: true }));
      visual.scale.set(0.95, 0.8, 0.9); visual.position.y = 0.55; visual.rotation.set(0.1, 0.3, -0.08);
    } else if (data.kind === 'wall' || data.kind === 'wall-short') {
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
      visual.position.y = 0.55; visual.scale.set(1.0, 0.7, 0.9);
    }
    if (!visual) return null;
    visual.userData.editorId = data.id;
    root.add(visual); root.userData.visual = visual; root.scale.setScalar(data.scale || 1);
    return root;
  }

  disposeEditorObjectResources(object) {
    object.traverse((o) => { if (o.material) o.material.dispose?.(); if (o.geometry) o.geometry.dispose?.(); });
  }
  getKenneyDungeonTexture(col, row) {
    const key = String(col) + ':' + String(row);
    if (this.terrainTextures.has('kenney:' + key)) return this.terrainTextures.get('kenney:' + key);
    const texture = this.textureLoader.load(KENNEY_DUNGEON_ASSET);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.flipY = false;
    texture.repeat.set(KENNEY_DUNGEON.tile / KENNEY_DUNGEON.width, KENNEY_DUNGEON.tile / KENNEY_DUNGEON.height);
    texture.offset.set((col * (KENNEY_DUNGEON.tile + KENNEY_DUNGEON.spacing)) / KENNEY_DUNGEON.width, (row * (KENNEY_DUNGEON.tile + KENNEY_DUNGEON.spacing)) / KENNEY_DUNGEON.height);
    this.terrainTextures.set('kenney:' + key, texture);
    return texture;
  }

  getTerrainTexture(terrainType) {
    if (this.terrainTextures.has(terrainType)) return this.terrainTextures.get(terrainType);
    const tool = TERRAIN.find((entry) => entry.terrainType === terrainType) || TERRAIN[0];
    const texture = this.textureLoader.load(tool.sprite);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    this.terrainTextures.set(terrainType, texture);
    return texture;
  }

  applyWhiteCutout(material) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (diffuseColor.a > 0.01 && diffuseColor.r > 0.94 && diffuseColor.g > 0.94 && diffuseColor.b > 0.94) discard;`
      );
    };
    material.customProgramCacheKey = () => 'arena-map-editor-white-cutout-v1';
    material.needsUpdate = true;
  }

  getItemTexture(itemId) {
    if (this.itemTextures.has(itemId)) return this.itemTextures.get(itemId);
    const item = ITEMS[itemId];
    const texture = this.textureLoader.load(
      item.sprite,
      (loaded) => {
        this.removeWhiteSpriteBackground(loaded);
        const state = loaded.userData || {};
        state.itemReady = true;
        loaded.userData = state;
        for (const callback of state.itemReadyCallbacks || []) callback();
        state.itemReadyCallbacks = [];
      },
      undefined,
      () => {
        // Keep failed/cross-origin assets invisible instead of showing
        // Three.js's default white placeholder square.
        texture.userData = { ...(texture.userData || {}), itemReady: false, itemLoadFailed: true };
      },
    );
    texture.userData = { itemReady: false, itemReadyCallbacks: [] };
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.premultiplyAlpha = false;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    this.itemTextures.set(itemId, texture);
    return texture;
  }

  bindItemTextureReady(texture, material, opacity) {
    const show = () => {
      if (texture.userData?.itemLoadFailed) return;
      material.opacity = opacity;
      material.needsUpdate = true;
    };
    if (texture.userData?.itemReady) show();
    else if (!texture.userData?.itemLoadFailed) {
      texture.userData.itemReadyCallbacks ||= [];
      texture.userData.itemReadyCallbacks.push(show);
    }
  }

  removeWhiteSpriteBackground(texture) {
    const image = texture?.image;
    if (!image || texture.userData?.whiteBackgroundRemoved) return;

    try {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) return;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, width, height);

      const pixels = ctx.getImageData(0, 0, width, height);
      const data = pixels.data;
      const visited = new Uint8Array(width * height);
      const queue = [];
      const isWhite = (index) => data[index + 3] > 8
        && data[index] >= 235 && data[index + 1] >= 235 && data[index + 2] >= 235;

      const push = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const p = y * width + x;
        if (visited[p]) return;
        visited[p] = 1;
        const i = p * 4;
        if (!isWhite(i)) return;
        queue.push(p);
      };

      for (let x = 0; x < width; x++) {
        push(x, 0);
        push(x, height - 1);
      }
      for (let y = 0; y < height; y++) {
        push(0, y);
        push(width - 1, y);
      }

      for (let head = 0; head < queue.length; head++) {
        const p = queue[head];
        data[p * 4 + 3] = 0;
        const x = p % width;
        const y = Math.floor(p / width);
        push(x - 1, y);
        push(x + 1, y);
        push(x, y - 1);
        push(x, y + 1);
      }

      ctx.putImageData(pixels, 0, 0);
      texture.image = canvas;
      texture.needsUpdate = true;
      texture.userData = { ...(texture.userData || {}), whiteBackgroundRemoved: true };
    } catch (error) {
      console.warn('[MapEditor] Não foi possível remover fundo branco do sprite:', error);
    }
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
    const root = this.group.children.find((o) => o.userData?.editorId === id);
    if (root) this.core.removeObject(root);
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
    if (['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) { e.preventDefault(); return true; }
    if (e.code === 'KeyR') {
      e.preventDefault();
      if (this.selectedTool?.kind !== 'select') {
        const step = THREE.MathUtils.degToRad(5);
        this.placementRotation += step;
        if (this.preview) {
          this.preview.rotation = this.placementRotation;
          this.preview.root.rotation.y = this.placementRotation;
        }
        this.setStatus('Rotação do item em mãos: ' + Math.round(THREE.MathUtils.radToDeg(this.placementRotation)) + '°');
        return true;
      }
      this.rotateSelected();
      return true;
    }
    if (e.code === 'BracketLeft') { e.preventDefault(); this.scaleSelected(0.9); return true; }
    if (e.code === 'BracketRight') { e.preventDefault(); this.scaleSelected(1.1); return true; }
    if (e.code === 'KeyC') { e.preventDefault(); this.toggleCollision(); return true; }
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); this.deleteSelected(); return true; }
    return false;
  }

  dispose() {
    this.navKeys.clear();
    this.edgePointer.active = false;
    this.core?.destroy();
    for (const data of [...this.objects]) {
      this.selected = data;
      this.removeCollision(data);
    }
    this.group.clear();
    this.scene.remove(this.group);
    this.el.remove();
  }
}
