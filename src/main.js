import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Collision } from './collision.js';
import { Effects } from './effects.js';
import { Combat } from './combat.js';
import { UI } from './ui.js?v=new-character-tutorial-20261009a';
import { Interaction } from './interaction.js';
import { Dialogue } from './npc.js';
import { Player } from './player.js';
import { loadPlayerRig } from './gltf-humanoid.js';
import { createHumanoid } from './models.js';
import { VOCATIONS } from './vocations.js';
import { CharacterState } from './character-state.js';
import { getItem } from './items.js';
import { FORGE_UPGRADES, FORGE_RECIPES, FORGE_RECYCLE } from './forge.js';
import { GroundLoot, DeathBackpack } from './ground-loot.js';
import { createArea1 } from './areas/area1.js';
import { createArea2 } from './areas/area2.js';
import { KayKitEnvironment, preloadKayKitEnemyAssets, preloadKayKitAssetsSpaced, loadKayKitEnemyRig } from './kaykit-assets.js';

const MODEL_MODE = new URLSearchParams(location.search).get('modelo');
// The published game uses the finalized vocation GLTFs by default.
// `?modelo=procedural` remains available only as a development fallback.
const USE_GLTF_PLAYER = MODEL_MODE !== 'procedural';
import { MapEditor } from './map-editor.js';

const FOG = 0x080b12;
const LOW_QUALITY_FOG = 0x10201d;

const QUALITY_CONFIG = {
  minima: { antialias: false, pixelRatio: 1, scale: 0.75, shadows: false, bloom: false, fog: 0, simpleMaterials: true, particleScale: 0.2, maxAnimatedEnemies: 4, maxAnimatedEnemyDistance: 16, renderCap: 30 },
  leve:   { antialias: false, pixelRatio: 1, scale: 0.85, shadows: false, bloom: false, fog: 0.0045, simpleMaterials: true, particleScale: 0.25, maxAnimatedEnemies: 5, maxAnimatedEnemyDistance: 18, renderCap: 45 },
  baixa:  { antialias: false, pixelRatio: 1, scale: 1, shadows: false, bloom: false, fog: 0.006, simpleMaterials: false, particleScale: 0.5, maxAnimatedEnemies: 7, maxAnimatedEnemyDistance: 20, renderCap: 60 },
  media:  { antialias: false, pixelRatio: 1.5, scale: 1, shadows: true, bloom: true, bloomStrength: 0.28, fog: 0.0105, simpleMaterials: false, particleScale: 1, maxAnimatedEnemies: 12, maxAnimatedEnemyDistance: 28, renderCap: 60 },
  alta:   { antialias: true, pixelRatio: 1.25, scale: 1, shadows: true, bloom: true, bloomStrength: 0.42, fog: 0.0105, simpleMaterials: false, particleScale: 0.8, maxAnimatedEnemies: 14, maxAnimatedEnemyDistance: 28, renderCap: 45 },
}

function detectGpuRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance' }) ||
      canvas.getContext('webgl', { powerPreference: 'high-performance' });
    if (!gl) return 'unknown';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown') : String(gl.getParameter(gl.RENDERER) || 'unknown');
  } catch { return 'unknown'; }
}

function isWeakGpu(name) {
  return /(intel.*(hd|uhd)|intel.*graphics|iris.*(old|xe-less)|mali-[456]|adreno 3|adreno 4|geforce 6|geforce 7|radeon (hd|r[3-6]))/i.test(name);
}

function resolveQuality() {
  const params = new URLSearchParams(location.search);
  const requested = String(params.get('qualidade') || '').toLowerCase();
  if (QUALITY_CONFIG[requested]) return { name: requested, explicit: true, reason: 'URL' };
  const mobile = matchMedia('(max-width: 800px)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const gpu = detectGpuRenderer();
  if (isWeakGpu(gpu)) return { name: 'leve', explicit: false, reason: 'GPU fraca' };
  if (mobile) return { name: 'baixa', explicit: false, reason: 'celular' };
  return { name: 'media', explicit: false, reason: 'padrão' };
}

const DARK_FANTASY_PASS = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.72 },
    uExposure: { value: 0.92 },
    uContrast: { value: 1.08 },
    uSaturation: { value: 0.92 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uExposure;
    uniform float uContrast;
    uniform float uSaturation;
    varying vec2 vUv;

    vec3 grade(vec3 c) {
      c *= uExposure;
      c = (c - 0.5) * uContrast + 0.5;

      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, uSaturation);

      // Slightly cool shadows and warm highlights.
      float hi = smoothstep(0.22, 0.92, lum);
      c *= mix(vec3(0.88, 0.94, 1.04), vec3(1.06, 0.98, 0.88), hi);

      return max(c, 0.0);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = grade(src.rgb);

      vec2 p = vUv - 0.5;
      p.x *= 1.08;
      float d = length(p);
      float vignette = smoothstep(0.90, 0.34, d);
      vignette = mix(1.0 - uVignette, 1.0, vignette);

      // Very subtle breathing avoids a completely static post-process.
      float pulse = 1.0 + sin(uTime * 0.55) * 0.008;
      c *= vignette * pulse;

      gl_FragColor = vec4(c, src.a);
    }
  `
};

class Game {
  constructor() {
    const container = document.getElementById('game');
    const qualityState = resolveQuality();
    const quality = QUALITY_CONFIG[qualityState.name];
    this.qualityName = qualityState.name;
    this.qualityConfig = quality;
    this.qualityExplicit = qualityState.explicit;
    this.gpuRenderer = detectGpuRenderer();

    const renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(innerWidth * quality.scale, innerHeight * quality.scale, false);
    renderer.shadowMap.enabled = quality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    const sceneFogColor = (this.qualityName === 'minima' || this.qualityName === 'leve') ? LOW_QUALITY_FOG : FOG;
    this.scene.background = new THREE.Color(sceneFogColor);
    this.scene.fog = quality.fog > 0 ? new THREE.FogExp2(sceneFogColor, quality.fog) : null;
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 220);

    this.setupLights();

    this.composer = null;
    this.bloom = null;
    this.atmospherePass = null;
    if (quality.bloom) {
      this.composer = new EffectComposer(renderer);
      this.composer.setPixelRatio(Math.min(quality.pixelRatio, 1.5));
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), quality.bloomStrength, 0.48, 0.82);
      this.composer.addPass(this.bloom);
      this.atmospherePass = new ShaderPass(DARK_FANTASY_PASS);
      this.composer.addPass(this.atmospherePass);
      this.composer.addPass(new OutputPass());
    }

    this.time = 0;
    this.frame = 0;
    this.timers = [];
    this.hitstop = 0;
    this.state = 'menu';
    this.activeCharacterId = null;
    this.activeCharacterName = '';
    this.activeCharacterGender = 'male';
    this.activeCharacterGameState = {};
    this.isNewCharacter = false;
    this.inputLocked = false;
    this.stats = { kills: 0, deaths: 0, damage: 0, start: 0, bossTime: 0 };

    // Optional lightweight FPS monitor; inactive unless ?fps=1 is present.
    this.fpsEnabled = new URLSearchParams(location.search).get('fps') === '1';
    this.fpsFrames = 0;
    this.fpsElapsed = 0;
    this.fpsEl = null;
    this.qualityEl = document.createElement('div');
    this.qualityEl.id = 'quality-indicator';
    this.qualityEl.textContent = 'Qualidade: ' + this.qualityName.toUpperCase();
    document.getElementById('ui')?.appendChild(this.qualityEl);

    this.debugEnabled = new URLSearchParams(location.search).get('debug') === '1';
    this.debugEl = null;
    if (this.debugEnabled) {
      this.debugEl = document.createElement('div');
      this.debugEl.id = 'debug-counter';
      document.getElementById('ui')?.appendChild(this.debugEl);
    }

    this.autoPerfElapsed = 0;
    this.autoPerfFrames = 0;
    this.autoPerfDone = this.qualityExplicit;
    if (this.fpsEnabled) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.id = 'fps-counter';
      this.fpsEl.textContent = 'FPS: --';
      document.getElementById('ui')?.appendChild(this.fpsEl);
    }

    this.input = new Input(renderer.domElement);
    this.ui = new UI(this);
    this.rig = new CameraRig(this.camera);
    this.collision = new Collision();
    this.fx = new Effects(this);
    this.fx.setQuality?.(this.qualityName);
    this.combat = new Combat(this);
    this.interaction = new Interaction(this);
    this.dialogue = new Dialogue(this);
    this.enemies = [];
    this.npcs = [];
    this.groundLoot = [];
    this.deathBackpacks = [];

    this.area = createArea1(this);
    this.kaykitEnvironment = new KayKitEnvironment(this);
    this.kaykitEnvironmentReady = this.kaykitEnvironment.rebuild().catch((error) => {
      console.warn('[ARENA] KayKit environment unavailable.', error);
      return null;
    });
    this.graphicsReady = false;
    this.debugTransitions = new URLSearchParams(location.search).get('debug') === '1';
    this.mapAssetPreload = null;
    this._mapTransitionBusy = false;
    if (this.debugTransitions) console.info('[ARENA] Map asset manifest', {
      forest: {
        build: 'procedural terrain, cemetery, ruins, boss arena, portals, NPCs',
        kaykit: ['floor-tile.glb', 'floor-grate.glb', 'wall-broken.glb', 'pillar.glb', 'torch.glb', 'rubble.glb', 'chest.glb', 'banner.glb'],
        enemyRigs: ['Skeleton_Minion.glb', 'Skeleton_Mage.glb', 'Skeleton_Rogue.glb', 'Skeleton_Warrior.glb'],
      },
      mine: {
        build: 'prebuilt procedural cave geometry, props, lights and boss',
        textures: ['assets/mine/spider-webs.svg', 'assets/mine/spider-cocoons.svg'],
        enemyRigsSharedWithForest: ['Skeleton_Mage.glb', 'Skeleton_Minion.glb', 'Skeleton_Rogue.glb'],
      },
      desert: {
        build: 'procedural dunes, oasis, caravan, temple, portals and Sun God boss',
        textures: 'no map-specific external texture files',
        enemyRigsSharedWithForest: ['Skeleton_Minion.glb', 'Skeleton_Rogue.glb', 'Skeleton_Mage.glb', 'Skeleton_Warrior.glb'],
      },
    });
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
      if (e.code === 'KeyM' && (this.state === 'play' || this.state === 'world-map')) {
        e.preventDefault();
        if (this.state === 'world-map') this.closeWorldMap();
        else this.openWorldMap();
        return;
      }
      if (e.code === 'Escape' && this.state === 'world-map') { e.preventDefault(); this.closeWorldMap(); return; }
      if (e.code === 'Escape' && this.state === 'play') { e.preventDefault(); this.pauseGame(); return; }
      if (e.code === 'Escape' && this.state === 'pause-controls') { e.preventDefault(); this.showPauseMenu(); return; }
      if (e.code === 'Escape' && this.state === 'pause') { e.preventDefault(); this.resumeGame(); return; }

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
      if (e.code === 'Escape' && this.state === 'forge') this.closeForge();
    });
    document.getElementById('main-menu')?.classList.remove('hidden');
    document.getElementById('select')?.classList.add('hidden');
    document.getElementById('menu-new-game')?.addEventListener('click', async () => { await window.__arenaAccountMenuReady; window.dispatchEvent(new Event('arena:new-character')); });
    document.getElementById('menu-continue')?.addEventListener('click', async () => { await window.__arenaAccountMenuReady; window.dispatchEvent(new Event('arena:continue')); });
    document.getElementById('menu-settings')?.addEventListener('click', () => this.openMainMenuSettings());
    document.getElementById('menu-exit')?.addEventListener('click', () => {
      this.showMenuMessage('Até a próxima', 'Você pode fechar esta aba do navegador quando quiser. O jogo não pode fechar a aba automaticamente por segurança.');
    });
    document.getElementById('menu-dialog-close')?.addEventListener('click', () => this.closeMenuDialog());
    document.getElementById('menu-dialog-confirm')?.addEventListener('click', () => this.closeMenuDialog());
    document.getElementById('menu-apply-settings')?.addEventListener('click', () => {
      const quality = document.getElementById('menu-quality')?.value;
      if (quality && QUALITY_CONFIG[quality]) this.setQuality(quality, 'menu');
    });
    const savedQuality = new URLSearchParams(location.search).get('qualidade') || this.qualityName;
    const qualitySelect = document.getElementById('menu-quality');
    if (qualitySelect && QUALITY_CONFIG[savedQuality]) qualitySelect.value = savedQuality;
    this.ui.setStartLoading?.(true);
    this.ui.setAssetLoadingProgress?.(0, 'Preparando gráficos...');
    this.fx.resize(renderer.getDrawingBufferSize(new THREE.Vector2()).y);
    this.applyQualityToObject(this.scene);
    this.maxAnimatedEnemyDistance = quality.maxAnimatedEnemyDistance;
    this.prepareGraphics().catch((error) => {
      console.warn('[ARENA] Graphics preparation failed; gameplay can still use fallbacks.', error);
      this.graphicsReady = true;
      this.ui.setStartLoading?.(false);
    });

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
    document.getElementById('forge-close').onclick = () => this.closeForge();
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

  openMainMenuSettings() {
    const dialog = document.getElementById('menu-dialog');
    const options = document.getElementById('menu-settings-options');
    const confirm = document.getElementById('menu-dialog-confirm');
    const title = document.getElementById('menu-dialog-title');
    const description = document.getElementById('menu-dialog-description');
    if (!dialog || !options || !confirm) return;
    title.textContent = 'Configurações';
    description.textContent = 'Ajuste a qualidade gráfica para equilibrar desempenho e fidelidade visual.';
    document.getElementById('menu-dialog-custom')?.classList.add('hidden');
    if (document.getElementById('menu-dialog-custom')) document.getElementById('menu-dialog-custom').innerHTML = '';
    options.classList.remove('hidden');
    confirm.classList.add('hidden');
    dialog.classList.remove('hidden');
  }

  showMenuMessage(titleText, message) {
    const dialog = document.getElementById('menu-dialog');
    if (!dialog) return;
    document.getElementById('menu-dialog-title').textContent = titleText;
    document.getElementById('menu-dialog-description').textContent = message;
    document.getElementById('menu-settings-options').classList.add('hidden');
    document.getElementById('menu-dialog-custom')?.classList.add('hidden');
    document.getElementById('menu-dialog-confirm').classList.remove('hidden');
    dialog.classList.remove('hidden');
  }

  closeMenuDialog() {
    document.getElementById('menu-dialog')?.classList.add('hidden');
    const custom = document.getElementById('menu-dialog-custom');
    if (custom) { custom.classList.add('hidden'); custom.innerHTML = ''; }
    document.getElementById('menu-settings-options')?.classList.remove('hidden');
    document.getElementById('menu-dialog-confirm')?.classList.add('hidden');
  }

  setupLights() {
    const isMinima = this.qualityName === 'minima';
    const isLeve = this.qualityName === 'leve';

    const hemi = new THREE.HemisphereLight(
      0x52706a,
      0x14211d,
      isMinima ? 0.60 : isLeve ? 0.60 : 0.48
    );
    this.scene.add(hemi);

    if (isMinima) {
      this.scene.add(new THREE.AmbientLight(0x78958c, 0.25));
    }

    // LEVE: one non-shadow directional. MINIMA: Ambient + Hemisphere only.
    const moon = new THREE.DirectionalLight(
      0x8caea2,
      isMinima ? 0.0 : isLeve ? 0.25 : 0.82
    );
    moon.castShadow = !!this.qualityConfig.shadows;
    if (isLeve) moon.castShadow = false;
    if (moon.castShadow) {
      const map = this.qualityName === 'alta' ? 2048 : 1024;
      moon.shadow.mapSize.set(map, map);
      moon.shadow.bias = -0.0008;
      moon.shadow.normalBias = 0.03;
      const s = moon.shadow.camera;
      s.left = -28; s.right = 28; s.top = 28; s.bottom = -28; s.near = 1; s.far = 90;
    }
    this.moonOffset = new THREE.Vector3(-18, 34, 14);
    if (!isMinima) this.scene.add(moon, moon.target);
    this.moon = moon;
  }

  applyQualityToObject(root) {
    if (!root || !this.qualityConfig.simpleMaterials) return;
    // Keep the original GLTF material. KayKit uses an atlas and animated
    // characters are SkinnedMesh objects; swapping material classes here was
    // the main low-quality visual regression.
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) m.map.anisotropy = 1;
        // Keep the original GLTF emissive exactly as authored. KayKit's
        // floor/character materials do not use emissive; injecting it here
        // makes the whole low-quality scene look washed out.
        m.needsUpdate = true;
      }
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }

  setQuality(name, reason = 'URL') {
    if (!QUALITY_CONFIG[name] || name === this.qualityName) return;
    location.search = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), qualidade: name }).toString();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth * this.qualityConfig.scale, innerHeight * this.qualityConfig.scale, false);
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
    this.fx.resize(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  }

  // ---------- world persistence ----------
  worldStorageKey() {
    const vocation = this.character?.vocation;
    return this.activeCharacterId ? `arena.world.v1.${this.activeCharacterId}` : vocation ? `arena.world.v1.${vocation}` : null;
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
    // Character selection no longer instantiates a Player. The gameplay Player
    // is created exactly once, after the final rig has finished loading.
    this.previewVocation = id;
  }

  async prepareGraphics() {
    // MEDIA/ALTA keep their existing loading path untouched.
    if (!['minima', 'leve', 'baixa'].includes(this.qualityName)) {
      this.graphicsReady = true;
      this.ui.setAssetLoadingProgress?.(100, 'Gráficos prontos');
      this.ui.setStartLoading?.(false);
      return;
    }

    // Low tiers share one asset cache. Prepare forest assets and all enemy rigs
    // before play; Area 2 reuses those rigs and is otherwise procedural.
    await this.kaykitEnvironmentReady;
    this.ui.setAssetLoadingProgress?.(30, 'Cenário carregado');

    await preloadKayKitEnemyAssets((done, total, key) => {
      this.ui.setAssetLoadingProgress?.(30 + Math.round(done / total * 35), 'Preparando inimigos: ' + key);
    });
    this.ui.setAssetLoadingProgress?.(70, 'Inimigos carregados');

    // All assets needed by the current forest and the desert's shared enemy
    // rigs are ready. Remaining optional assets are warmed in the background
    // after play starts, one file per idle turn.
    this.ui.setAssetLoadingProgress?.(88, 'Recursos dos próximos mapas preparados');

    // Warm the low-quality material programs before gameplay.
    // compileAsync is intentionally skipped for the expensive high tiers here.
    if (['minima', 'leve', 'baixa'].includes(this.qualityName)) {
      this.camera.updateMatrixWorld(true);
      this.scene.updateMatrixWorld(true);
      await this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
      for (const type of ['zombie', 'wisp', 'scorpion', 'hollow']) {
        try {
          const rig = await loadKayKitEnemyRig(type, 2);
          rig.root.updateMatrixWorld(true);
          await this.renderer.compileAsync(rig.root, this.camera, this.scene).catch(() => {});
        } catch (error) {
          console.warn('[ARENA] Enemy shader warmup skipped:', type, error);
        }
      }
    }

    this.graphicsReady = true;
    this.ui.setAssetLoadingProgress?.(100, 'Gráficos prontos');
    this.ui.setStartLoading?.(false);
  }

  async start(id, options = {}) {
    if (!id || this.player || this.startingPlayer || !this.graphicsReady) return;

    this.activeCharacterId = options.characterId || null;
    this.activeCharacterName = options.name || VOCATIONS[id]?.name || '';
    this.activeCharacterGender = options.gender || 'male';
    this.activeCharacterGameState = options.gameState || {};
    this.isNewCharacter = options.isNew ?? !options.characterId;
    if (this.isNewCharacter && !this.activeCharacterId) {
      try { localStorage.removeItem(`arena.character.v1.${id}`); localStorage.removeItem(`arena.world.v1.${id}`); } catch {}
    }
    this.startingPlayer = true;
    this.inputLocked = true;
    this.ui.setStartLoading?.(true);

    try {
      const look = VOCATIONS[id]?.look || {};
      let finalRig = null;

      // With the real-GLTF player enabled, wait for the selected vocation model.
      // Do not silently replace it with the old procedural/robot character.
      if (USE_GLTF_PLAYER) {
        finalRig = await loadPlayerRig(look, createHumanoid, id);
        this.applyQualityToObject(finalRig?.root);
      } else {
        finalRig = createHumanoid(look);
        finalRig.isProceduralFallback = true;
      }

      // The player is instantiated exactly once, after the final rig exists.
      this.character = new CharacterState(id, this.activeCharacterId);
      this.player = new Player(this, id, finalRig);
      if (this.qualityName === 'minima' || this.qualityName === 'leve') {
        this.camera.updateMatrixWorld(true);
        this.scene.updateMatrixWorld(true);
        await this.renderer.compileAsync(finalRig.root, this.camera, this.scene).catch(() => {});
      }

    const saved = this.isNewCharacter ? null : this.loadWorldState();
    if (saved?.area === 'area2') {
      this.returnEnemies = this.enemies;
      this.enemies = [];
      // Clear forest props before Area 2 snapshots collision/interaction registries,
      // so its dispose() baseline never counts stale forest-only entries.
      this.kaykitEnvironment?.clear?.();
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
    this.ui.hideSelect();
    this.area.onStart();
    this.saveWorldState();
    this.isNewCharacter = false;
    window.dispatchEvent(new Event('arena:character-started'));
    this.spawnPendingDeathBackpacks();
    this.scheduleMapBackgroundPreload();

    console.log('[ARENA] START PLAYER FINALIZED', {
      playerId: this.player.id,
      totalPlayers: 1,
      playerCreatedAfterRigLoad: true,
      rigType: this.player.rig.isProceduralFallback ? 'procedural-fallback' : 'gltf',
    });

      this.logScenePlayerDiagnostics();
      this.inputLocked = false;
    } catch (error) {
      console.error('[ARENA] Failed to start game.', error);
      this.player?.dispose?.();
      this.player = null;
      this.character = null;
      this.state = 'menu';
      this.inputLocked = false;
      document.getElementById('main-menu')?.classList.remove('hidden');
      this.ui.hideSelect();
      this.ui.toast('Não foi possível iniciar o jogo. Tente novamente.');
    } finally {
      this.ui.setStartLoading?.(false);
      this.startingPlayer = false;
    }
  }

  logScenePlayerDiagnostics() {
    const skinned = [];
    const weapons = [];
    let playerRoots = 0;
    this.scene.traverse((o) => {
      if (o.userData?.arenaPlayerRoot) playerRoots++;
      if (o.isSkinnedMesh) {
        const p = new THREE.Vector3();
        o.getWorldPosition(p);
        skinned.push({
          name: o.name || '(unnamed)',
          world: p.toArray().map((v) => Number(v.toFixed(5))),
        });
      }
      if (o.userData?.arenaPlayerWeapon) {
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        o.getWorldPosition(p);
        o.getWorldScale(s);
        weapons.push({
          weapon: o.userData.arenaPlayerWeapon,
          playerId: this.player?.id ?? null,
          world: p.toArray().map((v) => Number(v.toFixed(5))),
          worldScale: s.toArray().map((v) => Number(v.toFixed(5))),
          parent: o.parent?.name || '(unnamed)',
        });
      }
    });
    console.log('[ARENA] FINAL SCENE DIAGNOSTIC', {
      players: playerRoots,
      skinnedMeshes: skinned.length,
      skinned,
      weapons: weapons.length,
      weaponInstances: weapons,
      playerExists: !!this.player,
      playerRootParent: this.player?.root?.parent?.type || null,
    });
  }

  async runMapTransition({ title, download = null, build, afterBuild = null }) {
    if (this._mapTransitionBusy) return;
    this._mapTransitionBusy = true;
    this.inputLocked = true;
    this.ui.hidePrompt();
    this.dialogue.close(false);
    this.ui.fade(true);
    this.ui.showMapLoading(title, 3, 'Preparando troca de mapa...');
    const now = () => performance.now();
    const memory = () => {
      const info = this.renderer?.info?.memory;
      return info ? { geometries: info.geometries, textures: info.textures } : null;
    };
    const before = memory();
    const times = {};
    const totalStart = now();
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    try {
      // Ensure the loading overlay is painted before any synchronous map work.
      await nextFrame();
      await nextFrame();

      let t = now();
      if (download) await download();
      times.download = now() - t;
      this.ui.updateMapLoading(18, 'Assets e rigs prontos');

      t = now();
      const result = await build();
      // Enemy constructors keep gameplay immediate, but expose their visual
      // promises so the target scene is not revealed before its rigs are ready.
      await Promise.allSettled(this.enemies.map((enemy) => enemy.visualReady).filter(Boolean));
      times.assembly = now() - t;
      this.ui.updateMapLoading(48, 'Cena montada; preparando texturas...');
      await nextFrame();

      t = now();
      this.camera.updateMatrixWorld(true);
      this.scene.updateMatrixWorld(true);
      // A real render submits newly-created textures to WebGL before reveal.
      this.renderer.render(this.scene, this.camera);
      times.textureUpload = now() - t;
      this.ui.updateMapLoading(66, 'Texturas enviadas à GPU');

      t = now();
      if (this.renderer.compileAsync) {
        await this.renderer.compileAsync(this.scene, this.camera).catch((error) => {
          if (this.debugTransitions) console.warn('[ARENA][map-transition] compileAsync fallback:', error);
        });
      } else {
        this.renderer.compile(this.scene, this.camera);
      }
      times.shaders = now() - t;
      this.ui.updateMapLoading(88, 'Shaders compilados');

      if (afterBuild) await afterBuild(result);
      this.ui.updateMapLoading(96, 'Finalizando mapa...');
      await nextFrame();
      this.ui.updateMapLoading(100, 'Pronto');
      this.ui.fade(false);
      await nextFrame();
      this.ui.hideMapLoading();
      this.inputLocked = false;

      if (this.debugTransitions) {
        console.group('[ARENA][map-transition] ' + title);
        console.table({
          download_ms: +times.download.toFixed(1),
          assembly_ms: +times.assembly.toFixed(1),
          texture_upload_ms: +times.textureUpload.toFixed(1),
          shader_compile_ms: +times.shaders.toFixed(1),
          total_ms: +(now() - totalStart).toFixed(1),
        });
        console.log('renderer.info.memory before:', before, 'after:', memory());
        console.groupEnd();
      }
      return result;
    } catch (error) {
      this.ui.hideMapLoading();
      this.ui.fade(false);
      this.inputLocked = false;
      console.error('[ARENA] Map transition failed:', title, error);
      throw error;
    } finally {
      this._mapTransitionBusy = false;
    }
  }

  scheduleMapBackgroundPreload() {
    if (!['minima', 'leve', 'baixa'].includes(this.qualityName) || this._backgroundMapPreloadStarted) return;
    this._backgroundMapPreloadStarted = true;
    const run = () => {
      // Avoid competing with combat-heavy frames; retry later while the player
      // is in a boss windup/chase or several enemies are close.
      const p = this.player?.pos;
      const intense = this.state !== 'play' || this.enemies.filter((e) => e.alive && p && e.pos.distanceTo(p) < 10).length >= 3;
      if (intense) {
        setTimeout(run, 1800);
        return;
      }
      this.mapAssetPreload = preloadKayKitAssetsSpaced((done, total, key) => {
        if (this.debugTransitions) console.debug('[ARENA][preload]', key, done + '/' + total);
      }).catch((error) => console.warn('[ARENA] Background map preload failed:', error));
    };
    setTimeout(run, 900);
  }

  enterArea2() {
    if (this.state !== 'play' || this.inputLocked || this.area?.name === 'Deserto do Sol Sepultado') return;
    this.returnArea = this.area;
    this.returnEnemies = this.enemies;
    this.enemies = [];
    void this.runMapTransition({
      title: 'DESERTO DO SOL SEPULTADO',
      download: async () => {
        await preloadKayKitEnemyAssets();
      },
      build: async () => {
        // Discard forest-only props before Area 2 snapshots its registry baselines.
        this.kaykitEnvironment?.clear?.();
        const area2 = createArea2(this);
        this.area = area2;
        this.player.place(area2.spawn.x, area2.spawn.z, area2.spawn.facing);
        this.rig.snap(this.player.pos);
        this.area.onStart();
        this.saveWorldState();
        return area2;
      },
    }).catch((error) => console.error('[ARENA] Could not enter Area 2:', error));
  }

  enterPreviousArea() {
    if (this.state !== 'play' || this.inputLocked || !this.returnArea) return;
    const target = this.returnArea;
    const currentArea = this.area;
    void this.runMapTransition({
      title: 'FLORESTA DE VHAL',
      download: async () => {
        await preloadKayKitEnemyAssets();
      },
      build: async () => {
        currentArea?.dispose?.();
        this.area = target;
        this.enemies = this.returnEnemies || this.enemies;
        this.returnEnemies = null;
        const spawn = target.checkpoint || target.spawn;
        this.player.place(spawn.x, spawn.z, spawn.facing);
        this.rig.snap(this.player.pos);
        // Rebuild the forest-only KayKit environment after the desert has
        // disposed its collision/interaction additions and restored forest zones.
        await this.kaykitEnvironment?.rebuild?.().catch((error) => {
          console.warn('[ARENA] KayKit forest environment rebuild failed.', error);
        });
        this.area.onStart();
        this.saveWorldState();
        return target;
      },
    }).catch((error) => console.error('[ARENA] Could not return to Forest:', error));
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

    if (item.effect.type === 'restoreManaPercent') {
      if (this.player.mana >= this.player.maxMana) {
        this.ui.toast('Sua mana já está cheia.');
        return false;
      }
      const restored = this.player.restoreMana(this.player.maxMana * item.effect.value);
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

  openWorldMap() {
    if (this.state !== 'play' || this.inputLocked || !this.player) return;
    this.inputLocked = true;
    this.ui.openWorldMap();
    this.state = 'world-map';
  }

  closeWorldMap() {
    if (this.state !== 'world-map') return;
    this.ui.closeWorldMap();
    this.state = 'play';
    this.inputLocked = false;
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
    this.ui.closeWorldMap?.();
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
  openForge({ npcName = 'Ferreiro da Mina' } = {}) {
    if (!this.character || this.player?.dead) return;
    this.forgeNpcName = npcName;
    this.state = 'forge';
    this.inputLocked = true;
    this.renderForge('upgrade');
  }

  renderForge(mode = 'upgrade', feedback = null, isError = false) {
    if (!this.character || this.state !== 'forge') return;
    this.forgeMode = ['upgrade', 'recycle', 'recipes', 'exclusive'].includes(mode) ? mode : 'upgrade';
    this.ui.showForge({
      initialMode: this.forgeMode,
      getEntries: (activeMode) => this.getForgeEntries(activeMode),
      onUpgrade: (slot, activeMode) => this.forgeUpgrade(slot, activeMode || this.forgeMode),
      onRecycle: (itemId, quantity, activeMode) => this.forgeRecycle(itemId, quantity, activeMode || this.forgeMode),
      onCraft: (recipeId, activeMode) => this.forgeCraft(recipeId, activeMode || this.forgeMode),
      onClose: () => this.closeForge(),
    });
    if (feedback) this.ui.showForgeFeedback(feedback, isError);
  }

  getForgeEntries(mode = 'upgrade') {
    const character = this.character;
    if (!character) return [];
    if (mode === 'upgrade') {
      return Object.entries(character.equipment || {}).filter(([, id]) => !!getItem(id)?.equipment?.slot).map(([slot, id]) => {
        const item = getItem(id);
        const level = character.getUpgradeLevel(slot);
        const next = FORGE_UPGRADES[level];
        return {
          id: slot, name: item.name + ' · +' + level, description: item.description,
          meta: level >= 5 ? 'Nível máximo alcançado.' : 'Próximo nível: +' + (level + 1) + '\nChance de sucesso: ' + Math.round(next.chance * 100) + '%\nCusto: ' + next.cost + ' ouro · Fragmento de Ferro x' + next.iron,
          actionLabel: level >= 5 ? 'Nível máximo' : 'Aprimorar +' + (level + 1),
          disabled: level >= 5,
        };
      });
    }
    if (mode === 'recycle') {
      const counts = new Map();
      for (const slot of character.inventory) counts.set(slot.id, (counts.get(slot.id) || 0) + slot.qty);
      return [...counts.entries()].map(([id, owned]) => {
        const item = getItem(id);
        const yields = FORGE_RECYCLE[id];
        if (!item || item.category === 'quest' || item.sellable === false || !yields) return null;
        const output = Object.entries(yields).map(([outId, amount]) => getItem(outId)?.name + ' x' + (amount * owned)).join(' · ');
        return {
          id, name: item.name + ' · na mochila: ' + owned, description: item.description,
          meta: 'Reciclar 1: ' + Object.entries(yields).map(([outId, amount]) => getItem(outId)?.name + ' x' + amount).join(' · ') + '\nReciclar tudo: ' + output,
          owned, actionLabel: 'Reciclar 1',
        };
      }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    const recipes = FORGE_RECIPES.filter((recipe) => mode === 'exclusive' ? recipe.exclusive : !recipe.exclusive);
    return recipes.map((recipe) => {
      const item = getItem(recipe.itemId);
      const materialsText = Object.entries(recipe.materials).map(([id, qty]) => getItem(id)?.name + ' x' + qty).join(' · ');
      const enoughMaterials = Object.entries(recipe.materials).every(([id, qty]) => character.getItemCount(id) >= qty);
      const enoughGold = character.gold >= recipe.cost;
      const hasSpace = character.inventory.length < 24;
      return {
        id: recipe.id, name: recipe.name, description: recipe.description,
        meta: 'Custo: ' + recipe.cost + ' ouro\nMateriais: ' + materialsText + (recipe.exclusive ? '\nReceita exclusiva de boss' : ''),
        actionLabel: character.inventory.some((slot) => slot.id === recipe.itemId) ? 'Forjar outra' : 'Forjar',
        disabled: !item || !enoughMaterials || !enoughGold || !hasSpace,
      };
    });
  }

  forgeUpgrade(slot, mode = this.forgeMode) {
    const character = this.character;
    const itemId = character?.equipment?.[slot];
    const item = getItem(itemId);
    if (!character || !item?.equipment?.slot) return;
    const level = character.getUpgradeLevel(slot);
    const config = FORGE_UPGRADES[level];
    if (!config) return this.renderForge(mode, 'Este equipamento já está no nível máximo.', true);
    if (character.gold < config.cost) return this.renderForge(mode, 'Ouro insuficiente: são necessários ' + config.cost + ' ouro.', true);
    if (character.getItemCount('iron_scrap') < config.iron) return this.renderForge(mode, 'Faltam Fragmentos de Ferro: são necessários ' + config.iron + '.', true);

    character.removeItem('iron_scrap', config.iron);
    character.spendGold(config.cost);
    const success = Math.random() < config.chance;
    if (success) character.setUpgradeLevel(slot, level + 1);
    this.ui.setProgress(character);
    this.ui.setInventory(character);
    this.ui.setActionBar(character);
    if (success) {
      this.fx.ring(this.player.pos, 0xffc66b, 1.4, 0.7, 0.8);
      this.renderForge(mode, 'Sucesso! ' + item.name + ' agora está no nível +' + (level + 1) + '.', false);
    } else {
      this.fx.ring(this.player.pos, 0xa45a43, 1.0, 0.45, 0.6);
      this.renderForge(mode, 'A tentativa falhou. Os materiais e o ouro foram consumidos; o equipamento foi preservado.', true);
    }
  }

  forgeRecycle(itemId, quantity = 1, mode = this.forgeMode) {
    const character = this.character;
    const item = getItem(itemId);
    const yields = FORGE_RECYCLE[itemId];
    const owned = character?.getItemCount(itemId) || 0;
    const qty = Math.max(1, Math.min(owned, Math.floor(Number(quantity) || 1)));
    if (!character || !item || item.category === 'quest' || item.sellable === false || !yields || !owned) {
      return this.renderForge(mode, 'Esse item não pode ser reciclado ou não está mais na mochila.', true);
    }
    if (character.removeItem(itemId, qty) !== qty) return this.renderForge(mode, 'Não foi possível retirar os itens da mochila.', true);
    const addedOutputs = [];
    let success = true;
    for (const [outputId, perItem] of Object.entries(yields)) {
      const amount = perItem * qty;
      const output = getItem(outputId);
      const result = character.addItem(outputId, amount, output?.maxStack || 99);
      addedOutputs.push({ id: outputId, amount: result.added });
      if (result.remaining > 0) { success = false; break; }
    }
    if (!success) {
      for (const output of addedOutputs) if (output.amount) character.removeItem(output.id, output.amount);
      character.addItem(itemId, qty, item.maxStack || 99);
      return this.renderForge(mode, 'Sem espaço para receber os materiais. Nenhum item foi perdido.', true);
    }
    const resultText = Object.entries(yields).map(([id, amount]) => getItem(id)?.name + ' x' + (amount * qty)).join(' · ');
    this.ui.setInventory(character);
    this.ui.setActionBar(character);
    this.ui.setProgress(character);
    this.renderForge(mode, 'Reciclagem concluída: ' + resultText + '.', false);
  }

  forgeCraft(recipeId, mode = this.forgeMode) {
    const character = this.character;
    const recipe = FORGE_RECIPES.find((entry) => entry.id === recipeId);
    const item = recipe && getItem(recipe.itemId);
    if (!character || !recipe || !item) return;
    if (character.gold < recipe.cost) return this.renderForge(mode, 'Ouro insuficiente: são necessários ' + recipe.cost + ' ouro.', true);
    const missing = Object.entries(recipe.materials).filter(([id, qty]) => character.getItemCount(id) < qty);
    if (missing.length) return this.renderForge(mode, 'Materiais insuficientes: ' + missing.map(([id, qty]) => getItem(id)?.name + ' x' + qty).join(', ') + '.', true);
    if (character.inventory.length >= 24) return this.renderForge(mode, 'Mochila cheia. Libere um espaço antes de forjar.', true);

    for (const [id, qty] of Object.entries(recipe.materials)) character.removeItem(id, qty);
    character.spendGold(recipe.cost);
    const added = character.addItem(recipe.itemId, 1, item.maxStack || 1);
    if (added.added !== 1) {
      for (const [id, qty] of Object.entries(recipe.materials)) character.addItem(id, qty, getItem(id)?.maxStack || 99);
      character.addGold(recipe.cost);
      return this.renderForge(mode, 'A forja foi cancelada porque não havia espaço no inventário. Custos devolvidos.', true);
    }
    this.ui.setInventory(character);
    this.ui.setActionBar(character);
    this.ui.setProgress(character);
    this.fx.ring(this.player.pos, 0xffc66b, 1.5, 0.8, 0.9);
    this.renderForge(mode, 'Equipamento forjado: ' + item.name + '.', false);
  }

  closeForge() {
    if (this.state !== 'forge') return;
    this.ui.hideForge();
    this.state = 'play';
    this.inputLocked = false;
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
    const hit = this.raycaster.ray.intersectPlane(this.ground, out);
    if (hit) return hit;
    return this.player?.pos?.clone() || new THREE.Vector3();
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

    if (this.fpsEnabled) {
      this.fpsElapsed += dt;
    }

    if (this.atmospherePass) this.atmospherePass.uniforms.uTime.value = this.time;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    const p = this.player;
    if (p && this.state === 'play') p.update(dt);
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
      // The menu and loading screen still render the existing world normally,
      // but no area/world update that depends on a player may run before the
      // final Player has been created.
      for (const n of this.npcs) n.update(dt);
      if (p) this.area?.update(dt, this.time);
      this.fx.update(dt);
      this.kaykitEnvironment?.update?.(dt, this.time);
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

    // Character-select remains responsive without continuously rasterizing the 3D world.
    if (this.state === 'select' || this.state === 'menu') return;

    if (this.state === 'play' && !this.autoPerfDone) {
      this.autoPerfElapsed += dt;
    }

    const renderInterval = 1 / (this.qualityConfig.renderCap || 60);
    this._renderAccumulator = (this._renderAccumulator || 0) + dt;
    if (this._renderAccumulator + 1e-5 < renderInterval) return;
    this._renderAccumulator = 0;

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    this.fpsFrames++;
    this._lastRenderedFrame = true;
    if (this.fpsElapsed >= 0.5) {
      const fps = this.fpsFrames / this.fpsElapsed;
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
      if (this.fpsEl) this.fpsEl.textContent = 'FPS: ' + Math.round(fps);
    }

    // Automatic fallback is based on actual rendered frames, not loop callbacks.
    // This keeps the threshold meaningful even when MINIMA is capped at 30 FPS.
    if (this._lastRenderedFrame) {
      this.autoPerfFrames++;
      this._lastRenderedFrame = false;
    }
    if (!this.autoPerfDone && this.state === 'play' && this.autoPerfElapsed >= 3) {
      const avg = this.autoPerfFrames / this.autoPerfElapsed;
      this.autoPerfDone = true;
      if (avg < 20 && this.qualityName !== 'minima') {
        console.warn('[ARENA] Auto quality fallback:', { averageFps: avg, gpu: this.gpuRenderer });
        location.search = new URLSearchParams({
          ...Object.fromEntries(new URLSearchParams(location.search)),
          qualidade: 'minima',
          auto: '1'
        }).toString();
        return;
      }
    }

    if (this.debugEl) {
      const info = this.renderer.info;
      this.debugEl.textContent = 'Q: ' + this.qualityName.toUpperCase() +
        ' | GPU: ' + this.gpuRenderer +
        ' | Draw: ' + info.render.calls +
        ' | Tri: ' + info.render.triangles;
    }
  }
}

window.game = new Game();
window.__arenaAccountMenuReady = import('./account-menu.js?v=unique-name-fix-20261009e').then(({ installAccountMenu }) => installAccountMenu(window.game)).catch((error) => { console.error('[ARENA] Account menu failed to load:', error); return null; });
