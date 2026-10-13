import * as THREE from 'three';

const STORE_KEY = 'arena3d.rock-removal-editor.v1';

export class RockRemovalTool {
  constructor(game) {
    this.game = game;
    this.active = true;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selected = null;
    this.appliedMesh = null;
    this.removed = this.readRemoved();
    this.panel = document.createElement('section');
    this.panel.id = 'rock-removal-tool';
    Object.assign(this.panel.style, {
      position: 'fixed', zIndex: '99999', top: '14px', left: '14px',
      width: 'min(340px, calc(100vw - 28px))', padding: '14px',
      background: 'rgba(12,16,20,.96)', color: '#f4f1e8',
      border: '1px solid #b9a27b', borderRadius: '10px',
      font: '13px/1.45 system-ui,sans-serif', boxShadow: '0 8px 30px #0009'
    });
    this.panel.innerHTML = `
      <strong style="font-size:15px">EDITOR DE OBJETOS — ARENA3D</strong>
      <p style="margin:7px 0">Clique no objeto que invade a cabana — pode ser muro, pedra ou prop. A ferramenta seleciona objetos 3D para identificar o tipo e as coordenadas.</p>
      <div id="rock-tool-selected" style="padding:8px;background:#222a2c;border-radius:6px;white-space:pre-wrap">Nenhum objeto selecionado.</div>
      <div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap">
        <button id="rock-tool-remove" type="button">Ocultar objeto (teste)</button>
        <button id="rock-tool-restore" type="button">Desfazer última</button>
        <button id="rock-tool-copy" type="button">Copiar dados do objeto</button>
        <button id="rock-tool-close" type="button">Fechar ferramenta</button>
      </div>
      <small style="display:block;margin-top:8px;color:#c9c3b8">Ocultar é apenas um teste local. Copie os dados do objeto e envie-os para eu corrigir a origem no mapa.</small>
    `;
    document.body.appendChild(this.panel);
    this.panel.querySelectorAll('button').forEach((b) => Object.assign(b.style, {
      cursor:'pointer', padding:'7px 9px', borderRadius:'5px', border:'1px solid #777',
      background:'#303a3d', color:'#fff'
    }));
    this.panel.querySelector('#rock-tool-remove').onclick = () => this.removeSelected();
    this.panel.querySelector('#rock-tool-restore').onclick = () => this.restoreLast();
    this.panel.querySelector('#rock-tool-copy').onclick = () => this.copyCoordinates();
    this.panel.querySelector('#rock-tool-close').onclick = () => {
      this.active = false;
      this.panel.remove();
      this.game.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown, true);
      window.removeEventListener('keydown', this.onKeyDown, true);
    };
    this.onPointerDown = (event) => this.handlePointerDown(event);
    this.onKeyDown = (event) => {
      if (!this.active || event.key !== 'Escape') return;
      this.selected = null;
      this.updateLabel('Seleção limpa. Clique numa pedra.');
    };
    this.game.renderer.domElement.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  readRemoved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch { return []; }
  }

  saveRemoved() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.removed));
  }

  getRockMesh() {
    const mesh = this.game.scene.getObjectByName('arena-procedural-rocks');
    if (mesh && mesh !== this.appliedMesh) {
      this.appliedMesh = mesh;
      this.applySavedRemovals(mesh);
    }
    return mesh;
  }

  matrixFor(index) {
    const mesh = this.getRockMesh();
    if (!mesh || index < 0 || index >= mesh.count) return null;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return matrix;
  }

  positionFor(index) {
    const matrix = this.matrixFor(index);
    if (!matrix) return null;
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    return { x: p.x, y: p.y, z: p.z };
  }

  applySavedRemovals(mesh = this.game.scene.getObjectByName('arena-procedural-rocks')) {
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (const item of this.removed) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        pos.setFromMatrixPosition(matrix);
        if (Math.abs(pos.x-item.x) < 0.025 && Math.abs(pos.z-item.z) < 0.025) {
          matrix.decompose(pos, quat, scale);
          mesh.setMatrixAt(i, new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(0,0,0)));
          break;
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  handlePointerDown(event) {
    if (!this.active || event.button !== 0) return;
    const canvas = this.game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.game.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const hits = this.raycaster.intersectObjects(this.game.scene.children, true).filter((h) => {
      const o = h.object;
      if (!o?.isMesh || !o.geometry) return false;
      const n = String(o.name || '').toLowerCase();
      return !/(ground|terrain|floor|water|player|enemy|npc|loot|particle|effect|projectile|attack|shadow)/.test(n);
    });
    const hit = hits[0] || null;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!hit) {
      this.selected = null;
      this.updateLabel('Nenhum objeto selecionável atingido. Tente clicar no meio do objeto, evitando o chão.');
      return;
    }
    const object = hit.object;
    const world = new THREE.Vector3();
    object.getWorldPosition(world);
    this.selected = {
      object, name: object.name || '(sem nome)',
      type: object.isInstancedMesh ? 'InstancedMesh' : object.type,
      x: world.x, y: world.y, z: world.z,
      uuid: object.uuid,
      parent: object.parent?.name || object.parent?.type || '(sem pai)'
    };
    this.updateLabel('Objeto: ' + this.selected.name +
      '\nTipo: ' + this.selected.type +
      '\nPai: ' + this.selected.parent +
      '\nX: ' + world.x.toFixed(3) +
      '\nY: ' + world.y.toFixed(3) +
      '\nZ: ' + world.z.toFixed(3));
  }

  updateLabel(text) {
    const el = this.panel?.querySelector('#rock-tool-selected');
    if (el) el.textContent = text;
  }

  removeSelected() {
    if (!this.selected?.object) { this.updateLabel('Selecione um objeto primeiro.'); return; }
    const s = this.selected;
    s.object.visible = false;
    this.removed.push({ name: s.name, type: s.type, parent: s.parent, x: s.x, y: s.y, z: s.z, uuid: s.uuid });
    this.saveRemoved();
    this.updateLabel('Objeto ocultado apenas nesta sessão.\n' + JSON.stringify({
      name: s.name, type: s.type, parent: s.parent,
      x: Number(s.x.toFixed(3)), y: Number(s.y.toFixed(3)), z: Number(s.z.toFixed(3))
    }, null, 2) + '\nCopie os dados antes de recarregar.');
    this.selected = null;
  }

  restoreLast() {
    if (!this.removed.length) { this.updateLabel('Nenhum objeto foi ocultado nesta sessão.'); return; }
    this.removed.pop();
    this.saveRemoved();
    location.reload();
  }

  async copyCoordinates() {
    const text = JSON.stringify(this.removed, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      this.updateLabel('Coordenadas copiadas. Cole-as aqui na conversa para corrigir o mapa definitivo.');
    } catch {
      this.updateLabel('Copie manualmente as coordenadas abaixo:\n' + text);
    }
  }
}
