import * as THREE from 'three';

// Small, static blacksmith set dressing. Geometry/materials are built once per
// area load; animation below only updates transforms of preallocated meshes.
const MAT = {
  wood: new THREE.MeshStandardMaterial({ color: 0x49301f, roughness: 1, flatShading: true }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0x755035, roughness: 1, flatShading: true }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 1, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: 0x45464a, roughness: 1, flatShading: true }),
  stoneLight: new THREE.MeshStandardMaterial({ color: 0x666064, roughness: 1, flatShading: true }),
  iron: new THREE.MeshStandardMaterial({ color: 0x34383b, metalness: 0.62, roughness: 0.72, flatShading: true }),
  ironEdge: new THREE.MeshStandardMaterial({ color: 0x77777a, metalness: 0.72, roughness: 0.52, flatShading: true }),
  leather: new THREE.MeshStandardMaterial({ color: 0x593824, roughness: 1, flatShading: true }),
  water: new THREE.MeshStandardMaterial({ color: 0x31545a, roughness: 0.32, metalness: 0.1 }),
  dark: new THREE.MeshBasicMaterial({ color: 0x100b09 }),
  ember: new THREE.MeshStandardMaterial({
    color: 0xff762b, emissive: 0xff3c08, emissiveIntensity: 2.2,
    roughness: 0.65, flatShading: true,
  }),
  emberCore: new THREE.MeshBasicMaterial({ color: 0xffa044, toneMapped: false }),
  sign: new THREE.MeshStandardMaterial({ color: 0x38261b, roughness: 1, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc69b51, metalness: 0.42, roughness: 0.65, flatShading: true }),
};
const V = new THREE.Vector3();

function addMesh(parent, geometry, material, x, y, z, options = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (options.rx) m.rotation.x = options.rx;
  if (options.ry) m.rotation.y = options.ry;
  if (options.rz) m.rotation.z = options.rz;
  if (options.sx || options.sy || options.sz) m.scale.set(options.sx ?? 1, options.sy ?? 1, options.sz ?? 1);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,190,90,0.95)');
  gradient.addColorStop(0.25, 'rgba(255,100,25,0.68)');
  gradient.addColorStop(0.62, 'rgba(255,55,8,0.18)');
  gradient.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
let glowTexture;

function createForgeFloor(parent) {
  const floor = new THREE.Group();
  floor.name = 'forge-floor';
  parent.add(floor);
  addMesh(floor, new THREE.BoxGeometry(5.7, 0.16, 4.8), MAT.woodDark, 0, 0.02, 0);
  // Chunky dark stone edging; planks are fixed geometry, not per-frame instances.
  for (let z = -2.0; z <= 2.01; z += 0.78) {
    addMesh(floor, new THREE.BoxGeometry(5.25, 0.055, 0.68), MAT.wood, 0, 0.115, z);
    addMesh(floor, new THREE.BoxGeometry(0.045, 0.06, 0.66), MAT.woodDark, -2.55, 0.15, z);
  }
  for (const x of [-2.78, 2.78]) {
    addMesh(floor, new THREE.BoxGeometry(0.22, 0.18, 4.9), MAT.stone, x, 0.06, 0);
  }
  return floor;
}

function createAnvil(parent, x = 0.55, z = -0.05) {
  const anvil = new THREE.Group();
  anvil.name = 'forge-anvil';
  anvil.position.set(x, 0.15, z);
  parent.add(anvil);
  addMesh(anvil, new THREE.BoxGeometry(0.74, 0.25, 0.43), MAT.woodDark, 0, 0.13, 0);
  addMesh(anvil, new THREE.CylinderGeometry(0.16, 0.23, 0.44, 6), MAT.iron, 0, 0.48, 0);
  addMesh(anvil, new THREE.BoxGeometry(0.72, 0.19, 0.42), MAT.ironEdge, 0, 0.77, 0);
  addMesh(anvil, new THREE.BoxGeometry(0.3, 0.14, 0.28), MAT.iron, -0.42, 0.79, 0);
  addMesh(anvil, new THREE.ConeGeometry(0.13, 0.27, 4), MAT.ironEdge, 0.47, 0.79, 0, { rz: -Math.PI / 2 });
  // A simple sword laid across the anvil.
  addMesh(anvil, new THREE.BoxGeometry(0.09, 0.045, 0.78), MAT.ironEdge, 0.03, 0.91, 0, { ry: -0.28 });
  addMesh(anvil, new THREE.BoxGeometry(0.25, 0.07, 0.09), MAT.gold, 0.03, 0.91, 0.40, { ry: -0.28 });
  addMesh(anvil, new THREE.BoxGeometry(0.10, 0.13, 0.12), MAT.leather, 0.03, 0.91, 0.51, { ry: -0.28 });
  return anvil;
}

function createFurnace(parent) {
  const furnace = new THREE.Group();
  furnace.name = 'stone-forge-furnace';
  furnace.position.set(-1.72, 0, -1.12);
  parent.add(furnace);
  addMesh(furnace, new THREE.BoxGeometry(1.36, 1.65, 1.0), MAT.stone, 0, 0.83, 0);
  addMesh(furnace, new THREE.BoxGeometry(1.48, 0.16, 1.1), MAT.stoneLight, 0, 1.64, 0);
  addMesh(furnace, new THREE.BoxGeometry(0.5, 0.65, 0.08), MAT.dark, 0, 0.72, 0.535);
  // Orange, emissive opening sits just in front of the dark firebox.
  addMesh(furnace, new THREE.BoxGeometry(0.31, 0.42, 0.035), MAT.ember, 0, 0.72, 0.59);
  addMesh(furnace, new THREE.ConeGeometry(0.13, 0.32, 5), MAT.emberCore, -0.06, 0.75, 0.625, { rz: 0.18 });
  addMesh(furnace, new THREE.ConeGeometry(0.12, 0.27, 5), MAT.ember, 0.09, 0.7, 0.63, { rz: -0.22 });
  // Short chimney with a cap, low-poly and shadow-free.
  addMesh(furnace, new THREE.BoxGeometry(0.42, 0.74, 0.42), MAT.stone, -0.2, 2.02, -0.12);
  addMesh(furnace, new THREE.BoxGeometry(0.58, 0.13, 0.58), MAT.stoneLight, -0.2, 2.42, -0.12);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture || (glowTexture = makeGlowTexture()), color: 0xff792b,
    transparent: true, opacity: 0.76, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  glow.position.set(0, 0.78, 0.67);
  glow.scale.set(1.55, 1.35, 1);
  glow.renderOrder = 2;
  furnace.add(glow);
  // One local light only; disabled until the player approaches.
  const light = new THREE.PointLight(0xff762f, 0, 5.5, 1.8);
  light.position.set(0, 1.0, 0.85);
  light.castShadow = false;
  furnace.add(light);

  // Preallocated flame/spark pool. No Object3D or geometry is created in update().
  const particles = [];
  for (let i = 0; i < 8; i++) {
    const spark = addMesh(furnace, new THREE.TetrahedronGeometry(0.055 + (i % 3) * 0.012, 0), i % 3 === 0 ? MAT.emberCore : MAT.ember,
      0, -3, 0);
    spark.visible = false;
    particles.push({ mesh: spark, phase: i * 0.73, life: 0.45 + (i % 4) * 0.12 });
  }
  return {
    root: furnace,
    light,
    glow,
    particles,
    update(dt, time, playerPos, worldX, worldZ) {
      const near = !!playerPos && Math.hypot(playerPos.x - worldX, playerPos.z - worldZ) < 8;
      light.intensity = near ? 2.1 : 0;
      glow.material.opacity = near ? 0.82 : 0.62;
      for (const p of particles) {
        const age = (time * 0.8 + p.phase) % p.life;
        const active = near && age < p.life * 0.82;
        p.mesh.visible = active;
        if (!active) continue;
        p.mesh.position.set(
          Math.sin(p.phase * 2.1 + time * 2.8) * 0.24,
          0.68 + age * 1.0,
          0.58 + Math.cos(p.phase + time * 1.7) * 0.1,
        );
        const s = 0.55 + (1 - age / p.life) * 0.75;
        p.mesh.scale.setScalar(s);
      }
    },
  };
}

function createForgeSign(parent) {
  const sign = new THREE.Group();
  sign.name = 'forge-hammer-sign';
  sign.position.set(0, 2.65, 2.42);
  parent.add(sign);
  addMesh(sign, new THREE.BoxGeometry(1.48, 0.64, 0.12), MAT.sign, 0, 0, 0);
  addMesh(sign, new THREE.BoxGeometry(1.56, 0.075, 0.15), MAT.woodLight, 0, 0.35, 0);
  addMesh(sign, new THREE.BoxGeometry(1.56, 0.075, 0.15), MAT.woodLight, 0, -0.35, 0);
  // Hammer silhouette and anvil silhouette, readable without text textures.
  addMesh(sign, new THREE.BoxGeometry(0.36, 0.11, 0.045), MAT.gold, -0.25, 0.08, 0.09, { rz: -0.58 });
  addMesh(sign, new THREE.BoxGeometry(0.12, 0.27, 0.05), MAT.woodLight, -0.13, -0.06, 0.09, { rz: -0.58 });
  addMesh(sign, new THREE.BoxGeometry(0.36, 0.08, 0.07), MAT.ironEdge, 0.3, -0.13, 0.09);
  addMesh(sign, new THREE.BoxGeometry(0.22, 0.09, 0.08), MAT.iron, 0.3, -0.21, 0.09);
  return sign;
}

function createWorkbench(parent) {
  const bench = new THREE.Group();
  bench.name = 'forge-workbench';
  bench.position.set(1.8, 0, -1.2);
  parent.add(bench);
  addMesh(bench, new THREE.BoxGeometry(1.25, 0.16, 0.66), MAT.woodLight, 0, 1.0, 0);
  for (const x of [-0.49, 0.49]) for (const z of [-0.23, 0.23]) {
    addMesh(bench, new THREE.BoxGeometry(0.12, 0.96, 0.12), MAT.wood, x, 0.49, z);
  }
  addMesh(bench, new THREE.BoxGeometry(0.9, 0.10, 0.10), MAT.woodDark, 0, 0.34, 0.23);
  // Tongs, hammer and chisel resting on the bench.
  addMesh(bench, new THREE.BoxGeometry(0.62, 0.035, 0.055), MAT.ironEdge, -0.12, 1.11, -0.08, { ry: 0.18 });
  addMesh(bench, new THREE.BoxGeometry(0.28, 0.09, 0.12), MAT.iron, 0.12, 1.17, 0.02, { ry: 0.18 });
  addMesh(bench, new THREE.BoxGeometry(0.045, 0.25, 0.045), MAT.woodLight, 0.19, 1.08, 0.05, { rz: -0.15 });
  return bench;
}

function createBarrel(parent, x, z) {
  const barrel = new THREE.Group();
  barrel.name = 'forge-water-barrel';
  barrel.position.set(x, 0, z);
  parent.add(barrel);
  addMesh(barrel, new THREE.CylinderGeometry(0.36, 0.32, 0.82, 8), MAT.wood, 0, 0.43, 0);
  for (const y of [0.18, 0.68]) {
    const hoop = addMesh(barrel, new THREE.CylinderGeometry(0.375, 0.375, 0.075, 8), MAT.iron, 0, y, 0);
    hoop.scale.set(1, 1, 1);
  }
  addMesh(barrel, new THREE.CylinderGeometry(0.30, 0.30, 0.035, 8), MAT.water, 0, 0.83, 0);
  return barrel;
}

function createLogPile(parent, x, z) {
  const pile = new THREE.Group();
  pile.name = 'forge-firewood';
  pile.position.set(x, 0.13, z);
  parent.add(pile);
  for (let i = 0; i < 5; i++) {
    addMesh(pile, new THREE.CylinderGeometry(0.12, 0.12, 0.88, 6), i % 2 ? MAT.woodLight : MAT.wood,
      (i % 2) * 0.12 - 0.06, 0.13 + Math.floor(i / 2) * 0.19, (i % 3) * 0.12 - 0.1,
      { rz: Math.PI / 2, ry: (i % 2) * 0.08 });
  }
  return pile;
}

function createWallWeapons(parent) {
  const weapons = new THREE.Group();
  weapons.name = 'forge-wall-weapons';
  weapons.position.set(-0.5, 1.55, -2.08);
  parent.add(weapons);
  for (let i = 0; i < 2; i++) {
    const sword = new THREE.Group();
    sword.position.set(i * 0.8, 0.05, 0.08);
    sword.rotation.z = i === 0 ? -0.22 : 0.22;
    weapons.add(sword);
    addMesh(sword, new THREE.BoxGeometry(0.07, 0.68, 0.045), MAT.ironEdge, 0, 0.18, 0);
    addMesh(sword, new THREE.BoxGeometry(0.23, 0.06, 0.07), MAT.gold, 0, -0.16, 0);
    addMesh(sword, new THREE.BoxGeometry(0.08, 0.24, 0.07), MAT.leather, 0, -0.29, 0);
    addMesh(sword, new THREE.BoxGeometry(0.12, 0.08, 0.1), MAT.gold, 0, -0.42, 0);
  }
  return weapons;
}

export function createForgeScene(game) {
  const center = { x: 24.5, z: 23.2 };
  const footprintScale = 1.7;
  const root = new THREE.Group();
  root.name = 'forest-blacksmith-hut';
  root.position.set(center.x, 0, center.z);
  // Expand the hut to a grand workshop footprint while keeping the original height.
  root.scale.set(footprintScale, 1, footprintScale);
  game.scene.add(root);
  createForgeFloor(root);

  // Three walls only: the south (+Z) face stays open for a clear approach.
  // Stone footings visually ground the timber walls into the forest terrain.
  for (const x of [-2.72, 2.72]) {
    addMesh(root, new THREE.BoxGeometry(0.28, 0.52, 4.58), MAT.stone, x, 0.28, -0.05);
    // Stone corner piers make the timber frame feel anchored and reinforce the silhouette.
    for (const z of [-2.18, 2.08]) {
      addMesh(root, new THREE.BoxGeometry(0.42, 0.72, 0.42), MAT.stoneLight, x, 0.36, z);
      addMesh(root, new THREE.BoxGeometry(0.34, 0.16, 0.34), MAT.stone, x, 0.82, z);
    }
  }
  addMesh(root, new THREE.BoxGeometry(5.58, 0.52, 0.28), MAT.stone, 0, 0.28, -2.22);
  // Layered stone courses along the back wall add a hand-built masonry detail.
  for (let x = -2.45; x <= 2.46; x += 0.48) {
    addMesh(root, new THREE.BoxGeometry(0.44, 0.18, 0.34), (Math.round((x + 2.45) / 0.48) % 2) ? MAT.stone : MAT.stoneLight, x, 0.62, -2.18);
  }
  for (const x of [-2.72, 2.72]) {
    addMesh(root, new THREE.BoxGeometry(0.22, 2.85, 4.55), MAT.wood, x, 1.45, -0.05);
    for (let y = 0.38; y < 2.6; y += 0.52) {
      addMesh(root, new THREE.BoxGeometry(0.25, 0.08, 4.58), MAT.woodLight, x, y, -0.05);
    }
    for (const z of [-1.55, 1.35]) {
      addMesh(root, new THREE.BoxGeometry(0.28, 2.9, 0.28), MAT.woodDark, x, 1.45, z);
    }
  }
  addMesh(root, new THREE.BoxGeometry(5.55, 2.85, 0.22), MAT.wood, 0, 1.45, -2.22);
  for (let x = -2.2; x <= 2.21; x += 0.62) {
    addMesh(root, new THREE.BoxGeometry(0.08, 2.75, 0.24), MAT.woodLight, x, 1.45, -2.22);
  }
  // Roof-only materials can fade without changing the shared wood materials elsewhere.
  const roofMaterialA = MAT.woodDark.clone();
  const roofMaterialB = MAT.wood.clone();
  const roofTrimMaterial = MAT.woodLight.clone();
  const roofMaterials = [roofMaterialA, roofMaterialB, roofTrimMaterial];
  for (const material of roofMaterials) {
    material.transparent = true;
    material.opacity = 1;
    material.depthWrite = true;
  }
  const roofMeshes = [];
  // Curved gable roof surfaces (custom meshes, not giant rectangular slabs).
  // A shallow eave dip and subtly bowed ridge break the box-like silhouette.
  const makeRoofSurface = (side, material) => {
    const vertices = [], indices = [];
    const cols = 12, rows = 10, halfWidth = 3.0, halfLength = 2.78;
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      const z = -halfLength + v * halfLength * 2;
      for (let col = 0; col <= cols; col++) {
        const u = col / cols;
        const x = side < 0 ? -halfWidth + u * halfWidth : u * halfWidth;
        const dist = Math.abs(x) / halfWidth;
        const y = 2.48 + (1 - dist) * 1.36 - Math.pow(1 - dist, 2) * 0.10
          + Math.sin(v * Math.PI) * 0.055;
        vertices.push(x, y, z);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const a = row * (cols + 1) + col;
        const b = a + 1, c = a + cols + 1, d = c + 1;
        if (side < 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
    return mesh;
  };
  roofMeshes.push(makeRoofSurface(-1, roofMaterialA));
  roofMeshes.push(makeRoofSurface(1, roofMaterialB));
  roofMeshes.push(addMesh(root, new THREE.CylinderGeometry(0.11, 0.13, 5.6, 7), roofTrimMaterial, 0, 3.78, -0.02, { rx: Math.PI / 2 }));
  for (const z of [-2.1, 0, 2.0]) {
    roofMeshes.push(addMesh(root, new THREE.BoxGeometry(5.35, 0.12, 0.16), roofMaterialA, 0, 2.65, z));
  }
  // Extra overlapping roof shingles: dark staggered courses read as separate boards.
  for (let row = 0; row < 4; row++) {
    const x = -2.18 + row * 1.42;
    for (let z = -2.0; z <= 2.01; z += 0.82) {
      const offset = row % 2 ? 0.36 : 0;
      roofMeshes.push(addMesh(root, new THREE.BoxGeometry(1.34, 0.075, 0.76), row % 2 ? roofMaterialB : roofMaterialA,
        x, 2.48 + (1 - Math.abs(x) / 3.0) * 1.36 + 0.075, z + offset, { rz: x < 0 ? -0.27 : 0.27 }));
    }
  }
  // Exposed front lintel and paired braces frame the open entrance.
  for (const x of [-2.5, 2.5]) {
    addMesh(root, new THREE.BoxGeometry(0.22, 2.8, 0.24), MAT.woodDark, x, 1.43, 2.2);
    addMesh(root, new THREE.BoxGeometry(0.82, 0.16, 0.16), MAT.woodLight, x < 0 ? -2.15 : 2.15, 2.72, 1.82,
      { rz: x < 0 ? -0.52 : 0.52 });
  }
  addMesh(root, new THREE.BoxGeometry(5.4, 0.22, 0.28), MAT.woodDark, 0, 2.85, 2.16);
  // Side windows with dark recesses and crossbars.
  for (const x of [-2.84, 2.84]) {
    for (const z of [-0.75, 0.95]) {
      addMesh(root, new THREE.BoxGeometry(0.06, 0.78, 0.72), MAT.dark, x, 1.65, z);
      addMesh(root, new THREE.BoxGeometry(0.12, 0.08, 0.82), MAT.woodLight, x, 1.65, z);
      addMesh(root, new THREE.BoxGeometry(0.12, 0.84, 0.08), MAT.woodLight, x, 1.65, z);
    }
  }

  createForgeSign(root);
  const furnace = createFurnace(root);
  createAnvil(root, 0.35, 0.48);
  createWorkbench(root);
  createBarrel(root, 2.12, 1.52);
  createLogPile(root, -1.95, 1.45);
  createWallWeapons(root);

  // Wall, furnace, anvil, workbench and barrel blockers use the existing XZ
  // collision system. The entrance remains completely open.
  const bx = (x1, x2, z1, z2) => game.collision.addBox(
    center.x + x1 * footprintScale, center.x + x2 * footprintScale,
    center.z + z1 * footprintScale, center.z + z2 * footprintScale,
  );
  const bc = (x, z, radius) => game.collision.addCircle(
    center.x + x * footprintScale, center.z + z * footprintScale, radius * footprintScale,
  );
  bx(-3.0, -2.42, -2.42, 2.25);
  bx(2.42, 3.0, -2.42, 2.25);
  bx(-3.0, 3.0, -2.78, -2.18);
  bx(-2.5, -1.0, -1.9, -0.65);
  bc(0.35, 0.48, 0.62);
  bx(1.12, 2.48, -1.85, -0.52);
  bc(2.12, 1.52, 0.42);
  bc(-1.95, 1.45, 0.42);

  return {
    root,
    update(dt, time, playerPos) {
      furnace.update(dt, time, playerPos, center.x - 1.72 * footprintScale, center.z - 1.12 * footprintScale);
      const inside = !!playerPos
        && Math.abs(playerPos.x - center.x) < 7.45
        && playerPos.z > center.z - 6.4
        && playerPos.z < center.z + 5.2;
      // Fade the roof to 5% opacity (95% transparent) only while the player is inside.
      // Restore full opacity immediately when the player leaves the hut.
      const opacity = inside ? 0.05 : 1;
      for (const material of roofMaterials) {
        if (material.opacity !== opacity) {
          material.opacity = opacity;
          material.depthWrite = !inside;
          material.needsUpdate = true;
        }
      }
    },
  };
}
