import * as THREE from 'three';

// Procedural low-poly models. Everything is built from primitives so the
// prototype needs no external assets. One humanoid base serves the player
// (all vocations), the NPC, the Hollow enemies and the boss.

const cache = new Map();
export function mat(color, o = {}) {
  const key = [color, o.emissive ?? 0, o.ei ?? 1, o.metal ?? 0, o.rough ?? 0.85, o.opacity ?? 1, o.side ?? 0, o.flat ?? true].join('|');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, flatShading: o.flat ?? true,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
  });
  cache.set(key, m);
  return m;
}
export const glow = (color, ei = 2.5) => mat(color, { emissive: color, ei });

export function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Clones materials so an entity can flash independently. */
export function uniqueMaterials(root) {
  const map = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material.emissive) return;
    if (!map.has(o.material)) {
      const c = o.material.clone();
      c.userData.baseEmissive = c.emissive.clone();
      c.userData.baseEI = c.emissiveIntensity;
      map.set(o.material, c);
    }
    o.material = map.get(o.material);
  });
  return [...map.values()];
}
export function applyFlash(mats, amount, color) {
  for (const m of mats) {
    if (amount > 0.01) { m.emissive.copy(color); m.emissiveIntensity = amount * 1.4; }
    else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
  }
}

const G = {
  leg: new THREE.BoxGeometry(0.19, 0.8, 0.21),
  boot: new THREE.BoxGeometry(0.21, 0.16, 0.3),
  pelvis: new THREE.BoxGeometry(0.46, 0.24, 0.3),
  torso: new THREE.CylinderGeometry(0.31, 0.25, 0.64, 7),
  belt: new THREE.CylinderGeometry(0.27, 0.27, 0.08, 7),
  head: new THREE.IcosahedronGeometry(0.21, 1),
  eye: new THREE.SphereGeometry(0.035, 6, 4),
  arm: new THREE.BoxGeometry(0.13, 0.52, 0.14),
  hand: new THREE.IcosahedronGeometry(0.085, 0),
  shoulder: new THREE.BoxGeometry(0.24, 0.13, 0.28),
  robe: new THREE.CylinderGeometry(0.27, 0.52, 0.92, 8, 1, true),
  rags: new THREE.CylinderGeometry(0.26, 0.4, 0.5, 7, 1, true),
  cape: new THREE.PlaneGeometry(0.62, 1.15, 1, 3),
};

/**
 * Builds a humanoid rig. Local forward is +Z. Returns references to the
 * pivot groups so HumanoidAnimator can pose them.
 */
export function createHumanoid(look = {}) {
  const L = { skin: 0xd8a47f, body: 0x555555, legs: 0x333333, accent: 0xaaaaaa, boots: 0x2b2420, ...look };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mSkin = mat(L.skin), mBody = mat(L.body), mLegs = mat(L.legs), mBoots = mat(L.boots);
  const mAcc = mat(L.accent, { metal: 0.6, rough: 0.45 });
  // NPCs use softer rounded primitives so they read as characters rather than Lego blocks.
  // Player/enemy rigs keep the original geometry for compatibility with their animations.
  const npcSoft = !!L.npcStyle;
  const legGeo = npcSoft ? new THREE.SphereGeometry(0.15, 10, 8) : G.leg;
  const bootGeo = npcSoft ? new THREE.CylinderGeometry(0.14, 0.17, 0.18, 8) : G.boot;
  const pelvisGeo = npcSoft ? new THREE.SphereGeometry(0.28, 10, 8) : G.pelvis;
  const torsoGeo = npcSoft ? new THREE.CylinderGeometry(0.29, 0.34, 0.64, 10) : G.torso;
  const beltGeo = npcSoft ? new THREE.CylinderGeometry(0.30, 0.30, 0.08, 10) : G.belt;
  const headGeo = npcSoft ? new THREE.SphereGeometry(0.215, 12, 8) : G.head;
  const armGeo = npcSoft ? new THREE.SphereGeometry(0.115, 10, 8) : G.arm;
  const handGeo = npcSoft ? new THREE.SphereGeometry(0.09, 10, 8) : G.hand;

  const leg = (side) => {
    const p = new THREE.Group();
    p.position.set(side * 0.14, 0.88, 0);
    const legMesh = mesh(legGeo, mLegs, 0, -0.4, 0);
    if (npcSoft) legMesh.scale.set(0.82, 2.7, 0.9);
    p.add(legMesh);
    p.add(mesh(bootGeo, mBoots, 0, -0.8, 0.04));
    body.add(p);
    return p;
  };
  const legL = leg(-1), legR = leg(1);
  body.add(mesh(pelvisGeo, mLegs, 0, 0.92, 0));

  const torso = new THREE.Group();
  torso.position.y = 0.98;
  body.add(torso);
  torso.add(mesh(torsoGeo, mBody, 0, 0.3, 0));
  torso.add(mesh(beltGeo, mat(0x3a2a1a), 0, 0.02, 0));

  const head = new THREE.Group();
  head.position.y = 0.78;
  torso.add(head);
  head.add(mesh(headGeo, mSkin));
  const eyes = [];
  const eyeMat = L.eyes ? mat(L.eyes, { emissive: L.eyes, ei: 3 }) : mat(0x111111);
  for (const s of [-1, 1]) { const e = mesh(G.eye, eyeMat, s * 0.075, 0.02, 0.185); head.add(e); eyes.push(e); }
  addHeadgear(head, L);

  const arm = (side) => {
    const p = new THREE.Group();
    p.position.set(side * 0.4, 0.56, 0);
    torso.add(p);
    const armMesh = mesh(armGeo, L.bareArms ? mSkin : mBody, 0, -0.25, 0);
    if (npcSoft) armMesh.scale.set(0.78, 2.35, 0.88);
    p.add(armMesh);
    const hand = new THREE.Group();
    hand.position.y = -0.55;
    p.add(hand);
    hand.add(mesh(handGeo, L.fistGlow ? glow(L.fistGlow, 2) : mSkin));
    if (L.shoulder) p.add(mesh(G.shoulder, mAcc, side * 0.02, 0.02, 0));
    return { p, hand };
  };
  const aL = arm(-1), aR = arm(1);

  if (L.robe) body.add(mesh(G.robe, mat(L.robe, { side: THREE.DoubleSide }), 0, 0.5, 0));
  if (L.rags) body.add(mesh(G.rags, mat(L.body, { side: THREE.DoubleSide }), 0, 0.72, 0));
  let cape = null;
  if (L.cape) {
    cape = new THREE.Group();
    cape.position.set(0, 0.62, -0.22);
    cape.add(mesh(G.cape, mat(L.cape, { side: THREE.DoubleSide }), 0, -0.56, 0));
    torso.add(cape);
  }

  // NPC-only visual pass. Keep the shared rig for animation, but rebuild the
  // visible proportions around it: longer legs, smaller head, rounded torso,
  // and role clothing attached to the animated rig instead of floating beside it.
  if (npcSoft) {
    const skin = mat(L.skin, { rough: 0.9, flat: false });
    const cloth = mat(L.body, { rough: 0.92, flat: false });
    const cloth2 = mat(L.robe ?? L.body, { rough: 0.95, flat: false, side: THREE.DoubleSide });
    const leather = mat(L.accent ?? 0x9a8a6a, { rough: 0.82, flat: false });
    const dark = mat(0x211b17, { rough: 0.95, flat: false });

    // Remove the old generic meshes only. The animator groups stay intact.
    body.traverse((o) => { if (o.isMesh) o.visible = false; });

    const capsule = (radius, length, material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 10), material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const smooth = (geo, material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    // Real human proportions: legs make up most of the lower silhouette and
    // the head is deliberately smaller than the previous dwarf-like version.
    legL.add(capsule(0.115, 0.54, mLegs, 0, -0.42, 0));
    legR.add(capsule(0.115, 0.54, mLegs, 0, -0.42, 0));
    legL.add(capsule(0.125, 0.12, mBoots, 0, -0.77, 0.07));
    legR.add(capsule(0.125, 0.12, mBoots, 0, -0.77, 0.07));

    torso.add(smooth(new THREE.CapsuleGeometry(0.27, 0.45, 6, 12), cloth, 0, 0.31, 0));
    torso.add(smooth(new THREE.CylinderGeometry(0.28, 0.29, 0.075, 12), leather, 0, 0.04, 0));

    // Smaller, cleaner face attached to the animated head pivot.
    head.add(smooth(new THREE.SphereGeometry(0.205, 16, 12), skin, 0, 0, 0));
    const eye = mat(0x171513, { rough: 0.35, flat: false });
    for (const s of [-1, 1]) {
      head.add(smooth(new THREE.SphereGeometry(0.022, 8, 6), eye, s * 0.068, 0.01, 0.185));
    }

    // Rounded arms follow the existing arm pivots, so walking/attacks still animate.
    const armMat = L.bareArms ? skin : cloth;
    aL.p.add(capsule(0.095, 0.34, armMat, 0, -0.25, 0));
    aR.p.add(capsule(0.095, 0.34, armMat, 0, -0.25, 0));
    aL.p.add(smooth(new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.48, 0));
    aR.p.add(smooth(new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.48, 0));

    if (L.npcRole === 'watcher') {
      // Maren: fitted field coat + short shoulder mantle + hood. Keep the
      // silhouette vertical rather than turning the body into a cone.
      const coat = smooth(new THREE.CapsuleGeometry(0.31, 0.48, 6, 12), cloth2, 0, 0.30, -0.01);
      coat.scale.set(1.02, 1, 0.82);
      torso.add(coat);
      const mantle = smooth(new THREE.SphereGeometry(0.38, 16, 10), cloth, 0, 0.55, -0.01);
      mantle.scale.set(1.18, 0.28, 0.78);
      torso.add(mantle);
      const hood = smooth(new THREE.SphereGeometry(0.255, 16, 10), mat(L.hood ?? L.body, { rough: 0.9, flat: false }), 0, 0.01, -0.02);
      head.add(hood);
      const opening = smooth(new THREE.SphereGeometry(0.19, 16, 10), dark, 0, 0.0, 0.17);
      opening.scale.set(0.88, 0.88, 0.45);
      head.add(opening);
      const belt = smooth(new THREE.CylinderGeometry(0.30, 0.30, 0.075, 14), leather, 0, 0.04, 0.01);
      torso.add(belt);
      const pouch = smooth(new THREE.SphereGeometry(0.12, 10, 8), leather, 0.28, -0.01, 0.11);
      pouch.scale.set(0.8, 1.15, 0.65);
      torso.add(pouch);
      const badge = smooth(new THREE.CylinderGeometry(0.07, 0.07, 0.028, 12), mat(0xd2b05e, { metal: 0.65, rough: 0.38, flat: false }), 0, 0.25, 0.245);
      badge.rotation.x = Math.PI / 2;
      torso.add(badge);
    }

    if (L.npcRole === 'merchant') {
      // Doran: long trader coat, vest/apron, pouches and a restrained hat.
      const coat = smooth(new THREE.CapsuleGeometry(0.34, 0.50, 6, 12), cloth2, 0, 0.29, 0);
      coat.scale.set(1.04, 1, 0.84);
      torso.add(coat);
      const vest = smooth(new THREE.CylinderGeometry(0.25, 0.30, 0.54, 14, 1, true), cloth, 0, 0.40, 0.19);
      vest.scale.z = 0.72;
      torso.add(vest);
      const apron = smooth(new THREE.BoxGeometry(0.34, 0.43, 0.045), mat(L.robe ?? L.body, { rough: 0.95, flat: false }), 0, 0.27, 0.285);
      apron.rotation.x = 0.03;
      torso.add(apron);
      for (const s of [-1, 1]) {
        const pouch = smooth(new THREE.SphereGeometry(0.115, 10, 8), leather, s * 0.28, 0.03, 0.14);
        pouch.scale.set(0.85, 1.1, 0.65);
        torso.add(pouch);
      }
      const satchel = smooth(new THREE.SphereGeometry(0.20, 12, 10), mat(0x69482f, { rough: 0.95, flat: false }), -0.30, -0.02, -0.08);
      satchel.scale.set(0.75, 1.2, 0.52);
      torso.add(satchel);
      const hatMat = mat(L.hat ?? L.robe ?? L.body, { rough: 0.9, flat: false });
      head.add(smooth(new THREE.CylinderGeometry(0.34, 0.34, 0.045, 18), hatMat, 0, 0.22, 0));
      head.add(smooth(new THREE.CylinderGeometry(0.21, 0.25, 0.25, 14), hatMat, 0, 0.35, -0.01));
      const band = smooth(new THREE.TorusGeometry(0.235, 0.018, 5, 14), leather, 0, 0.31, -0.01);
      head.add(band);
    }

  return { root, body, torso, head, legL, legR, armL: aL.p, armR: aR.p, handL: aL.hand, handR: aR.hand, eyes, cape };
}

function addHeadgear(head, L) {
  switch (L.head) {
    case 'helm': {
      const m = mat(L.accent, { metal: 0.7, rough: 0.4 });
      head.add(mesh(new THREE.CylinderGeometry(0.24, 0.235, 0.3, 8), m, 0, 0.05, 0));
      head.add(mesh(new THREE.ConeGeometry(0.245, 0.16, 8), m, 0, 0.28, 0));
      head.add(mesh(new THREE.BoxGeometry(0.34, 0.04, 0.05), mat(0x111111), 0, 0.03, 0.22));
      head.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.34), mat(0xa0262a), 0, 0.38, -0.03));
      break;
    }
    case 'hair': {
      const hair = mesh(new THREE.IcosahedronGeometry(0.225, 1), mat(L.hair), 0, 0.06, -0.035);
      hair.scale.set(1, 0.85, 1);
      head.add(hair);
      break;
    }
    case 'hat': {
      const m = mat(L.robe ?? L.body);
      head.add(mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 10), m, 0, 0.12, 0));
      const cone = mesh(new THREE.ConeGeometry(0.23, 0.62, 8), m, 0, 0.44, -0.04);
      cone.rotation.x = -0.25;
      head.add(cone);
      head.add(mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 8), mat(L.accent), 0, 0.16, 0));
      break;
    }
    case 'hood': {
      const m = mat(L.hood ?? L.body, { side: THREE.DoubleSide });
      head.add(mesh(new THREE.SphereGeometry(0.27, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), m, 0, 0.02, -0.03));
      const tip = mesh(new THREE.ConeGeometry(0.16, 0.3, 6), m, 0, 0.18, -0.2);
      tip.rotation.x = -1.1;
      head.add(tip);
      break;
    }
    case 'band':
      head.add(mesh(new THREE.CylinderGeometry(0.218, 0.218, 0.06, 8), mat(L.accent), 0, 0.07, 0));
      head.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(0x1c140e), 0, 0.23, -0.06));
      break;
    case 'crown':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const c = mesh(new THREE.ConeGeometry(0.045, 0.24, 4), glow(L.crown ?? 0x9dffe0, 2.2), Math.sin(a) * 0.2, 0.24, Math.cos(a) * 0.2);
        c.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
        head.add(c);
      }
      head.add(mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.26, 8), mat(L.accent, { metal: 0.7, rough: 0.5 }), 0, 0.02, 0));
      head.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), mat(0x050505), 0, 0.03, 0.21));
      break;
  }
}

/** Weapons attach to hand groups. Returned group's userData.tip marks projectile origin. */
export function createWeapon(type, look = {}) {
  const g = new THREE.Group();
  const steel = mat(0xd8dde6, { metal: 0.85, rough: 0.3 });
  const wood = mat(0x4a3220);
  switch (type) {
    case 'sword':
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 5), mat(0x3a2a1a)));
      g.add(mesh(new THREE.BoxGeometry(0.32, 0.05, 0.07), mat(0xc9a44a, { metal: 0.6, rough: 0.4 }), 0, 0.14, 0));
      g.add(mesh(new THREE.BoxGeometry(0.085, 1.0, 0.03), steel, 0, 0.66, 0));
      g.rotation.x = Math.PI / 2 - 0.25;
      break;
    case 'blade':
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 5), mat(0x2a1e14)));
      g.add(mesh(new THREE.BoxGeometry(0.11, 0.75, 0.03), mat(0x6b4a36, { metal: 0.5, rough: 0.7 }), 0.01, 0.5, 0));
      g.rotation.x = Math.PI / 2 - 0.3;
      break;
    case 'greatsword':
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 5), mat(0x1a1410)));
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.08, 0.1), mat(0x3a3f48, { metal: 0.7, rough: 0.4 }), 0, 0.22, 0));
      g.add(mesh(new THREE.BoxGeometry(0.2, 1.7, 0.05), mat(0x2a2e36, { metal: 0.8, rough: 0.35 }), 0, 1.1, 0));
      g.add(mesh(new THREE.BoxGeometry(0.05, 1.5, 0.06), glow(0x9dffe0, 2), 0, 1.1, 0));
      g.rotation.x = Math.PI / 2 - 0.3;
      g.userData.rune = g.children[3];
      break;
    case 'shield': {
      const s = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 8), mat(0x2d3e66), 0, 0.05, 0.12);
      s.rotation.x = Math.PI / 2;
      g.add(s);
      const rim = mesh(new THREE.TorusGeometry(0.33, 0.03, 4, 8), mat(0xbfc7d5, { metal: 0.7, rough: 0.4 }), 0, 0.05, 0.16);
      g.add(rim);
      g.add(mesh(new THREE.OctahedronGeometry(0.09), glow(0x8fb4ff, 1.5), 0, 0.05, 0.18));
      g.position.x = -0.06;
      break;
    }
    case 'bow': {
      const geo = new THREE.TorusGeometry(0.55, 0.028, 4, 16, Math.PI);
      geo.rotateZ(-Math.PI / 2);
      geo.rotateY(-Math.PI / 2);
      g.add(mesh(geo, mat(0x8a6a3a)));
      g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.1, 3), glow(0xffe6a0, 1)));
      g.userData.tip = g;
      break;
    }
    case 'staff': {
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.8, 6), wood, 0, 0.45, 0));
      const orb = mesh(new THREE.IcosahedronGeometry(0.13, 1), glow(look.orb ?? 0xffffff, 3), 0, 1.47, 0);
      g.add(orb);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const p = mesh(new THREE.ConeGeometry(0.03, 0.26, 4), wood, Math.sin(a) * 0.1, 1.4, Math.cos(a) * 0.1);
        p.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
        g.add(p);
      }
      g.userData.tip = orb;
      break;
    }
    case 'lanternStaff': {
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 6), wood, 0, 0.5, 0));
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), wood, 0.13, 1.4, 0));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), glow(0xffc36a, 3), 0.28, 1.25, 0));
      g.add(mesh(new THREE.ConeGeometry(0.13, 0.1, 4), mat(0x222222, { metal: 0.6 }), 0.28, 1.4, 0));
      break;
    }
  }
  return g;
}

/** Floating spectral enemy (no rig; animated by Enemy directly). */
export function createWispModel() {
  const root = new THREE.Group();
  const core = mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(0xd9a0ff, { emissive: 0xb45aff, ei: 2.6 }), 0, 1.4, 0);
  const shell = mesh(new THREE.IcosahedronGeometry(0.5, 1), mat(0x6a3a9a, { emissive: 0x6a2aa0, ei: 0.6, opacity: 0.35 }), 0, 1.4, 0);
  shell.castShadow = false;
  const tail = mesh(new THREE.ConeGeometry(0.34, 1.0, 7), mat(0x4a2a6a, { emissive: 0x5a1a90, ei: 0.5, opacity: 0.3 }), 0, 0.8, 0);
  tail.rotation.x = Math.PI;
  tail.castShadow = false;
  root.add(core, shell, tail);
  const shards = [];
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.OctahedronGeometry(0.09), glow(0xe0b0ff, 2), 0, 1.4, 0);
    root.add(s);
    shards.push(s);
  }
  return { root, core, shell, tail, shards };
}

// ---------------------------------------------------------------------------

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const bump = (t) => Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);

/** Procedural animation: idle breathing, walk cycle, attack overlays, hurt, death. */
export class HumanoidAnimator {
  constructor(rig) {
    this.r = rig;
    this.phase = 0;
    this.t = Math.random() * 10;
    this.atk = null;
    this.hurt = 0;
    this.baseTorso = rig.torso.rotation.x;
    this.dead = 0;
    this.dying = false;
    this.side = 1;
    this.kneel = 0; // 0..1, used by the dormant boss
  }
  attack(style, dur) { this.side = -this.side; this.atk = { style, t: 0, dur }; }
  hit() { this.hurt = 1; }
  die() { this.dying = true; this.atk = null; }
  revive() { this.dying = false; this.dead = 0; this.r.body.rotation.set(0, 0, 0); this.r.body.position.set(0, 0, 0); }

  update(dt, speedNorm) {
    const r = this.r;
    this.t += dt;
    const s = Math.min(1, speedNorm);
    if (s > 0.05) this.phase += dt * (5 + 5 * s);
    else this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 8);
    const sw = Math.sin(this.phase);

    let legL = sw * 0.75 * s, legR = -sw * 0.75 * s;
    let aL = -sw * 0.55 * s, aR = sw * 0.55 * s, zL = -0.08, zR = 0.08;
    let tx = this.baseTorso + 0.08 * s + Math.sin(this.t * 1.8) * 0.025;
    let ty = sw * 0.12 * s;
    let hx = 0, bodyYaw = 0;
    r.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * s + Math.sin(this.t * 2) * 0.008;

    const a = this.atk;
    if (a) {
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      switch (a.style) {
        case 'slash': {
          const up = p < 0.3 ? easeOut(p / 0.3) : p < 0.55 ? 1 - easeOut((p - 0.3) / 0.25) * 1.1 : -0.1 * (1 - (p - 0.55) / 0.45);
          aR = -0.2 - 2.5 * Math.max(0, up) + (up < 0 ? 0.3 : 0);
          ty = p < 0.3 ? -0.35 * easeOut(p / 0.3) : p < 0.6 ? 0.4 : 0.4 * (1 - (p - 0.6) / 0.4);
          tx += p > 0.3 && p < 0.7 ? 0.15 : 0;
          break;
        }
        case 'punch': {
          const k = bump(p * 1.4);
          if (this.side > 0) aR = -1.6 * k; else aL = -1.6 * k;
          ty = this.side * 0.45 * k;
          zR = 0.02; zL = -0.02;
          break;
        }
        case 'cast': {
          const k = bump(p);
          aL = aR = -1.35 * k;
          zL = -0.3 * k; zR = 0.3 * k;
          tx -= 0.1 * k;
          break;
        }
        case 'shoot': {
          const k = bump(p * 0.9);
          aL = -1.55 * k;
          aR = -1.35 * k * (p < 0.5 ? 1 : 0.6);
          zR = 0.5 * k;
          ty = -0.45 * k;
          break;
        }
        case 'whirl':
          bodyYaw = easeOut(p) * Math.PI * 2;
          aR = -1.5; aL = -1.2; zL = -1.0; zR = 1.0;
          break;
        case 'slam': {
          const up = p < 0.45 ? easeOut(p / 0.45) : Math.max(0, 1 - (p - 0.45) / 0.15);
          aL = aR = -0.6 - 2.3 * up;
          tx += p > 0.5 ? 0.35 : -0.2 * up;
          break;
        }
        case 'roar': {
          const k = bump(p);
          zL = -1.3 * k; zR = 1.3 * k; aL = aR = -0.4 * k;
          tx -= 0.35 * k; hx = -0.4 * k;
          break;
        }
      }
      if (p >= 1) this.atk = null;
    }

    tx -= this.hurt * 0.4;
    this.hurt = Math.max(0, this.hurt - dt * 4);
    if (this.kneel > 0) {
      const k = this.kneel;
      tx += 0.7 * k; legL -= 1.2 * k; legR += 0.2 * k; aL = aR = -0.3 * k;
      r.body.position.y -= 0.35 * k;
      hx += 0.4 * k;
    }

    r.legL.rotation.x = legL; r.legR.rotation.x = legR;
    r.armL.rotation.set(aL, 0, zL); r.armR.rotation.set(aR, 0, zR);
    r.torso.rotation.set(tx, ty, 0);
    r.head.rotation.x = hx;
    r.body.rotation.y = bodyYaw;
    if (r.cape) r.cape.rotation.x = 0.12 + s * 0.5 + Math.sin(this.t * 3) * 0.04;

    if (this.dying) {
      this.dead = Math.min(1, this.dead + dt * 2.2);
      const k = easeOut(this.dead);
      r.body.rotation.x = -Math.PI / 2 * k;
      r.body.position.y = 0.15 * k;
    }
  }
}
