import * as THREE from 'three';

const STORE_KEY = 'arena3d.rock-removal-editor.v1';

export class RockRemovalTool {
  constructor(game) {
    this.game = game;
    this.active = true;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selected = null;
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
      <strong style="font-size:15px">EDITOR DE PEDRAS — ARENA3D</strong>
      <p style="margin:7px 0">Clique diretamente na pedra que invade a cabana. Use WASD para se aproximar. O modo normal de ataque fica bloqueado enquanto esta ferramenta estiver ativa.</p>
      <div id="rock-tool-selected" style="padding:8px;background:#222a2c;border-radius:6px;white-space:pre-wrap">Nenhuma pedra selecionada.</div>
      <div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap">
        <button id="rock-tool-remove" type="button">Remover pedra</button>
        <button id="rock-tool-restore" type="button">Desfazer última</button>
        <button id="rock-tool-copy" type="button">Copiar coordenadas</button>
        <button id="rock-tool-close" type="button">Fechar ferramenta</button>
      </div>
      <small style="display:block;margin-top:8px;color:#c9c3b8">Remoções ficam salvas neste navegador enquanto você testa. Copie as coordenadas e envie-as para aplicar a correção definitiva no jogo.</small>
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
    this.applySavedRemovals();
  }

  readRemoved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch { return []; }
  }

  saveRemoved() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.removed));
  }

  getRockMesh() {
    return this.game.scene.getObjectByName('arena-procedural-rocks');
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

  applySavedRemovals() {
    const mesh = this.getRockMesh();
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
    const mesh = this.getRockMesh();
    const hit = mesh ? this.raycaster.intersectObject(mesh, false)[0] : null;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!hit || hit.instanceId == null) {
      this.selected = null;
      this.updateLabel(mesh ? 'Nenhuma pedra atingida. Aproxime a câmera e clique no corpo da pedra.' : 'Pedras ainda não carregadas. Entre no mapa 1 e tente novamente.');
      return;
    }
    const pos = this.positionFor(hit.instanceId);
    this.selected = { index: hit.instanceId, ...pos };
    this.updateLabel('Pedra selecionada\nX: ' + pos.x.toFixed(3) + '\nZ: ' + pos.z.toFixed(3) + '\nÍndice: ' + hit.instanceId);
  }

  updateLabel(text) {
    const el = this.panel?.querySelector('#rock-tool-selected');
    if (el) el.textContent = text;
  }

  removeSelected() {
    if (!this.selected) { this.updateLabel('Selecione uma pedra primeiro.'); return; }
    const mesh = this.getRockMesh();
    if (!mesh) return;
    const matrix = this.matrixFor(this.selected.index);
    if (!matrix) return;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(pos, quat, scale);
    mesh.setMatrixAt(this.selected.index, new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(0,0,0)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.removed.push({ x: this.selected.x, z: this.selected.z });
    this.saveRemoved();
    this.updateLabel('Pedra removida neste navegador.\nX: ' + this.selected.x.toFixed(3) + '\nZ: ' + this.selected.z.toFixed(3));
    this.selected = null;
  }

  restoreLast() {
    const last = this.removed.pop();
    this.saveRemoved();
    const mesh = this.getRockMesh();
    if (mesh && last) {
      const matrix = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      for (let i=0;i<mesh.count;i++) {
        mesh.getMatrixAt(i,matrix); matrix.decompose(p,q,s);
        if (Math.abs(p.x-last.x)<0.025 && Math.abs(p.z-last.z)<0.025) {
          const source = new THREE.Matrix4();
          // Restore the original transform from the seeded mesh by reloading the page.
          this.updateLabel('Desfazer salvo. Recarregue a página para restaurar a pedra.');
          location.reload();
          return;
        }
      }
    }
    this.updateLabel(last ? 'Última remoção desfeita; recarregando o mapa.' : 'Não há remoções para desfazer.');
    if (last) location.reload();
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
