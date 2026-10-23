import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  makeDesk, makeDuck, makeHeadphones, makeLaptop, makeMug, makeNameplate, makeNotebook,
  makePaperStack, makePen, makePhone, makePlant,
} from './parts.js';
import { setAnisotropy } from './textures.js';

const VFOV = 30;
/** Overview framing: everything from the plant and notebook on the left to the phone and duck on the right. */
export const HOME = { x: -0.5, z: -1, w: 84, h: 62, tall: 18, el: 56 };
// Portrait is width-bound: look down more steeply and let only the plants' outermost leaf tips crop.
const PORTRAIT = { el: 66, w: 80 };
const BOUNDS = { x: 40, zMin: -30, zMax: 26 };
const HIGHLIGHT = new THREE.Color('#ffb15c');

/** Builds the desk and returns the hotspot objects keyed by the ids used in index.html. */
function buildDesk(scene) {
  scene.add(makeDesk());
  const laptop = makeLaptop();
  laptop.group.position.set(3.5, 0, 3);
  laptop.group.rotation.y = 0.11;

  const notebook = makeNotebook();
  notebook.group.position.set(-26.5, 0, -1.5);
  notebook.group.rotation.y = 0.12;

  const pen = makePen();
  pen.position.set(-15.3, 0, -0.5);
  pen.rotation.y = 0.14;

  const papers = makePaperStack();
  papers.position.set(-23, 0, 20);
  papers.rotation.y = 0.16;

  const andrea = makeNameplate('Andrea Griffiths');
  andrea.position.set(0, 0, 19.2);
  andrea.rotation.y = 0.1;
  const shishir = makeNameplate('Shishir Tewari');
  shishir.position.set(14.2, 0, 17.6);
  shishir.rotation.y = 0.1;

  const phone = makePhone();
  phone.position.set(27, 0, 9);
  phone.rotation.y = 0.36;

  const headphones = makeHeadphones();
  headphones.position.set(30, 0, -3);
  headphones.scale.setScalar(0.85);
  headphones.rotation.y = -0.12;

  const mug = makeMug();
  mug.position.set(20.5, 0, -20.5);
  const duck = makeDuck();
  duck.position.set(29, 0, -18.5);
  duck.rotation.y = 0.65;

  const leftPlant = makePlant({ potRadius: 5, potHeight: 7, leaves: 22, leafLength: 7.5, leafWidth: 4.4, spread: 1.15, seed: 4, variegated: true });
  leftPlant.position.set(-31, 0, -18);
  const rightPlant = makePlant({ potRadius: 4.2, potHeight: 5.6, leaves: 34, leafLength: 4.2, leafWidth: 2.6, spread: 1, seed: 9 });
  rightPlant.position.set(34, 0, -28);

  scene.add(laptop.group, notebook.group, pen, papers, andrea, shishir, phone, headphones, mug, duck, leftPlant, rightPlant);
  return {
    laptop: laptop.group,
    ideas: notebook.notes.ideas,
    slides: notebook.notes.slides,
    code: papers,
    phone,
    headphones,
    andrea,
    shishir,
    procore: laptop.procore,
    github: laptop.github,
  };
}

function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function loadFonts() {
  if (!document.fonts) return;
  const fonts = ['400 40px Inter', '500 40px Inter', '600 40px Inter'].map((f) => document.fonts.load(f));
  await Promise.race([Promise.all(fonts), new Promise((resolve) => setTimeout(resolve, 2500))]).catch(() => {});
}

export async function start() {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');
  const label = document.getElementById('hotspot-label');
  const reset = document.getElementById('reset-view');
  const anchors = new Map([...document.querySelectorAll('#objects .spot')].map((a) => [a.dataset.id, a]));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  await loadFonts();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  // three r180+ folds PCFSoftShadowMap into PCFShadowMap; shadow.radius sets the softness.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9dece');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fff6ea', '#a07c58', 0.55));
  const key = new THREE.DirectionalLight('#ffe9cf', 2.3);
  key.position.set(-55, 85, 40);
  key.castShadow = true;
  const coarse = matchMedia('(pointer: coarse)').matches;
  key.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096);
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 50, bottom: -50, near: 20, far: 220 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 4;
  const fill = new THREE.DirectionalLight('#dfe7ff', 0.45);
  fill.position.set(60, 50, 50);
  scene.add(key, key.target, fill);

  const hotspots = buildDesk(scene);
  const meshes = new Map();
  const highlightable = new Map();
  for (const [id, object] of Object.entries(hotspots)) object.userData.hotspot = id;
  for (const [id, object] of Object.entries(hotspots)) {
    const list = [];
    object.traverse((child) => {
      if (!child.isMesh) return;
      let owner = child;
      while (owner && !owner.userData.hotspot) owner = owner.parent;
      if (owner?.userData.hotspot !== id) return;
      child.material = child.material.clone();
      list.push(child);
    });
    meshes.set(id, list);
    highlightable.set(id, list.filter((m) => 'emissive' in m.material));
  }
  const pickables = [...meshes.values()].flat();
  scene.updateMatrixWorld(true);
  const boxes = new Map([...Object.entries(hotspots)].map(([id, o]) => [id, new THREE.Box3().setFromObject(o)]));

  const camera = new THREE.PerspectiveCamera(VFOV, 1, 1, 2000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.rotateSpeed = 0.7;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = 1.2;
  controls.minAzimuthAngle = -1.05;
  controls.maxAzimuthAngle = 1.05;
  controls.minDistance = 22;

  let width = 1;
  let height = 1;
  let dirty = true;
  let moved = false;
  let flight = null;
  let home = null;

  function frame() {
    const aspect = width / height;
    const v = THREE.MathUtils.degToRad(VFOV);
    const hfov = 2 * Math.atan(Math.tan(v / 2) * aspect);
    const portrait = aspect < 0.8;
    const el = THREE.MathUtils.degToRad(portrait ? PORTRAIT.el : HOME.el);
    const deep = HOME.h * Math.sin(el) + HOME.tall * Math.cos(el);
    const dist = 1.04 * Math.max((portrait ? PORTRAIT.w : HOME.w) / (2 * Math.tan(hfov / 2)), deep / (2 * Math.tan(v / 2)));
    const target = new THREE.Vector3(HOME.x, 0, HOME.z);
    return { target, position: target.clone().add(new THREE.Vector3(0, Math.sin(el), Math.cos(el)).multiplyScalar(dist)), dist };
  }

  function fly(snap) {
    home = frame();
    controls.maxDistance = home.dist * 1.35;
    camera.near = home.dist / 40;
    camera.far = home.dist * 8;
    scene.fog = new THREE.Fog(scene.background, home.dist * 1.3, home.dist * 3);
    camera.updateProjectionMatrix();
    if (snap || reducedMotion) {
      camera.position.copy(home.position);
      controls.target.copy(home.target);
      controls.update();
      flight = null;
    } else {
      flight = home;
    }
    moved = false;
    reset.hidden = true;
    dirty = true;
  }

  function resize() {
    width = Math.max(stage.clientWidth, 1);
    height = Math.max(stage.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (moved) {
      home = frame();
      controls.maxDistance = home.dist * 1.35;
      dirty = true;
    } else {
      fly(true);
    }
  }

  controls.addEventListener('start', () => { flight = null; });
  controls.addEventListener('change', () => {
    const t = controls.target;
    t.set(THREE.MathUtils.clamp(t.x, -BOUNDS.x, BOUNDS.x), 0, THREE.MathUtils.clamp(t.z, BOUNDS.zMin, BOUNDS.zMax));
    if (!flight && home && camera.position.distanceTo(home.position) > 1) {
      moved = true;
      reset.hidden = false;
    }
    dirty = true;
  });
  reset.addEventListener('click', () => fly(false));

  let hover = null;
  let focus = null;
  let active = null;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let pendingPick = false;

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    let owner = hit?.object;
    while (owner && !owner.userData.hotspot) owner = owner.parent;
    return owner?.userData.hotspot ?? null;
  }

  function setActive() {
    const next = hover ?? focus;
    if (next === active) return;
    if (active) for (const m of highlightable.get(active)) m.material.emissive.setRGB(0, 0, 0);
    active = next;
    if (active) {
      for (const m of highlightable.get(active)) {
        m.material.emissive.copy(HIGHLIGHT);
        m.material.emissiveIntensity = 0.09;
      }
      label.textContent = anchors.get(active)?.querySelector('title')?.textContent ?? '';
    }
    label.hidden = !active;
    canvas.style.cursor = hover ? 'pointer' : '';
    dirty = true;
  }

  function placeLabel() {
    if (!active) return;
    const box = boxes.get(active);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(camera);
    const x = THREE.MathUtils.clamp((p.x + 1) / 2 * width, 60, width - 60);
    const y = THREE.MathUtils.clamp((1 - p.y) / 2 * height, 40, height - 10);
    label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

  function activate(id) {
    const anchor = anchors.get(id);
    if (!anchor) return;
    if (anchor.dataset.dialog) {
      document.getElementById('dialog-' + anchor.dataset.dialog).showModal();
    } else {
      window.open(anchor.getAttribute('href'), '_blank', 'noopener');
    }
  }

  let lastMove = null;
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    lastMove = event;
    pendingPick = true;
  });
  canvas.addEventListener('pointerleave', () => {
    pendingPick = false;
    hover = null;
    setActive();
  });
  let down = null;
  canvas.addEventListener('pointerdown', (event) => { down = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('click', (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const id = pick(event.clientX, event.clientY);
    if (id) activate(id);
  });

  const order = [...anchors.keys()];
  for (const [id, anchor] of anchors) {
    anchor.addEventListener('focus', () => { focus = id; setActive(); });
    anchor.addEventListener('blur', () => { if (focus === id) { focus = null; setActive(); } });
    anchor.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      anchors.get(order[(order.indexOf(id) + step + order.length) % order.length]).focus();
    });
  }

  new ResizeObserver(resize).observe(stage);
  resize();
  document.documentElement.classList.add('is-3d');

  renderer.setAnimationLoop(() => {
    if (flight) {
      const k = 0.12;
      camera.position.lerp(flight.position, k);
      controls.target.lerp(flight.target, k);
      if (camera.position.distanceTo(flight.position) < 0.05) {
        camera.position.copy(flight.position);
        controls.target.copy(flight.target);
        flight = null;
      }
      dirty = true;
    }
    controls.update();
    if (pendingPick && lastMove) {
      pendingPick = false;
      hover = pick(lastMove.clientX, lastMove.clientY);
      setActive();
    }
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    placeLabel();
  });
}

if (webglAvailable()) {
  start().catch((error) => {
    console.error(error);
    document.documentElement.classList.remove('is-3d');
    window.deskFallback?.();
  });
} else {
  window.deskFallback?.();
}
