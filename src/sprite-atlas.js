import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();
const cache = new Map();

function loadTexture(url) {
  if (cache.has(url)) return cache.get(url);
  const texture = textureLoader.load(url, () => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(url, texture);
  return texture;
}

function keyGreen(material, threshold = 0.16) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float chromaGreen = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
      float chromaKey = step(${threshold.toFixed(3)}, diffuseColor.g) * step(${(threshold - 0.01).toFixed(3)}, chromaGreen);
      if (chromaKey > 0.5) discard;`,
    );
  };
  material.customProgramCacheKey = () => `arena-chroma-${threshold}`;
}

export function createAtlasSprite({
  url,
  cols,
  rows,
  frame = 0,
  scale = 1,
  height = scale,
  centerY = 0.02,
  chroma = true,
  depthWrite = false,
  alphaTest = 0.01,
  name = 'atlas-sprite',
} = {}) {
  const texture = loadTexture(url).clone();
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest,
    depthWrite,
    toneMapped: false,
  });
  if (chroma) keyGreen(material);

  const sprite = new THREE.Sprite(material);
  sprite.name = name;
  sprite.center.set(0.5, centerY);
  sprite.scale.set(scale, height, 1);
  setAtlasFrame(sprite, frame, cols, rows);
  return sprite;
}

export function setAtlasFrame(sprite, frame, cols, rows) {
  const map = sprite?.material?.map;
  if (!map || !cols || !rows) return;
  const safeFrame = Math.max(0, Math.floor(frame));
  const col = safeFrame % cols;
  const row = Math.floor(safeFrame / cols);
  const tileW = 1 / cols;
  const tileH = 1 / rows;
  const epsX = 0.001;
  const epsY = 0.001;

  const u0 = col * tileW + epsX;
  const u1 = (col + 1) * tileW - epsX;
  const v0 = 1 - (row + 1) * tileH + epsY;
  const v1 = 1 - row * tileH - epsY;
  map.repeat.set(u1 - u0, v1 - v0);
  map.offset.set(u0, v0);
  map.needsUpdate = true;
}

export function randomAtlasFrame(rng, cols, rows, row = null) {
  const rr = row === null ? Math.floor(rng() * rows) : row;
  return rr * cols + Math.floor(rng() * cols);
}

export const ENV_SPRITES = {
  trees: {
    url: new URL('../uploads/ARVORES.jpeg', import.meta.url).href,
    cols: 6,
    rows: 4,
    rowsByType: { dead: 0, oak: 1, pine: 2, mossy: 3 },
  },
  props: {
    url: new URL('../uploads/objetos ambientais.jpeg', import.meta.url).href,
    cols: 6,
    rows: 5,
  },
  stones: {
    url: new URL('../uploads/PEDRAS E MINERAIS.jpeg', import.meta.url).href,
    cols: 8,
    rows: 3,
  },
  plants: {
    url: new URL('../uploads/RAIZ E VEGETACAO.jpeg', import.meta.url).href,
    cols: 8,
    rows: 4,
  },
  wisp: {
    url: new URL('../uploads/WISP.jpeg', import.meta.url).href,
    cols: 10,
    rows: 5,
  },
};

export function createEnvironmentSprite(kind, {
  frame = 0,
  scale = 1,
  height = scale,
  centerY = 0.02,
  name = kind,
} = {}) {
  const def = ENV_SPRITES[kind];
  if (!def) throw new Error(`Unknown environment sprite: ${kind}`);
  return createAtlasSprite({
    url: def.url,
    cols: def.cols,
    rows: def.rows,
    frame,
    scale,
    height,
    centerY,
    name,
  });
}
