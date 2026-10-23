import * as THREE from 'three';

export const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
const HAND = '"Bradley Hand", "Segoe Print", "Marker Felt", "Comic Sans MS", cursive';
export const OCTOCAT = new Path2D('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z');

let anisotropy = 8;
export function setAnisotropy(value) { anisotropy = value; }

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function texture(width, height, draw, { wrap = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  draw(g, width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = anisotropy;
  if (wrap) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

function octocat(g, cx, cy, size, color) {
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(size / 16, size / 16);
  g.fillStyle = color;
  g.fill(OCTOCAT);
  g.restore();
}

/** Tileable planks with grain that runs along u, like makeDesk() in octolamp-assemble. */
export function woodTexture({ size = 2048, planks = 6, tone = [196, 146, 98], spread = 22, seed = 7, joints = true } = {}) {
  return texture(size, size, (g) => {
    const random = rng(seed);
    const h = size / planks;
    for (let i = 0; i < planks; i++) {
      const y0 = i * h;
      const shift = (random() - 0.5) * spread;
      const [r, gr, b] = tone.map((c) => Math.round(c + shift));
      const fill = g.createLinearGradient(0, y0, 0, y0 + h);
      fill.addColorStop(0, `rgb(${r + 6},${gr + 4},${b + 2})`);
      fill.addColorStop(1, `rgb(${r - 8},${gr - 8},${b - 6})`);
      g.fillStyle = fill;
      g.fillRect(0, y0, size, h);
      for (let k = 0; k < 170; k++) {
        const y = y0 + random() * h;
        const dark = random() < 0.7;
        g.strokeStyle = dark
          ? `rgba(${70 + random() * 40},${38 + random() * 22},${16 + random() * 12},${0.05 + random() * 0.13})`
          : `rgba(255,226,180,${0.04 + random() * 0.07})`;
        g.lineWidth = 0.8 + random() * 2.6;
        const f1 = (2 * Math.PI * (1 + Math.floor(random() * 3))) / size;
        const f2 = (2 * Math.PI * (4 + Math.floor(random() * 5))) / size;
        const p1 = random() * 6.3;
        const p2 = random() * 6.3;
        const a1 = 2 + random() * 7;
        g.beginPath();
        for (let x = 0; x <= size; x += 16) {
          const yy = y + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * 1.4;
          if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(40,22,10,0.45)';
      g.fillRect(0, y0, size, 3);
      g.fillStyle = 'rgba(255,230,190,0.18)';
      g.fillRect(0, y0 + 3, size, 2);
      if (joints) {
        const x = 200 + random() * (size - 400);
        g.fillStyle = 'rgba(40,22,10,0.4)';
        g.fillRect(x, y0, 3, h);
      }
    }
  }, { wrap: true });
}

export function corkTexture() {
  return texture(512, 512, (g, w, h) => {
    const random = rng(3);
    g.fillStyle = '#b88a58';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = random();
      g.fillStyle = v < 0.5 ? `rgba(90,55,25,${0.15 + random() * 0.35})` : `rgba(235,200,150,${0.12 + random() * 0.3})`;
      g.beginPath();
      g.arc(random() * w, random() * h, 0.6 + random() * 2.4, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function soilTexture() {
  return texture(256, 256, (g, w, h) => {
    const random = rng(11);
    g.fillStyle = '#3a2618';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${random() < 0.5 ? '20,12,6' : '110,80,55'},${0.3 + random() * 0.5})`;
      g.fillRect(random() * w, random() * h, 1 + random() * 3, 1 + random() * 3);
    }
  });
}

export function leafTexture({ base = '#2f7d32', edge = '#1f5a24', vein = '#9ccf7a', variegated = false } = {}) {
  return texture(256, 1024, (g, w, h) => {
    const random = rng(variegated ? 5 : 9);
    const fill = g.createLinearGradient(0, 0, w, 0);
    fill.addColorStop(0, edge);
    fill.addColorStop(0.5, base);
    fill.addColorStop(1, edge);
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    if (variegated) {
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(232,226,140,${0.18 + random() * 0.3})`;
        g.lineWidth = 3 + random() * 9;
        const side = random() < 0.5 ? -1 : 1;
        const y = random() * h;
        g.beginPath();
        g.moveTo(w / 2, y);
        g.quadraticCurveTo(w / 2 + side * w * 0.25, y + 60, w / 2 + side * w * (0.3 + random() * 0.2), y + 140);
        g.stroke();
      }
    }
    g.strokeStyle = vein;
    g.globalAlpha = 0.55;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
    g.lineWidth = 2.5;
    g.globalAlpha = 0.3;
    for (let y = 60; y < h - 60; y += 70) {
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(w / 2, y);
        g.quadraticCurveTo(w / 2 + side * w * 0.22, y + 50, w / 2 + side * w * 0.46, y + 120);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
}

export function pageTexture() {
  return texture(1536, 2048, (g, w, h) => {
    g.fillStyle = '#f7f2e4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,140,200,0.35)';
    g.lineWidth = 3;
    for (let y = 230; y < h - 40; y += 74) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(220,80,80,0.45)';
    g.beginPath();
    g.moveTo(230, 0);
    g.lineTo(230, h);
    g.stroke();
    g.fillStyle = '#5b5348';
    for (let y = 70; y < h; y += 133) {
      g.beginPath();
      g.arc(62, y, 20, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function stickyTexture(color, text) {
  return texture(768, 768, (g, w, h) => {
    const fill = g.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, color);
    fill.addColorStop(0.12, color);
    fill.addColorStop(1, shade(color, -0.08));
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(0, 0, w, 90);
    if (!text) return;
    g.save();
    g.translate(w / 2, h * 0.56);
    g.rotate(-0.06);
    g.fillStyle = '#26262b';
    g.font = `400 190px ${HAND}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 0, 0);
    g.restore();
  });
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

export function paperTexture() {
  return texture(2048, 1424, (g, w, h) => {
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2328';
    g.font = `600 236px ${SANS}`;
    g.textBaseline = 'alphabetic';
    g.fillText('the code', 150, 640);
    g.fillStyle = '#2da44e';
    g.fillRect(156, 730, 260, 14);
    g.fillStyle = '#57606a';
    g.font = `500 82px ${MONO}`;
    g.fillText('build-once-run-on-any-agent', 150, 900);
    g.strokeStyle = '#1a7f37';
    g.lineWidth = 34;
    g.beginPath();
    g.arc(1690, 520, 170, 0, Math.PI * 2);
    g.stroke();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 40;
    g.beginPath();
    g.moveTo(1605, 530);
    g.lineTo(1665, 595);
    g.lineTo(1785, 450);
    g.stroke();
  });
}

export function plateTexture(name) {
  return texture(1536, 320, (g, w, h) => {
    const fill = g.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, '#e9cf8c');
    fill.addColorStop(0.45, '#cfa95c');
    fill.addColorStop(1, '#b89040');
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    const random = rng(name.length);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${random() < 0.5 ? '255,245,210' : '120,90,30'},${0.04 + random() * 0.06})`;
      g.fillRect(0, random() * h, w, 1 + random() * 2);
    }
    g.strokeStyle = 'rgba(90,64,20,0.55)';
    g.lineWidth = 5;
    g.strokeRect(22, 22, w - 44, h - 44);
    g.font = `500 150px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,240,200,0.7)';
    g.fillText(name, w / 2 + 2, h / 2 + 10);
    g.fillStyle = '#2e1f0c';
    g.fillText(name, w / 2, h / 2 + 7);
  });
}

export function githubStickerTexture() {
  return texture(1024, 1024, (g, w) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, w);
    g.strokeStyle = '#d0d7de';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
    g.stroke();
    octocat(g, w / 2, w / 2, w * 0.66, '#1f2328');
  });
}

export function procoreStickerTexture() {
  return texture(1280, 400, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 16, h / 2 - 8);
    g.fill();
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 16;
    g.beginPath();
    g.roundRect(40, 40, w - 80, h - 80, h / 2 - 40);
    g.stroke();
    g.fillStyle = '#111111';
    g.font = `600 176px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PROCORE', w / 2, h / 2 + 8);
  });
}
