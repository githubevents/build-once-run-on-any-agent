import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  corkTexture, githubStickerTexture, leafTexture, pageTexture, paperTexture, plateTexture,
  procoreStickerTexture, rng, soilTexture, stickyTexture, woodTexture,
} from './textures.js';
import { DECK, keyboardTexture, laptopScreenTexture, phoneTexture } from './screens.js';

// Units are centimetres. x runs left to right, z toward the viewer, y up from the desk top.
const std = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const rbox = (w, h, d, r, segments = 4) => new RoundedBoxGeometry(w, h, d, segments, r);

/** A printed surface lying flat at height y, texture top toward -z. */
function flat(w, d, material, y) {
  const m = mesh(new THREE.PlaneGeometry(w, d), material, { cast: false });
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

function decalMaterial(map, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map, roughness: 0.55, ...extra,
  });
}

function roundedRect(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  return geometry;
}

export function makeDesk() {
  const map = woodTexture();
  map.repeat.set(500 / 170, 340 / 84);
  const desk = mesh(new THREE.PlaneGeometry(500, 340), new THREE.MeshPhysicalMaterial({
    map, roughness: 0.58, clearcoat: 0.22, clearcoatRoughness: 0.45,
  }), { cast: false });
  desk.rotation.x = -Math.PI / 2;
  desk.position.z = 30;
  const wall = mesh(new THREE.PlaneGeometry(500, 200), std('#ece2d3', 0.95), { cast: false });
  wall.position.set(0, 100, -140);
  const group = new THREE.Group();
  group.add(desk, wall);
  return group;
}

export function makeLaptop() {
  const group = new THREE.Group();
  const alu = std('#a2a5ab', 0.36, 0.7);
  const W = 30.4;
  const D = 21.4;
  const T = 1.15;
  const base = mesh(rbox(W, T, D, 0.5, 5), alu);
  base.position.y = T / 2;
  group.add(base);
  const deck = flat(DECK.w, DECK.d, decalMaterial(keyboardTexture(), { roughness: 0.42, metalness: 0.45 }), T + 0.01);
  group.add(deck);

  const hinge = mesh(new THREE.CylinderGeometry(0.5, 0.5, 24, 24), std('#2b2c30', 0.5, 0.4));
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, T, -D / 2 + 0.35);
  group.add(hinge);

  const lid = new THREE.Group();
  lid.position.set(0, T, -D / 2 + 0.2);
  lid.rotation.x = -0.4;
  const LH = 20.2;
  const shell = mesh(rbox(W, LH, 0.5, 0.24, 4), alu);
  shell.position.set(0, LH / 2, -0.25);
  const bezel = mesh(roundedRect(W - 0.5, LH - 0.5, 0.6), std('#08090b', 0.22, 0.1), { cast: false });
  bezel.position.set(0, LH / 2, 0.006);
  const screen = new THREE.Mesh(roundedRect(27.6, 17.25, 0.25), new THREE.MeshBasicMaterial({
    map: laptopScreenTexture(), toneMapped: false,
  }));
  screen.position.set(0, LH / 2 + 0.6, 0.012);
  const cam = mesh(new THREE.CircleGeometry(0.14, 20), std('#1d2433', 0.2, 0.3), { cast: false });
  cam.position.set(0, LH - 0.55, 0.012);
  lid.add(shell, bezel, screen, cam);
  group.add(lid);

  const sticker = (map, geometry, x, z, rot) => {
    const m = mesh(geometry, decalMaterial(map, { roughness: 0.4, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { cast: false });
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, T + 0.03, z);
    return m;
  };
  const github = sticker(githubStickerTexture(), new THREE.CircleGeometry(1.55, 64), -10.5, 6.6, 0);
  const procore = sticker(procoreStickerTexture(), new THREE.PlaneGeometry(5.0, 1.56), 10.4, 3.4, 0.05);
  group.add(github, procore);
  return { group, screen, github, procore };
}

export function makeNameplate(name) {
  const group = new THREE.Group();
  const L = 12.6;
  // Profile in (z, y): flat back, sloped printed face toward the viewer.
  const shape = new THREE.Shape();
  shape.moveTo(-2.0, 0);
  shape.lineTo(2.2, 0);
  shape.lineTo(2.2, 0.55);
  shape.lineTo(-1.0, 2.75);
  shape.lineTo(-2.0, 2.75);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: L, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 4,
  });
  geometry.translate(0, 0, -L / 2);
  geometry.rotateY(-Math.PI / 2);
  geometry.computeVertexNormals();
  const walnut = woodTexture({ size: 1024, planks: 2, tone: [96, 60, 38], spread: 10, seed: name.length, joints: false });
  walnut.repeat.set(0.08, 0.08);
  const block = mesh(geometry, new THREE.MeshPhysicalMaterial({ map: walnut, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
  block.material.side = THREE.DoubleSide;
  group.add(block);

  const slope = Math.atan2(2.75 - 0.55, 2.2 + 1.0);
  const plate = mesh(new THREE.PlaneGeometry(10.8, 2.25), new THREE.MeshStandardMaterial({
    map: plateTexture(name), roughness: 0.32, metalness: 0.55,
  }), { cast: false });
  plate.rotation.x = -(Math.PI / 2 - slope);
  plate.position.set(0, (0.55 + 2.75) / 2 + Math.cos(slope) * 0.13, (2.2 - 1.0) / 2 + Math.sin(slope) * 0.13);
  group.add(plate);
  return group;
}

function stickyGeometry(size, curl) {
  const geometry = new THREE.PlaneGeometry(size, size, 1, 12);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) + size / 2) / size;
    if (t > 0.55) pos.setY(i, curl * ((t - 0.55) / 0.45) ** 2.2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function makeNotebook() {
  const group = new THREE.Group();
  const cover = mesh(rbox(16.4, 0.45, 21.4, 0.2), std('#26272b', 0.55));
  cover.position.y = 0.225;
  const pages = mesh(rbox(15.4, 0.7, 20.6, 0.12), std('#efe8d6', 0.85));
  pages.position.set(0.45, 0.45 + 0.35, 0);
  const top = flat(15.0, 20.2, decalMaterial(pageTexture(), { roughness: 0.85 }), 1.165);
  top.position.x = 0.45;
  group.add(cover, pages, top);

  const ring = new THREE.TorusGeometry(0.62, 0.085, 10, 32);
  const metal = std('#cfd2d6', 0.28, 0.9);
  for (let i = 0; i < 15; i++) {
    const r = mesh(ring, metal);
    r.position.set(-7.55, 0.8, -9.1 + i * 1.3);
    group.add(r);
  }

  const notes = {};
  const sticky = (id, color, text, x, z, rot, curl, lift) => {
    const note = mesh(stickyGeometry(6.4, curl), new THREE.MeshStandardMaterial({
      map: stickyTexture(color, text), roughness: 0.8, side: THREE.DoubleSide,
    }));
    note.position.set(x, 1.19 + lift, z);
    note.rotation.y = rot;
    group.add(note);
    notes[id] = note;
  };
  sticky('ideas', '#fbe36d', 'ideas', -0.4, -4.4, 0.08, 0.3, 0);
  sticky('survey', '#f6a9c2', '', -1.8, 2.4, -0.06, 0, 0.04);
  sticky('slides', '#a8dcf3', 'slides', 2.4, 3.7, 0.1, 0.3, 0.08);
  return { group, notes };
}

export function makePen() {
  const group = new THREE.Group();
  const black = std('#141416', 0.35, 0.2);
  const chrome = std('#d9dbe0', 0.18, 1);
  const body = mesh(new THREE.CylinderGeometry(0.4, 0.4, 9.6, 32), black);
  body.position.y = 1.2;
  const grip = mesh(new THREE.CylinderGeometry(0.36, 0.4, 2.6, 32), std('#2a2b2e', 0.8));
  grip.position.y = -4.9;
  const tip = mesh(new THREE.ConeGeometry(0.36, 1.1, 32), chrome);
  tip.rotation.x = Math.PI;
  tip.position.y = -6.75;
  const cap = mesh(new THREE.SphereGeometry(0.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
  cap.position.y = 6.0;
  const clip = mesh(rbox(0.26, 4.2, 0.22, 0.08), chrome);
  clip.position.set(0, 3.6, -0.48);
  group.add(body, grip, tip, cap, clip);
  group.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  group.position.y = 0.4;
  holder.add(group);
  return holder;
}

export function makePaperStack() {
  const group = new THREE.Group();
  const random = rng(17);
  const paper = std('#fafaf7', 0.92);
  const sheets = 6;
  for (let i = 0; i < sheets; i++) {
    const sheet = mesh(new THREE.BoxGeometry(23, 0.05, 16), paper);
    sheet.position.set((random() - 0.5) * 1.2, 0.025 + i * 0.055, (random() - 0.5) * 1.0);
    sheet.rotation.y = i === sheets - 1 ? 0 : (random() - 0.5) * 0.12;
    group.add(sheet);
  }
  const top = flat(23, 16, decalMaterial(paperTexture(), { roughness: 0.9 }), 0.05 + (sheets - 1) * 0.055 + 0.012);
  top.position.x = group.children[sheets - 1].position.x;
  top.position.z = group.children[sheets - 1].position.z;
  group.add(top);
  return group;
}

export function makePhone() {
  const group = new THREE.Group();
  const body = mesh(rbox(7.3, 0.78, 15.2, 0.36, 5), std('#2c2d31', 0.32, 0.75));
  body.position.y = 0.39;
  const glass = mesh(roundedRect(7.05, 14.95, 0.95), std('#050506', 0.12, 0.2), { cast: false });
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.781;
  const screen = new THREE.Mesh(roundedRect(6.75, 14.6, 0.8), new THREE.MeshBasicMaterial({ map: phoneTexture(), toneMapped: false }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = 0.786;
  group.add(body, glass, screen);
  return group;
}

function lathe(points, segments = 96) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

export function makeHeadphones() {
  const group = new THREE.Group();
  const shellMat = std('#1b1c1f', 0.48, 0.1);
  const padMat = std('#111113', 0.85);
  const metal = std('#4a4c52', 0.3, 0.8);
  const R = 4.4;
  const shellProfile = [[0, 0], [3.9, 0], [4.35, 0.35], [R, 1.3], [4.25, 2.4], [3.5, 3.0], [1.5, 3.25], [0, 3.3]];
  const pivot = new THREE.Group();
  pivot.position.y = R + 0.05;
  for (const side of [-1, 1]) {
    const geometry = lathe(shellProfile);
    geometry.rotateZ(-side * Math.PI / 2);
    const shell = mesh(geometry, shellMat);
    shell.position.x = side * 6.2;
    const cushion = mesh(new THREE.TorusGeometry(3.4, 1.05, 24, 72), padMat);
    cushion.rotation.y = Math.PI / 2;
    cushion.scale.set(1, 1, 0.8);
    cushion.position.x = side * 5.6;
    const fabric = mesh(new THREE.CircleGeometry(3.4, 48), std('#202125', 0.95));
    fabric.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    fabric.position.x = side * 5.3;
    const yoke = mesh(new THREE.TorusGeometry(4.75, 0.22, 12, 48, Math.PI * 0.62), metal);
    yoke.rotation.set(0, Math.PI / 2, Math.PI / 2 - Math.PI * 0.31);
    yoke.position.x = side * 7.4;
    pivot.add(shell, cushion, fabric, yoke);
  }
  const band = new THREE.CatmullRomCurve3([
    [-7.5, 4.2], [-8.3, 7.6], [-7.0, 11.2], [-3.8, 13.3], [0, 13.9], [3.8, 13.3], [7.0, 11.2], [8.3, 7.6], [7.5, 4.2],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const outer = mesh(new THREE.TubeGeometry(band, 128, 0.62, 20), shellMat);
  outer.scale.z = 1.6;
  const padCurve = new THREE.CatmullRomCurve3([[-6.4, 10.4], [-3.4, 12.4], [0, 12.95], [3.4, 12.4], [6.4, 10.4]]
    .map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const pad = mesh(new THREE.TubeGeometry(padCurve, 96, 0.7, 18), padMat);
  pad.scale.z = 1.5;
  pivot.add(outer, pad);
  pivot.rotation.x = -0.42;
  group.add(pivot);
  return group;
}

export function makeMug() {
  const group = new THREE.Group();
  const cork = mesh(new THREE.CylinderGeometry(5.3, 5.3, 0.45, 96), std('#b98a58', 0.9, 0, { map: corkTexture() }));
  cork.position.y = 0.225;
  group.add(cork);
  const ceramic = new THREE.MeshPhysicalMaterial({ color: '#f3efe7', roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15, side: THREE.DoubleSide });
  const body = mesh(lathe([
    [0, 0], [3.3, 0], [3.6, 0.12], [3.78, 0.5], [3.98, 4.5], [4.1, 8.3], [4.06, 8.5], [3.88, 8.5], [3.8, 8.3], [3.68, 4.5], [3.5, 1.0], [3.1, 0.62], [0, 0.62],
  ]), ceramic);
  body.position.y = 0.45;
  const coffee = mesh(new THREE.CircleGeometry(3.74, 64), new THREE.MeshPhysicalMaterial({ color: '#2a170b', roughness: 0.12, clearcoat: 1 }), { cast: false });
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.45 + 7.4;
  const handle = mesh(new THREE.TorusGeometry(2.1, 0.46, 24, 64, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.scale.set(0.9, 1, 1);
  handle.position.set(3.8, 0.45 + 4.6, 0);
  group.add(body, coffee, handle);
  return group;
}

export function makeDuck() {
  const group = new THREE.Group();
  const yellow = new THREE.MeshPhysicalMaterial({ color: '#ffcc1a', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const orange = std('#ff8a1c', 0.4);
  const ball = (r, material, sx, sy, sz, x, y, z) => {
    const m = mesh(new THREE.SphereGeometry(r, 48, 32), material);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  ball(2.6, yellow, 1.25, 0.82, 1.0, 0, 2.15, 0);
  ball(1.75, yellow, 1, 1, 1, -1.9, 4.5, 0);
  ball(0.95, orange, 1.25, 0.42, 1.0, -3.55, 4.15, 0);
  ball(1.1, yellow, 1.4, 0.55, 0.7, 0.3, 2.9, 1.95).rotation.z = 0.2;
  ball(1.1, yellow, 1.4, 0.55, 0.7, 0.3, 2.9, -1.95).rotation.z = 0.2;
  const tail = mesh(new THREE.ConeGeometry(1.0, 1.9, 32), yellow);
  tail.position.set(3.1, 3.2, 0);
  tail.rotation.z = -0.95;
  group.add(tail);
  const eye = std('#0b0b0c', 0.15);
  const shine = std('#ffffff', 0.2);
  for (const side of [-1, 1]) {
    ball(0.24, eye, 1, 1, 1, -3.0, 5.05, side * 0.95);
    ball(0.07, shine, 1, 1, 1, -3.16, 5.16, side * 1.06);
  }
  return group;
}

function leafGeometry(length, width, droop, cup) {
  const N = 14;
  const M = 6;
  const positions = [];
  const uvs = [];
  const index = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = width * Math.sin(Math.PI * t ** 0.72);
    for (let j = 0; j <= M; j++) {
      const s = (j / M) * 2 - 1;
      positions.push(s * w / 2, droop * t * t * length + cup * Math.abs(s) * w / 2, t * length);
      uvs.push(j / M, t);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export function makePlant({ potRadius = 5, potHeight = 7, leaves = 24, leafLength = 6.5, leafWidth = 4, spread = 1, seed = 1, variegated = false } = {}) {
  const group = new THREE.Group();
  const random = rng(seed);
  const r = potRadius;
  const ceramic = new THREE.MeshPhysicalMaterial({ color: '#f1ede6', roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide });
  const pot = mesh(lathe([
    [0, 0], [r * 0.72, 0], [r * 0.8, 0.25], [r * 0.97, potHeight * 0.92], [r, potHeight], [r * 0.9, potHeight], [r * 0.86, potHeight * 0.88], [0, potHeight * 0.88],
  ]), ceramic);
  const soil = mesh(new THREE.CircleGeometry(r * 0.88, 48), std('#3a2618', 1, 0, { map: soilTexture() }), { cast: false });
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = potHeight * 0.86;
  group.add(pot, soil);

  const materials = [
    new THREE.MeshStandardMaterial({ map: leafTexture({ variegated }), roughness: 0.55, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ map: leafTexture({ base: '#3d8f3a', edge: '#276b2a', variegated }), roughness: 0.5, side: THREE.DoubleSide }),
  ];
  const stemMat = std('#4b7a33', 0.7);
  const top = potHeight * 0.86;
  for (let i = 0; i < leaves; i++) {
    const az = (i / leaves) * Math.PI * 2 * 2.618 + random() * 0.4;
    const ring = i / leaves;
    const height = top + 1.2 + (1 - ring) * 6 * spread + random() * 1.5;
    const reach = (0.6 + ring * 2.6) * spread;
    const base = new THREE.Vector3(Math.cos(az) * reach, height, Math.sin(az) * reach);
    const stem = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3((random() - 0.5) * 0.8, top, (random() - 0.5) * 0.8),
      new THREE.Vector3(base.x * 0.3, height * 0.8, base.z * 0.3),
      base,
    );
    group.add(mesh(new THREE.TubeGeometry(stem, 10, 0.1, 6), stemMat, { receive: false }));
    const size = 0.75 + random() * 0.4;
    const leaf = mesh(leafGeometry(leafLength * size, leafWidth * size, -0.22 - random() * 0.2, 0.18), materials[i % 2]);
    leaf.position.copy(base);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = Math.PI / 2 - az;
    leaf.rotation.x = -(0.15 + (1 - ring) * 0.75 + random() * 0.2);
    leaf.rotation.z = (random() - 0.5) * 0.5;
    group.add(leaf);
  }
  return group;
}
