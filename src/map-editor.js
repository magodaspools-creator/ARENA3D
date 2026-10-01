import * as THREE from 'three';
import { ITEMS } from './items.js';

const STORAGE_KEY = 'arena3d.map-editor.v1';

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
    this.palette = 'world';
    this.selectedTool = BUILTIN[0];
    this.seq = 0;
    this.selectionHelper = null;
    this.collisionHelpers = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.itemTextures = new Map();

    this.buildUI();
    this.load();
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
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
          <button type="button" data-editor-tab="world" class="active">Mundo</button>
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
    this.renderPalette();
  }

  toggle(force = !this.active) {
    if (force === this.active) return;
    this.active = force;
    this.el.classList.toggle('hidden', !force);

    if (force) {
      if (this.game.state === 'play') this.game.state = 'map-editor';
      this.game.inputLocked = true;
      this.game.ui.toast('Editor de mapa aberto.');
      this.setStatus('EDITOR ATIVO — clique no chão para colocar.');
      this.select(null);
    } else {
      if (this.game.state === 'map-editor') this.game.state = 'play';
      this.game.inputLocked = false;
      this.setStatus('Ctrl+Shift+T para fechar');
      this.select(null);
    }
  }

  setStatus(text) {
    const el = this.el.querySelector('#map-editor-status');
    if (el) el.textContent = text;
  }

  setPalette(tab) {
    this.palette = tab === 'items' ? 'items' : 'world';
    this.el.querySelectorAll('[data-editor-tab]').forEach((b) => b.classList.toggle('active', b.dataset.editorTab === this.palette));
    this.renderPalette();
  }

  renderPalette() {
    const palette = this.el.querySelector('#map-editor-palette');
    const tools = this.palette === 'items' ? this.itemTools : BUILTIN;
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
        this.setStatus('Selecionado: ' + next.name);
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
  }

  onPointerDown(event) {
    if (!this.active || event.button !== 0) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

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

    const point = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    if (!point) return;
    this.place(point.x, point.z);
  }

  place(x, z) {
    const data = {
      id: 'editor-' + (++this.seq),
      kind: this.selectedTool.kind,
      itemId: this.selectedTool.itemId || null,
      x: Number(x.toFixed(3)),
      y: 0,
      z: Number(z.toFixed(3)),
      rotation: 0,
      scale: 1,
      collision: !!this.selectedTool.collision,
      radius: this.selectedTool.kind === 'wall' ? 1.35 : 0.65,
      width: this.selectedTool.kind === 'wall' ? 3.2 : 1.4,
      depth: this.selectedTool.kind === 'wall' ? 0.9 : 1.4,
      height: this.selectedTool.kind === 'wall' ? 2.6 : 1.2,
    };
    this.objects.push(data);
    this.createObject(data);
    this.select(data);
    this.save();
    this.setStatus('Colocado. C = colisão ON/OFF · R = girar.');
  }

  createObject(data) {
    const root = new THREE.Group();
    root.position.set(data.x, data.y, data.z);
    root.rotation.y = data.rotation;
    root.scale.setScalar(data.scale);
    root.userData.editorId = data.id;

    let visual;
    if (data.kind === 'item') {
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
    this.save();
    this.setStatus(this.selected.collision ? 'Colisão ativada.' : 'Colisão removida.');
    this.select(this.selected);
  }

  rotateSelected() {
    if (!this.selected) return this.setStatus('Selecione um objeto primeiro.');
    this.selected.rotation += Math.PI / 12;
    const root = this.group.children.find((o) => o.userData?.editorId === this.selected.id);
    if (root) root.rotation.y = this.selected.rotation;
    this.save();
    this.setStatus('Objeto girado.');
  }

  scaleSelected(factor) {
    if (!this.selected) return this.setStatus('Selecione um objeto primeiro.');
    this.selected.scale = clamp(this.selected.scale * factor, 0.35, 3.5);
    const root = this.group.children.find((o) => o.userData?.editorId === this.selected.id);
    if (root) root.scale.setScalar(this.selected.scale);
    this.refreshCollision(this.selected);
    this.refreshHelper(this.selected);
    this.save();
    this.setStatus('Escala: ' + this.selected.scale.toFixed(2));
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
    this.save();
    this.setStatus('Objeto apagado.');
  }

  clearCreated() {
    if (!this.objects.length) return this.setStatus('Não há objetos criados pelo editor.');
    if (!confirm('Apagar todos os objetos criados pelo editor?')) return;
    for (const data of [...this.objects]) {
      this.selected = data;
      this.deleteSelected();
    }
    this.select(null);
    this.save();
    this.setStatus('Objetos do editor removidos.');
  }

  serialize() {
    return this.objects.map(({ _collider, ...data }) => ({ ...data }));
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, objects: this.serialize() }));
      this.setStatus('Mapa salvo neste navegador.');
    } catch (error) {
      console.warn('[MapEditor] Falha ao salvar:', error);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      for (const data of payload.objects || []) {
        this.objects.push(data);
        this.seq = Math.max(this.seq, Number(String(data.id).replace('editor-', '')) || 0);
        this.createObject(data);
      }
    } catch (error) {
      console.warn('[MapEditor] Falha ao carregar:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
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
        this.save();
        this.setStatus('JSON importado.');
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
