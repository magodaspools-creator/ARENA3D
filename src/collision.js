import * as THREE from 'three';
let RAPIER = null;
let rapierReady = false;

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
]);

// Load Rapier dynamically so a CDN/network problem cannot block the entire
// JavaScript module graph on mobile. jsDelivr remains the primary source;
// unpkg is a fallback.
export async function initCollision() {
  if (rapierReady) return RAPIER;

  const sources = [
    'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/rapier.es.js',
    'https://unpkg.com/@dimforge/rapier3d-compat@0.21.0/rapier.es.js',
  ];

  let lastError = null;
  for (const url of sources) {
    try {
      const mod = await withTimeout(import(url), 8000, 'Tempo esgotado ao carregar o motor de colisão');
      RAPIER = mod.default ?? mod;
      await withTimeout(RAPIER.init(), 8000, 'Tempo esgotado ao inicializar o motor de colisão');
      rapierReady = true;
      return RAPIER;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    'Não foi possível carregar o motor de colisão (Rapier). ' +
    (lastError?.message || lastError || 'erro desconhecido')
  );
}

const STATIC = 1;
const ACTOR = 2;
// Static colliders accept actors; actors accept static colliders.
// The previous STATIC↔STATIC / ACTOR↔ACTOR groups prevented Rapier's
// character controller from seeing the dungeon walls at the broad phase.
const STATIC_GROUPS = (STATIC << 16) | ACTOR;
const ACTOR_GROUPS = (ACTOR << 16) | STATIC;
const COLLISION_HEIGHT = 4.0;
const ACTOR_HALF_HEIGHT = 0.55;
const FLOOR_Y = -0.12;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Collision {
  constructor(rapier = RAPIER) {
    if (!rapier) {
      throw new Error('Motor de colisão não inicializado: initCollision() deve ser executado antes de new Collision().');
    }

    this.RAPIER = rapier;
    this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    this.controller = this.world.createCharacterController(0.025);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(Math.PI * 0.5);
    this.controller.setMinSlopeSlideAngle(Math.PI * 0.5);
    this.controller.enableAutostep(0.35, 0.22, false);
    // Autostep handles climbing; snap-to-ground is also required for descending
    // small steps without leaving the character floating above the lower surface.
    // Keep the same 0.35 limit so a larger drop is still blocked.
    this.controller.enableSnapToGround(0.35);

    this.zones = [];
    this.obstacles = [];
    this.actorColliders = new WeakMap();
