import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

export async function startDesk(context, onError) {
const LABELS = {
  laptop: 'Demos', ideas: 'What this is', slides: 'Slides', code: 'The code', phone: 'GitHub September updates',
  andrea: 'Andrea on X', shishir: 'Shishir on LinkedIn', procore: 'Procore', github: 'Survey',
};
const canvas = document.getElementById('scene');
const stage = canvas.parentElement;
const tip = document.getElementById('tip');
const nav = document.getElementById('objects');
const touch = matchMedia('(pointer: coarse)').matches;
let resolutionLimit = Infinity;
let dirty = true;

const W = await fetch('assets/world.json').then((r) => {
  if (!r.ok) throw new Error(`World configuration: HTTP ${r.status}`);
  return r.json();
});
const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9cdbd);
const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 60);
// Keep stationary splats stable when the camera-relative accumulator is rebuilt.
const spark = new SparkRenderer({ renderer, accumExtSplats: true, onDirty: () => { dirty = true; } });
scene.add(spark);

// Printed details use the supplied photo, with splats still occluding them.
const nameplateDecals = [];
{
  const tl = new THREE.TextureLoader();
  const maskFiles = [...new Set(['decal-mask.png', ...Object.values(W.decals).map((d) => d.mask).filter(Boolean)])];
  const [dTex, ...mTexs] = await Promise.all([tl.loadAsync('assets/decal.jpg'), ...maskFiles.map((f) => tl.loadAsync('assets/' + f))]);
  const masks = Object.fromEntries(maskFiles.map((f, i) => [f, mTexs[i]]));
  const aniso = renderer.capabilities.getMaxAnisotropy();
  dTex.anisotropy = aniso; for (const t of mTexs) t.anisotropy = aniso;
  const vs = `varying vec2 vUv; varying vec2 vG; attribute vec2 grid; void main(){ vUv = uv; vG = grid; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  // uBack: 0 = the still's pixels, 1 = plain dark walnut (the back of a nameplate). The geometry stays opaque either way.
  const fs = `uniform sampler2D map; uniform sampler2D mask; uniform float uBack; varying vec2 vUv; varying vec2 vG;
    void main(){ if (texture2D(mask, vUv).r < 0.5) discard;
      vec3 c = texture2D(map, vUv).rgb;
      if (uBack > 0.0) {
        float g = 0.5 + 0.5 * sin(vG.x * 90.0 + sin(vG.y * 7.0) * 2.5 + sin(vG.x * 23.0) * 1.2);
        vec3 wood = mix(vec3(0.20, 0.11, 0.06), vec3(0.29, 0.17, 0.10), g * 0.7);
        c = mix(c, wood, uBack);
      }
      gl_FragColor = vec4(c, 1.0); }`;
  for (const d of Object.values(W.decals)) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dTex }, mask: { value: masks[d.mask || 'decal-mask.png'] }, uBack: { value: 0 } },
      vertexShader: vs, fragmentShader: fs,
      side: THREE.FrontSide,
    });
    const G = d.grid, g = new THREE.BufferGeometry(), idx = [], gr = [];
    for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const k = j * G + i; idx.push(k, k + G, k + 1, k + 1, k + G, k + G + 1); }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) gr.push(i / (G - 1), j / (G - 1));
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setAttribute('grid', new THREE.Float32BufferAttribute(gr, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.renderOrder = -1; scene.add(m);
    if (d.mode === 'nameplate') nameplateDecals.push({ mat, center: new THREE.Vector3(...d.center), facing: new THREE.Vector3(...d.facing) });
  }
  if (W.lidBack) {
    const lt = await tl.loadAsync('assets/' + W.lidBack.tex);
    lt.colorSpace = THREE.NoColorSpace; lt.anisotropy = aniso;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(W.lidBack.pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(W.lidBack.uv, 2)); g.setIndex(W.lidBack.index);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: lt } }, side: THREE.FrontSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }` });
    const m = new THREE.Mesh(g, mat); m.renderOrder = -1; scene.add(m);
  }
}
const splat = new SplatMesh({ url: 'assets/desk-500k.spz' });
splat.quaternion.set(1, 0, 0, 0); // Marble worlds are y-down / z-forward
scene.add(splat);
const _np = new THREE.Vector3();
function updateNameplates() {
  for (const n of nameplateDecals) {
    const h = _np.subVectors(camera.position, n.center).projectOnPlane(upAxis).normalize();
    const d = h.dot(n.facing);
    n.mat.uniforms.uBack.value = 1 - THREE.MathUtils.smoothstep(d, -0.35, 0.05);
  }
}

const V = (a) => new THREE.Vector3(...a);
const target = V(W.target);
const upAxis = V(W.deskNormal).normalize();
const camUp0 = V(W.front.up).normalize();
const off0 = V(W.front.pos).sub(target);
const R0 = off0.length();
const ref = new THREE.Vector3().copy(off0).projectOnPlane(upAxis).normalize(); // yaw 0 direction
const side = new THREE.Vector3().crossVectors(upAxis, ref).normalize();
const tilt0 = off0.angleTo(upAxis); // angle from the desk normal
const D2R = Math.PI / 180;
const L = { ...W.limits, yawMax: 8, tiltMin: tilt0 / D2R - 2, tiltMax: tilt0 / D2R + 2 };
const state = { yaw: 0, tilt: tilt0, zoom: 1 };
const goal = { ...state };
const clampGoal = () => {
  goal.yaw = Math.max(-L.yawMax * D2R, Math.min(L.yawMax * D2R, goal.yaw));
  goal.tilt = Math.max(L.tiltMin * D2R, Math.min(L.tiltMax * D2R, goal.tilt));
  goal.zoom = Math.max(L.zoomMin, Math.min(L.zoomMax, goal.zoom));
  if (touch) { goal.tilt = tilt0; goal.zoom = 1; }
};
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), qy = new THREE.Quaternion();
function place() {
  const r = R0 * state.zoom;
  tmp.copy(ref).multiplyScalar(Math.sin(state.tilt)).addScaledVector(upAxis, Math.cos(state.tilt));
  qy.setFromAxisAngle(upAxis, state.yaw); tmp.applyQuaternion(qy);
  camera.position.copy(target).addScaledVector(tmp, r);
  // up: the still's up vector carried along the orbit, so the front view matches the still exactly
  const up = tmp2.copy(camUp0).applyAxisAngle(side, state.tilt - tilt0).applyQuaternion(qy);
  camera.up.copy(up);
  camera.lookAt(target);
}
let width, height;
function resize() {
  const { width: w, height: h } = stage.getBoundingClientRect();
  if (!w || !h) return;
  width = w; height = h;
  renderer.setPixelRatio(Math.min(Math.max(1, Math.min(devicePixelRatio, 2, Math.sqrt(4.2e6 / (w * h)))), resolutionLimit));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const hf = W.front.hfov * D2R;
  const vNeeded = 2 * Math.atan(Math.tan(hf / 2) / camera.aspect);
  camera.fov = Math.min(W.front.vfov, vNeeded / D2R); // landscape: cover, like the still
  if (w < h) {
    camera.fov = Math.min(36, vNeeded / D2R);
  }
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(stage);
addEventListener('resize', resize); resize();
function reduceResolution() {
  const current = renderer.getPixelRatio();
  const minimum = Math.min(devicePixelRatio, 0.75, Math.sqrt(4.2e6 / (width * height)));
  const next = Math.max(minimum, current * 0.75);
  if (next >= current - 0.01) return false;
  resolutionLimit = next;
  resize();
  return true;
}

const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const frag = `uniform float uHi; uniform float uAspect; varying vec2 vUv;
void main(){
  vec2 p = vec2(vUv.x * uAspect, vUv.y); vec2 c = vec2(0.5 * uAspect, 0.5);
  float r = 0.06; vec2 h = vec2(0.5 * uAspect, 0.5) - r - 0.02;
  vec2 qq = abs(p - c) - h; float sd = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - r;
  float px = fwidth(sd);
  float line = 1.0 - smoothstep(px * 0.6, px * 2.2, abs(sd));
  float inside = 1.0 - smoothstep(-px, px, sd);
  float glow = (1.0 - smoothstep(0.0, 0.05, sd)) * (1.0 - inside);
  float a = uHi * clamp(0.9 * line + 0.10 * inside + 0.25 * glow, 0.0, 1.0);
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}`;
const objects = {};
for (const [id, o] of Object.entries(W.objects)) {
  const G = o.grid, pts = o.pts;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(G * G * 3), uv = new Float32Array(G * G * 2), idx = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i; pos.set(pts.slice(k * 3, k * 3 + 3), k * 3); uv.set([i / (G - 1), 1 - j / (G - 1)], k * 2);
    if (i < G - 1 && j < G - 1) idx.push(k, k + G, k + 1, k + 1, k + G, k + G + 1);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
    side: THREE.DoubleSide, uniforms: { uHi: { value: 0 }, uAspect: { value: o.aspect } }, extensions: { derivatives: true } });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 10; mesh.userData.id = id; scene.add(mesh);
  const c = g.boundingSphere.center.clone();
  const nrm = V(W.plane.normal).normalize();
  const facing = V(W.front.pos).sub(c).projectOnPlane(V(W.deskNormal).normalize()).normalize();
  objects[id] = { id, mesh, center: c, normal: nrm, facing, hi: 0, want: 0, visible: true, el: nav.querySelector(`[data-id="${id}"]`) };
}
const meshes = Object.values(objects).map((o) => o.mesh);

// Occlusion: a hotspot shows only if its centre faces the camera and the splats don't cover it.
const occRay = new THREE.Raycaster();
const UPRIGHT = new Set(['laptop', 'andrea', 'shishir', 'procore', 'github']);
const visibilityCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
let lastViewChange = 0;
function occlusionCurrent(o) {
  return o.occlusionCamera?.distanceToSquared(camera.position) < 1e-8;
}
function isOccluded(o) {
  if (!splatReady) return false;
  if (occlusionCurrent(o)) return o.occluded;
  const dist = camera.position.distanceTo(o.center);
  occRay.set(camera.position, tmp2.copy(o.center).sub(camera.position).normalize());
  occRay.far = dist;
  const hits = [];
  splat.raycast(occRay, hits);
  o.occluded = hits.some((hit) => hit.distance < dist * 0.9 - 0.02);
  o.occlusionCamera ??= new THREE.Vector3();
  o.occlusionCamera.copy(camera.position);
  return o.occluded;
}
function updateVisibility(now, force) {
  if (force || !visibilityCamera.equals(camera.position)) {
    visibilityCamera.copy(camera.position);
    lastViewChange = now;
  }
  // Cache expensive scans; do at most one per frame after orbit settles.
  let canRaycast = splatReady && !drag && now - lastViewChange >= 120;
  for (const o of Object.values(objects)) {
    const toCam = tmp.subVectors(camera.position, o.center);
    const dist = toCam.length(); toCam.divideScalar(dist);
    let vis = toCam.dot(o.normal) > 0.12; // seen from above, not edge-on or from under the desk
    if (vis && UPRIGHT.has(o.id)) { const h = tmp2.copy(toCam).projectOnPlane(upAxis); if (h.lengthSq() > 1e-6 && h.normalize().dot(o.facing) < -0.25) vis = false; }
    if (vis && splatReady) {
      if (occlusionCurrent(o)) vis = !o.occluded;
      else if (canRaycast) { vis = !isOccluded(o); canRaycast = false; }
    }
    if (o.visible !== vis) dirty = true;
    o.visible = vis; o.mesh.visible = vis || o.hi > 0.01;
    if (!vis && hover === o) setHover(null);
  }
}

const pointer = new THREE.Vector2(), pick = new THREE.Raycaster();
let hover = null, drag = null, splatReady = false;
function pickAt(x, y) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  pick.setFromCamera(pointer, camera);
  const hits = pick.intersectObjects(meshes.filter((m) => objects[m.userData.id].visible), false);
  if (!hits.length) return null;
  // smallest patch wins when they overlap (stickers on the laptop)
  hits.sort((a, b) => a.object.geometry.boundingSphere.radius - b.object.geometry.boundingSphere.radius);
  // A tap/hover must still respect exact occlusion while background checks wait.
  for (const hit of hits) {
    const o = objects[hit.object.userData.id];
    if (!isOccluded(o)) return o;
  }
  return null;
}
function setHover(o, x, y) {
  if (hover && hover !== o) hover.want = 0;
  hover = o;
  canvas.classList.toggle('is-over', !!o);
  if (o) { o.want = 1; tip.textContent = LABELS[o.id]; tip.classList.add('is-on'); if (x != null) placeTip(x, y); }
  else tip.classList.remove('is-on');
}
function placeTip(x, y) { tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 18)}px)`; }
function screenOf(o) {
  const p = o.center.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, visible: o.visible };
}
function tipAtObject(o) {
  const { x, y } = screenOf(o);
  tip.style.transform = `translate(calc(${Math.round(x)}px - 50%), ${Math.round(y)}px)`;
}
function activate(o) {
  const el = o.el; if (!el) return;
  if (el.dataset.dialog) document.getElementById('dialog-' + el.dataset.dialog).showModal();
  else el.click();
}
const pointers = new Set();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); pointers.add(e.pointerId);
  drag = pointers.size === 1 ? { x: e.clientX, y: e.clientY, moved: 0 } : null;
});
canvas.addEventListener('pointermove', (e) => {
  if (drag && pointers.size === 1) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 6) {
      canvas.classList.add('is-dragging'); setHover(null);
      const k = 3.2 / Math.max(width, 600);
      goal.yaw -= dx * k;
      if (e.pointerType !== 'touch') goal.tilt += dy * k * 0.7;
      clampGoal();
    }
    return;
  }
  if (e.pointerType === 'mouse') { const o = pickAt(e.clientX, e.clientY); if (o !== hover) setHover(o, e.clientX, e.clientY); else if (o) placeTip(e.clientX, e.clientY); }
});
const end = (e) => {
  pointers.delete(e.pointerId);
  if (!drag) return;
  const wasDrag = drag.moved > 6; canvas.classList.remove('is-dragging');
  if (pointers.size === 0) {
    if (!wasDrag && e.type === 'pointerup') {
      const o = pickAt(e.clientX, e.clientY);
      if (o) {
        if (e.pointerType !== 'mouse') { setHover(o); tipAtObject(o); }
        activate(o);
      } else setHover(null);
    }
    drag = null;
  }
};
canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) setHover(null); });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); goal.zoom *= Math.exp(e.deltaY * 0.0012); clampGoal(); }, { passive: false });
addEventListener('keydown', (e) => {
  const s = 0.12;
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'ArrowLeft') goal.yaw += s; else if (e.key === 'ArrowRight') goal.yaw -= s;
  else if (e.key === 'ArrowUp') goal.tilt -= s * 0.6; else if (e.key === 'ArrowDown') goal.tilt += s * 0.6;
  else if (e.key === 'Home' || e.key === '0') { goal.yaw = 0; goal.tilt = tilt0; goal.zoom = 1; }
  else return;
  clampGoal();
});
for (const o of Object.values(objects)) if (o.el) {
  o.el.addEventListener('focus', () => { setHover(o); tipAtObject(o); });
  o.el.addEventListener('blur', () => { if (hover === o) setHover(null); });
  if (o.el.dataset.dialog) o.el.addEventListener('click', (e) => { e.preventDefault(); activate(o); });
}
for (const d of document.querySelectorAll('dialog')) {
  let backdropPress = false;
  d.addEventListener('pointerdown', (e) => { backdropPress = e.target === d; });
  d.addEventListener('click', (e) => {
    if (e.target === d && backdropPress) d.close();
    backdropPress = false;
  });
}

let last = performance.now();
function frame(now) {
  try {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = 1 - Math.exp(-dt * 9);
    for (const key of ['yaw', 'tilt', 'zoom']) {
      const next = Math.abs(goal[key] - state[key]) < 1e-7 ? goal[key] : state[key] + (goal[key] - state[key]) * k;
      if (next !== state[key]) { state[key] = next; dirty = true; }
    }
    if (dirty) { place(); updateNameplates(); }
    updateVisibility(now);
    for (const o of Object.values(objects)) {
      const target = o.want && o.visible ? 1 : 0;
      const next = Math.abs(target - o.hi) < 0.001 ? target : o.hi + (target - o.hi) * (1 - Math.exp(-dt * 14));
      if (next !== o.hi) { o.hi = next; o.mesh.material.uniforms.uHi.value = next; dirty = true; }
      o.mesh.visible = o.visible || o.hi > 0.01;
    }
    if (hover && document.activeElement === hover.el) tipAtObject(hover);
    if (dirty) {
      dirty = false;
      renderer.render(scene, camera);
    }
  } catch (error) {
    renderer.setAnimationLoop(null);
    onError(error);
  }
}
place();
await splat.initialized;
splatReady = true; updateVisibility(performance.now(), true);
requestAnimationFrame(() => requestAnimationFrame(() => { canvas.classList.add('is-ready'); document.documentElement.classList.add('is-ready'); }));
renderer.setAnimationLoop(frame);

// Diagnostics used by the headed-browser regression harness.
window.__desk = {
  state, goal, objects, camera, splat,
  ready: () => splatReady,
  screenOf: (id) => screenOf(objects[id]),
};
return { reduceResolution, pixelRatio: () => renderer.getPixelRatio() };
}
