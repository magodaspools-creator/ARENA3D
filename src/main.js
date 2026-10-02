import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js?v=20261002-3';
import { CameraRig } from './camera.js?v=20261002-3';
import { Collision, initCollision } from './collision.js?v=20261002-5';
import { Effects } from './effects.js?v=20261002-3';
import { Combat } from './combat.js?v=20261002-3';
import { UI } from './ui.js?v=20261002-3';
import { Interaction } from './interaction.js?v=20261002-3';
import { Dialogue } from './npc.js?v=20261002-3';
import { Player } from './player.js?v=20261002-3';
import { VOCATIONS } from './vocations.js?v=20261002-3';
import { createArea1 } from './areas/area1.js?v=20261002-3';

const FOG = 0x0b1220;

class Game {
  constructor() {
    const container = document.getElementById('game');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.FogExp2(FOG, 0.021);
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 220);

    this.setupLights();

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.75, 0.5, 0.85);
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

    this.area = createArea1(this);
    this.player = null;

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    addEventListener('resize', () => this.resize());
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && this.state === 'play') this.ui.toggleHelp();
      if (e.code === 'KeyI' && this.state === 'play' && !e.repeat) this.ui.toggleItems();
      if (e.code === 'F3' && !e.repeat) this.collision.toggleDebug(this.scene);
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

  // ---------- flow ----------
  preview(id) {
    this.player?.dispose();
    this.player = new Player(this, id);
    const s = this.area.spawn;
    this.player.place(s.x, s.z, 0);
    this.rig.mode = 'preview';
    this.rig.snap(this.player.pos);
    this.player.anim.attack(this.player.voc.attack.style, 0.8);
  }

  start(id) {
    if (!this.player || this.player.voc.id !== id) this.preview(id);
    const s = this.area.spawn;
    this.player.place(s.x, s.z, s.facing);
    this.rig.mode = 'follow';
    this.state = 'play';
    this.stats.start = this.time;
    this.ui.showHud(this.player.voc);
    this.area.onStart();
  }

  addEnemy(e) { this.enemies.push(e); return e; }

  onEnemyKilled(e) {
    if (!e.isBoss) this.stats.kills++;
    this.area.onEnemyKilled(e);
  }

  onPlayerDied() {
    this.stats.deaths++;
    this.combat.clearEnemyProjectiles();
    this.schedule(1.0, () => this.ui.showDeath(true));
    this.schedule(2.8, () => this.ui.fade(true));
    this.schedule(3.7, () => {
      const c = this.area.checkpoint;
      this.area.onRespawn();
      for (const e of this.enemies) if (!e.isBoss && e.alive && e.state !== 'idle') { e.state = 'return'; }
      this.player.revive(c.x, c.z, c.facing);
      this.rig.snap(this.player.pos);
      this.ui.showDeath(false);
      this.ui.fade(false);
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
        const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + p.radius;
        if (d < min && d > 1e-4) this.collision.move(p.pos, (dx / d) * (min - d), (dz / d) * (min - d), p.radius);
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
      for (const e of this.enemies) e.update(dt);
      this.enemies = this.enemies.filter((e) => !e.removed);
      this.resolveBodies();
      this.combat.update(dt);
      this.interaction.update();
      this.dialogue.update(dt);
    }
    for (const n of this.npcs) n.update(dt);
    this.area.update(dt, this.time);
    this.fx.update(dt);

    if (p) {
      this.rig.update(dt, p.pos, this.state === 'play' && !this.inputLocked ? this.input : null);
      this.moon.target.position.copy(p.pos);
      this.moon.position.copy(p.pos).add(this.moonOffset);
    }
    this.ui.update(dt);
    this.input.endFrame();
    this.composer.render();
  }
}

async function boot() {
  const loading = document.getElementById('loading');
  const setBootStage = (message) => {
    if (loading) loading.textContent = message;
  };

  try {
    setBootStage('Carregando motor físico…');
    await initCollision();
    setBootStage('Montando a Arena…');
    window.game = new Game();
  } catch (error) {
    console.error('Arena startup failed:', error);
    const message = error?.stack || error?.message || String(error);
    if (loading) {
      loading.textContent = 'Erro ao iniciar: ' + message;
      loading.style.whiteSpace = 'pre-wrap';
      loading.style.maxWidth = '92vw';
      loading.style.padding = '18px';
      loading.style.textAlign = 'left';
      loading.style.fontFamily = 'monospace';
      loading.style.fontSize = '12px';
      loading.style.zIndex = '99999';
    }
  }
}

boot();
