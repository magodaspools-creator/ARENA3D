import * as THREE from 'three';

export class MapEditorCore {
  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene
   * @param {THREE.Camera} options.camera
   * @param {THREE.WebGLRenderer} options.renderer
   * @param {number} [options.gridSize=2]
   * @param {Function} options.createMesh - (type) => THREE.Object3D
   * @param {Object} [options.collisionAdapter] - { add(obj, data), remove(obj, data), clear() }
   * @param {Function} [options.resolveY] - (x, z, type) => number
   * @param {Function} [options.disposeObject] - (obj) => void (gerenciado pelo AssetManager)
   */
  constructor({
    scene,
    camera,
    renderer,
    gridSize = 2,
    createMesh,
    collisionAdapter = null,
    objectContainer = null,
    resolveY = null,
    disposeObject = null
  }) {
    if (!scene) throw new Error('MapEditorCore: scene é obrigatória.');
    if (!camera) throw new Error('MapEditorCore: camera é obrigatória.');
    if (!renderer) throw new Error('MapEditorCore: renderer é obrigatório.');
    if (typeof createMesh !== 'function') {
      throw new Error('MapEditorCore: createMesh é obrigatória.');
    }

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.gridSize = gridSize;
    this.createMesh = createMesh;
    this.collisionAdapter = collisionAdapter;
    this.objectContainer = objectContainer || scene;

    // Y desacoplado (padrão: Y = 0).
    this.resolveY = resolveY || (() => 0);

    // Ownership dos recursos de objetos colocados fica com o AssetManager.
    this.customDispose = disposeObject;

    this.mapData = [];
    this.objects = new Map();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.ground = this.createGround();
    this.tool = 'ADD';
    this.selectedType = null;
    this.ghostRotation = 0;
    this.ghostMesh = null;
    this.enabled = false;

    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundContextMenu = this.onContextMenu.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
  }

  createGround() {
    // PlaneGeometry é a API moderna equivalente a PlaneBufferGeometry.
    const geometry = new THREE.PlaneGeometry(10000, 10000);
    const material = new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.DoubleSide
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.name = 'MapEditorGround';
    ground.userData.isEditorGround = true;

    this.scene.add(ground);
    return ground;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.boundPointerMove);
    canvas.addEventListener('pointerdown', this.boundPointerDown);
    canvas.addEventListener('contextmenu', this.boundContextMenu);
    window.addEventListener('keydown', this.boundKeyDown);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;

    this.hideGhost();

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.boundPointerMove);
    canvas.removeEventListener('pointerdown', this.boundPointerDown);
    canvas.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('keydown', this.boundKeyDown);
  }

  setGridSize(size) {
    if (!Number.isFinite(size) || size <= 0) return;
    this.gridSize = size;
    if (this.ghostMesh) this.updateGhostPosition();
  }

  snap(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Raycast de posicionamento: mundo exclusivo do ground.
   */
  getGroundPoint() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.ground, false);
    return hits.length ? hits[0].point : null;
  }

  /**
   * Raycast de remoção: mundo exclusivo dos objetos colocados.
   */
  getPlacedObjectAtPointer() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const placedObjects = [...this.objects.keys()];
    if (!placedObjects.length) return null;

    const hits = this.raycaster.intersectObjects(placedObjects, true);
    if (!hits.length) return null;

    let object = hits[0].object;
    while (object && !this.objects.has(object)) {
      object = object.parent;
    }

    return object || null;
  }

  selectType(type) {
    this.selectedType = type;
    this.ghostRotation = 0;
    this.createGhost();
  }

  setTool(tool) {
    if (tool !== 'ADD' && tool !== 'REMOVE') return;
    this.tool = tool;

    if (tool === 'REMOVE') {
      this.hideGhost();
    } else if (this.selectedType) {
      this.createGhost();
    }
  }

  createGhost() {
    this.hideGhost();
    if (!this.selectedType || this.tool !== 'ADD') return;

    const ghost = this.createMesh(this.selectedType);
    if (!ghost) return;

    this.ghostMesh = ghost;
    this.ghostMesh.name = 'MapEditorGhost';
    this.ghostMesh.userData.isEditorGhost = true;

    // O Ghost nunca participa de nenhum Raycast.
    this.ghostMesh.raycast = () => null;

    this.ghostMesh.traverse((child) => {
      child.raycast = () => null;

      if (!child.material) return;

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => {
          const clone = material.clone();
          clone.transparent = true;
          clone.opacity = 0.45;
          clone.depthWrite = false;
          clone.userData.editorOwnedMaterial = true;
          return clone;
        });
      } else {
        const clone = child.material.clone();
        clone.transparent = true;
        clone.opacity = 0.45;
        clone.depthWrite = false;
        clone.userData.editorOwnedMaterial = true;
        child.material = clone;
      }
    });

    this.ghostMesh.rotation.y = this.ghostRotation;
    this.scene.add(this.ghostMesh);
    this.updateGhostPosition();
  }

  disposeGhostMaterials(object) {
    if (!object) return;

    object.traverse((child) => {
      const materials = Array.isArray(child.material)
        ? child.material
        : child.material
          ? [child.material]
          : [];

      for (const material of materials) {
        if (material.userData?.editorOwnedMaterial) {
          material.dispose();
        }
      }
    });
  }

  hideGhost() {
    if (!this.ghostMesh) return;

    this.scene.remove(this.ghostMesh);

    // A geometria pode ser compartilhada pelo AssetManager.
    // Somente os materiais clonados exclusivamente para o Ghost são descartados.
    this.disposeGhostMaterials(this.ghostMesh);

    this.ghostMesh = null;
  }

  updateGhostPosition() {
    if (!this.ghostMesh || this.tool !== 'ADD') return;

    const point = this.getGroundPoint();
    if (!point) {
      this.ghostMesh.visible = false;
      return;
    }

    const x = this.snap(point.x);
    const z = this.snap(point.z);
    const y = this.resolveY(x, z, this.selectedType);

    this.ghostMesh.visible = true;
    this.ghostMesh.position.set(x, y, z);
    this.ghostMesh.rotation.y = this.ghostRotation;
  }

  rotateGhost() {
    if (!this.ghostMesh) return;

    this.ghostRotation =
      (this.ghostRotation + Math.PI / 2) % (Math.PI * 2);

    this.ghostMesh.rotation.y = this.ghostRotation;
  }

  onPointerMove(event) {
    if (!this.enabled) return;
    this.updatePointer(event);
    this.updateGhostPosition();
  }

  onPointerDown(event) {
    if (!this.enabled) return;

    // Proteção contra cliques iniciados em elementos HTML da UI.
    if (event.target !== this.renderer.domElement) return;

    // Sincroniza NDC no exato instante do clique.
    this.updatePointer(event);

    if (event.button === 2 || event.shiftKey) {
      if (event.button === 2) event.preventDefault();
      this.removeAtPointer();
      return;
    }

    if (event.button === 0 && this.tool === 'ADD') {
      this.addAtPointer();
    }
  }

  onContextMenu(event) {
    if (this.enabled) {
      event.preventDefault();
    }
  }

  onKeyDown(event) {
    if (!this.enabled) return;

    if (event.code === 'KeyR') {
      event.preventDefault();
      this.rotateGhost();
    }
  }

  addAtPointer() {
    if (!this.selectedType) return;

    const point = this.getGroundPoint();
    if (!point) return;

    const x = this.snap(point.x);
    const z = this.snap(point.z);
    const y = this.resolveY(x, z, this.selectedType);

    const data = {
      type: this.selectedType,
      x,
      y,
      z,
      rotY: this.ghostRotation
    };

    const object = this.createMesh(data);
    if (!object) return;

    object.position.set(data.x, data.y, data.z);
    object.rotation.y = data.rotY;
    object.userData.editorObject = true;
    object.userData.mapData = data;

    this.objectContainer.add(object);
    this.objects.set(object, data);
    this.mapData.push(data);

    if (this.collisionAdapter?.add) {
      this.collisionAdapter.add(object, data);
    }
  }

  removeAtPointer() {
    const object = this.getPlacedObjectAtPointer();
    if (!object) return;

    const data = this.objects.get(object);
    if (!data) return;

    this.removeObject(object);
  }

  removeObject(object) {
    if (!object || !this.objects.has(object)) return false;
    const data = this.objects.get(object);
    if (this.collisionAdapter?.remove) this.collisionAdapter.remove(object, data);
    this.objectContainer.remove(object);
    this.objects.delete(object);
    const index = this.mapData.indexOf(data);
    if (index !== -1) this.mapData.splice(index, 1);
    if (this.customDispose) this.customDispose(object);
    return true;
  }

  exportJSON() {
    return JSON.stringify(
      this.mapData.map(({ type, x, y, z, rotY }) => ({
        type,
        x,
        y,
        z,
        rotY
      })),
      null,
      2
    );
  }

  loadJSON(input) {
    let data;

    try {
      data = typeof input === 'string' ? JSON.parse(input) : input;
    } catch (error) {
      throw new Error('MapEditorCore: JSON inválido.');
    }

    if (!Array.isArray(data)) return;

    this.clear();

    for (const entry of data) {
      this.addFromData(entry);
    }
  }

  addObject(data) {
    if (!data || typeof data.kind !== 'string') return null;

    const normalized = data;
    normalized.x = Number.isFinite(Number(normalized.x)) ? Number(normalized.x) : 0;
    normalized.y = Number.isFinite(Number(normalized.y)) ? Number(normalized.y) : 0;
    normalized.z = Number.isFinite(Number(normalized.z)) ? Number(normalized.z) : 0;
    normalized.rotation = Number.isFinite(Number(normalized.rotation)) ? Number(normalized.rotation) : 0;
    normalized.scale = Number.isFinite(Number(normalized.scale)) ? Number(normalized.scale) : 1;

    const object = this.createMesh(normalized);
    if (!object) return null;

    object.position.set(normalized.x, normalized.y, normalized.z);
    object.rotation.y = normalized.rotation;
    object.scale.setScalar(normalized.scale);
    object.userData.editorObject = true;
    object.userData.mapData = normalized;

    this.objectContainer.add(object);
    this.objects.set(object, normalized);
    this.mapData.push(normalized);

    if (this.collisionAdapter?.add) {
      this.collisionAdapter.add(object, normalized);
    }

    return object;
  }

  addFromData(data) {
    if (!data || typeof data.type !== 'string') return null;

    const normalized = data;
    normalized.x = Number.isFinite(Number(normalized.x)) ? Number(normalized.x) : 0;
    normalized.y = Number.isFinite(Number(normalized.y)) ? Number(normalized.y) : 0;
    normalized.z = Number.isFinite(Number(normalized.z)) ? Number(normalized.z) : 0;
    normalized.rotation = Number.isFinite(Number(normalized.rotation)) ? Number(normalized.rotation) : 0;

    const object = this.createMesh(normalized);
    if (!object) return null;

    object.position.set(
      normalized.x,
      normalized.y,
      normalized.z
    );
    object.rotation.y = normalized.rotation;
    object.userData.editorObject = true;
    object.userData.mapData = normalized;

    this.objectContainer.add(object);
    this.objects.set(object, normalized);
    this.mapData.push(normalized);

    if (this.collisionAdapter?.add) {
      this.collisionAdapter.add(object, normalized);
    }

    return object;
  }

  clear() {
    for (const object of this.objects.keys()) {
      this.objectContainer.remove(object);

      if (this.customDispose) {
        this.customDispose(object);
      }
    }

    this.objects.clear();
    this.mapData.length = 0;

    if (this.collisionAdapter?.clear) {
      this.collisionAdapter.clear();
    }
  }

  destroy() {
    this.disable();
    this.clear();

    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      this.ground.material.dispose();
      this.ground = null;
    }
  }
}
