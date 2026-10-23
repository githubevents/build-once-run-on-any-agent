import { MONO, OCTOCAT, SANS, rng, texture } from './textures.js';

const HEAD = '#569cd6';
const TEXT = '#cccccc';
const LIST = '#6796e6';
const LINK = '#ce9178';
const URL = '#6a9955';

/** README.md as it opens in VS Code's dark theme. Each line is a list of [text, colour, bold]. */
export const README_LINES = [
  [['# Build once, run on any agent: a practical guide to agent skills', HEAD, true]],
  [],
  [['GitHub Universe 2026 · BLD17078', TEXT]],
  [],
  [['## Speakers', HEAD, true]],
  [],
  [['- ', LIST], ['Andrea Griffiths — Senior Developer Advocate, GitHub', TEXT]],
  [['- ', LIST], ['Shishir Tewari — Senior Manager, Data Engineering, Procore', TEXT]],
  [],
  [['## Demos', HEAD, true]],
  [],
  [['- ', LIST], ['[proof-agent]', LINK], ['(demos/proof-agent/)', URL], [" — Andrea's independent verifier skill and GitHub Action.", TEXT]],
  [['- ', LIST], ['[proof-review]', LINK], ['(demos/proof-review/)', URL], [' — verify bugfix PRs under production-shaped load.', TEXT]],
  [['- ', LIST], ['[dataforge]', LINK], ['(demos/dataforge/)', URL], [" — Shishir's four agent skills, from manifest to pull request.", TEXT]],
  [],
  [['## Repository layout', HEAD, true]],
];
export const EXPLORER = ['assets', 'demos', 'resources', 'slides', 'README.md'];

/** Wrap a token line at spaces, VS Code style, keeping per-character colour. */
function wrap(tokens, maxChars) {
  const chars = tokens.flatMap(([text, color, bold]) => [...text].map((c) => ({ c, color, bold })));
  const rows = [];
  let start = 0;
  let indent = 0;
  while (start < chars.length || rows.length === 0) {
    const room = maxChars - indent;
    let end = Math.min(chars.length, start + room);
    if (end < chars.length) {
      let space = end;
      while (space > start && chars[space].c !== ' ') space--;
      if (space > start) end = space + 1;
    }
    rows.push({ indent, chars: chars.slice(start, end) });
    start = end;
    indent = 2;
    if (!chars.length) break;
  }
  return rows;
}

export function laptopScreenTexture() {
  return texture(2560, 1600, (g, w, h) => {
    const TITLE = 70, ACT = 100, SIDE = 560, TABS = 86, CRUMB = 60, STATUS = 56;
    g.fillStyle = '#1f1f1f';
    g.fillRect(0, 0, w, h);

    g.fillStyle = '#181818';
    g.fillRect(0, 0, w, TITLE);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(42 + i * 42, TITLE / 2, 13, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = '#9d9d9d';
    g.font = `400 30px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('README.md — build-once-run-on-any-agent', w / 2, TITLE / 2);
    g.textAlign = 'left';

    g.fillStyle = '#181818';
    g.fillRect(0, TITLE, ACT + SIDE, h - TITLE - STATUS);
    g.fillStyle = '#2b2b2b';
    g.fillRect(0, TITLE - 2, w, 2);
    g.fillRect(ACT + SIDE - 2, TITLE, 2, h - TITLE - STATUS);
    g.strokeStyle = '#858585';
    g.lineWidth = 4;
    g.strokeRect(34, TITLE + 34, 26, 34);
    g.strokeRect(42, TITLE + 26, 26, 34);
    g.beginPath();
    g.arc(48, TITLE + 150, 15, 0, Math.PI * 2);
    g.moveTo(59, TITLE + 161);
    g.lineTo(70, TITLE + 172);
    g.stroke();
    g.beginPath();
    g.arc(42, TITLE + 236, 7, 0, Math.PI * 2);
    g.moveTo(42, TITLE + 243);
    g.lineTo(42, TITLE + 282);
    g.arc(42, TITLE + 289, 7, -Math.PI / 2, Math.PI * 1.5);
    g.moveTo(64, TITLE + 243);
    g.quadraticCurveTo(64, TITLE + 266, 42, TITLE + 272);
    g.stroke();
    for (const [x, y] of [[32, 336], [52, 336], [32, 356], [56, 352]]) g.strokeRect(x, TITLE + y, 14, 14);
    g.fillStyle = '#e7e7e7';
    g.fillRect(0, TITLE + 20, 4, 64);

    g.fillStyle = '#bbbbbb';
    g.font = `500 26px ${SANS}`;
    g.fillText('EXPLORER', ACT + 36, TITLE + 50);
    g.fillStyle = '#cccccc';
    g.font = `600 28px ${SANS}`;
    g.fillText('⌄  BUILD-ONCE-RUN-ON-ANY-AGENT', ACT + 22, TITLE + 120);
    EXPLORER.forEach((name, i) => {
      const y = TITLE + 190 + i * 68;
      const file = name.includes('.');
      if (file) {
        g.fillStyle = '#37373d';
        g.fillRect(ACT, y - 34, SIDE - 2, 68);
        g.fillStyle = '#0078d4';
        g.fillRect(ACT, y - 34, 3, 68);
        g.fillStyle = '#519aba';
        g.font = `600 24px ${MONO}`;
        g.fillText('M↓', ACT + 46, y + 2);
      } else {
        g.fillStyle = '#c5c5c5';
        g.font = `400 34px ${SANS}`;
        g.fillText('›', ACT + 52, y);
      }
      g.fillStyle = file ? '#ffffff' : '#cccccc';
      g.font = `400 36px ${SANS}`;
      g.fillText(name, ACT + 96, y + 2);
    });

    const x0 = ACT + SIDE;
    g.fillStyle = '#181818';
    g.fillRect(x0, TITLE, w - x0, TABS);
    g.fillStyle = '#1f1f1f';
    g.fillRect(x0, TITLE, 380, TABS);
    g.fillStyle = '#0078d4';
    g.fillRect(x0, TITLE, 380, 3);
    g.fillStyle = '#519aba';
    g.font = `600 24px ${MONO}`;
    g.fillText('M↓', x0 + 30, TITLE + TABS / 2 + 2);
    g.fillStyle = '#ffffff';
    g.font = `400 34px ${SANS}`;
    g.fillText('README.md', x0 + 84, TITLE + TABS / 2 + 2);
    g.fillStyle = '#9d9d9d';
    g.fillText('×', x0 + 334, TITLE + TABS / 2 + 2);
    g.fillStyle = '#a9a9a9';
    g.font = `400 28px ${SANS}`;
    g.fillText('README.md  ›  # Build once, run on any agent: a practical guide to agent skills', x0 + 40, TITLE + TABS + CRUMB / 2);

    const size = 46;
    const lineH = 68;
    g.font = `400 ${size}px ${MONO}`;
    const cw = g.measureText('M').width;
    const textX = x0 + 160;
    const maxChars = Math.floor((w - textX - 50) / cw);
    let y = TITLE + TABS + CRUMB + 50;
    README_LINES.forEach((tokens, i) => {
      wrap(tokens, maxChars).forEach((row, r) => {
        if (y > h - STATUS - 20) return;
        if (r === 0) {
          g.fillStyle = i === 2 ? '#cccccc' : '#6e7681';
          g.font = `400 ${size}px ${MONO}`;
          g.textAlign = 'right';
          g.fillText(String(i + 1), x0 + 112, y);
          g.textAlign = 'left';
        }
        row.chars.forEach((ch, k) => {
          g.fillStyle = ch.color;
          g.font = `${ch.bold ? 700 : 400} ${size}px ${MONO}`;
          g.fillText(ch.c, textX + (row.indent + k) * cw, y);
        });
        y += lineH;
      });
    });
    g.fillStyle = '#aeafad';
    g.fillRect(textX + 31 * cw, TITLE + TABS + CRUMB + 50 + lineH * 3 - size * 0.62, 4, size * 1.2);

    g.fillStyle = '#0078d4';
    g.fillRect(0, h - STATUS, w, STATUS);
    g.fillStyle = '#ffffff';
    g.font = `400 26px ${SANS}`;
    g.fillText('⎇ main', 36, h - STATUS / 2);
    g.fillText('⊗ 0  ⚠ 0', 190, h - STATUS / 2);
    g.textAlign = 'right';
    g.fillText('Ln 3, Col 32    Spaces: 2    UTF-8    LF    Markdown', w - 40, h - STATUS / 2);
    g.textAlign = 'left';
  });
}

const KEY_ROWS = [
  [['esc', 1.4], ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map((k) => [k, 1]), ['', 1]],
  [['`', 1], ...'1234567890'.split('').map((k) => [k, 1]), ['-', 1], ['=', 1], ['delete', 1.5]],
  [['tab', 1.5], ...'QWERTYUIOP'.split('').map((k) => [k, 1]), ['[', 1], [']', 1], ['\\', 1]],
  [['caps', 1.8], ...'ASDFGHJKL'.split('').map((k) => [k, 1]), [';', 1], ["'", 1], ['return', 1.7]],
  [['shift', 2.3], ...'ZXCVBNM'.split('').map((k) => [k, 1]), [',', 1], ['.', 1], ['/', 1], ['shift', 2.2]],
  [['fn', 1], ['ctrl', 1], ['opt', 1], ['cmd', 1.25], ['', 5], ['cmd', 1.25], ['opt', 1], ['◀', 1], ['▲▼', 1], ['▶', 1]],
];

/** Top deck of the laptop base: keyboard well and trackpad, in deck centimetres. */
export const DECK = { w: 29.8, d: 20.9, keys: { x: 1.6, y: 1.0, w: 26.6, h: 9.8 }, pad: { w: 12.2, h: 7.0, y: 11.8 } };

export function keyboardTexture() {
  const W = 2048;
  const H = Math.round((W * DECK.d) / DECK.w);
  const s = W / DECK.w;
  return texture(W, H, (g) => {
    const fill = g.createLinearGradient(0, 0, 0, H);
    fill.addColorStop(0, '#a9acb2');
    fill.addColorStop(1, '#989ba1');
    g.fillStyle = fill;
    g.fillRect(0, 0, W, H);
    const random = rng(21);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${random() < 0.5 ? '255,255,255' : '40,40,48'},${0.02 + random() * 0.03})`;
      g.fillRect(0, random() * H, W, 1);
    }
    const k = DECK.keys;
    g.fillStyle = '#4a4c52';
    g.beginPath();
    g.roundRect(k.x * s, k.y * s, k.w * s, k.h * s, 18);
    g.fill();
    const pad = 0.22 * s;
    const rowH = (k.h * s - pad * 2) / 5.55;
    let y = k.y * s + pad;
    KEY_ROWS.forEach((row, r) => {
      const hgt = r === 0 ? rowH * 0.55 : rowH;
      const units = row.reduce((sum, [, u]) => sum + u, 0);
      const unit = (k.w * s - pad * 2) / units;
      let x = k.x * s + pad;
      for (const [label, u] of row) {
        const kw = u * unit;
        g.fillStyle = '#16171a';
        g.beginPath();
        g.roundRect(x + 4, y + 4, kw - 8, hgt - 8, 9);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(x + 10, y + 6, kw - 20, 2);
        if (label) {
          g.fillStyle = '#d4d6db';
          const small = label.length > 1;
          g.font = `500 ${small ? 20 : 30}px ${SANS}`;
          g.textAlign = small && u > 1.1 ? 'left' : 'center';
          g.textBaseline = 'middle';
          g.fillText(label, small && u > 1.1 ? x + 18 : x + kw / 2, small && u > 1.1 ? y + hgt - 24 : y + hgt / 2);
        }
        x += kw;
      }
      y += hgt;
    });
    const p = DECK.pad;
    const px = ((DECK.w - p.w) / 2) * s;
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.roundRect(px - 2, p.y * s - 2, p.w * s + 4, p.h * s + 4, 26);
    g.fill();
    const pf = g.createLinearGradient(0, p.y * s, 0, (p.y + p.h) * s);
    pf.addColorStop(0, '#a3a6ac');
    pf.addColorStop(1, '#9fa2a8');
    g.fillStyle = pf;
    g.beginPath();
    g.roundRect(px, p.y * s, p.w * s, p.h * s, 24);
    g.fill();
    g.fillStyle = '#7d8086';
    g.beginPath();
    g.roundRect(W / 2 - 1.6 * s, H - 9, 3.2 * s, 9, 4);
    g.fill();
  });
}

function tile(g, x, y, size, i) {
  const designs = [
    () => { grad(g, x, y, size, '#0d1117', '#1f6feb'); words(g, x, y, size, ['Universe', '2026'], '#ffffff'); },
    () => { grad(g, x, y, size, '#ff7eb6', '#7c3aed'); blobs(g, x, y, size, i); },
    () => { g.fillStyle = '#0d1117'; g.fillRect(x, y, size, size); contributions(g, x, y, size, i); },
    () => { grad(g, x, y, size, '#ffd33d', '#fb8500'); words(g, x, y, size, ['ship', 'it'], '#1f2328'); },
    () => { g.fillStyle = '#f6f8fa'; g.fillRect(x, y, size, size); mark(g, x, y, size, '#1f2328'); },
    () => { grad(g, x, y, size, '#2da44e', '#116329'); words(g, x, y, size, ['agent', 'skills'], '#ffffff'); },
    () => { g.fillStyle = '#161b22'; g.fillRect(x, y, size, size); code(g, x, y, size); },
    () => { grad(g, x, y, size, '#fd8c73', '#bf3989'); mark(g, x, y, size, 'rgba(255,255,255,0.92)'); },
    () => { grad(g, x, y, size, '#8250df', '#0969da'); words(g, x, y, size, ['Copilot', 'CLI'], '#ffffff'); },
  ];
  designs[i % designs.length]();
}

function grad(g, x, y, size, a, b) {
  const fill = g.createLinearGradient(x, y, x + size, y + size);
  fill.addColorStop(0, a);
  fill.addColorStop(1, b);
  g.fillStyle = fill;
  g.fillRect(x, y, size, size);
}

function words(g, x, y, size, lines, color) {
  g.fillStyle = color;
  g.font = `600 ${size * 0.17}px ${SANS}`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  lines.forEach((line, k) => g.fillText(line, x + size * 0.1, y + size * (0.62 + k * 0.2)));
}

function mark(g, x, y, size, color) {
  g.save();
  g.translate(x + size * 0.25, y + size * 0.25);
  g.scale((size * 0.5) / 16, (size * 0.5) / 16);
  g.fillStyle = color;
  g.fill(OCTOCAT);
  g.restore();
}

function blobs(g, x, y, size, seed) {
  const random = rng(seed + 40);
  for (let k = 0; k < 5; k++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + random() * 0.35})`;
    g.beginPath();
    g.arc(x + random() * size, y + random() * size, size * (0.08 + random() * 0.2), 0, Math.PI * 2);
    g.fill();
  }
}

function contributions(g, x, y, size, seed) {
  const random = rng(seed + 7);
  const greens = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
  const cell = size / 8;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      g.fillStyle = greens[Math.floor(random() * greens.length)];
      g.beginPath();
      g.roundRect(x + cell * (c + 0.55), y + cell * (r + 0.55), cell * 0.8, cell * 0.8, 4);
      g.fill();
    }
  }
}

function code(g, x, y, size) {
  const colors = ['#ff7b72', '#d2a8ff', '#79c0ff', '#a5d6ff', '#7ee787', '#ffa657'];
  for (let r = 0; r < 7; r++) {
    let cx = x + size * (0.1 + (r % 3) * 0.06);
    for (let k = 0; k < 3; k++) {
      const len = size * (0.1 + ((r * 3 + k) % 5) * 0.05);
      g.fillStyle = colors[(r + k) % colors.length];
      g.beginPath();
      g.roundRect(cx, y + size * (0.12 + r * 0.11), len, size * 0.05, 6);
      g.fill();
      cx += len + size * 0.04;
    }
  }
}

export function phoneTexture() {
  return texture(1080, 2316, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#000000';
    g.beginPath();
    g.roundRect(w / 2 - 170, 36, 340, 96, 48);
    g.fill();
    g.fillStyle = '#111111';
    g.font = `600 46px ${SANS}`;
    g.textBaseline = 'middle';
    g.fillText('9:41', 96, 86);
    g.fillRect(w - 200, 72, 70, 30);
    g.fillRect(w - 124, 76, 6, 22);

    g.font = `600 64px ${SANS}`;
    g.fillText('‹', 50, 230);
    g.fillText('github', 130, 228);
    g.fillStyle = '#0095f6';
    g.beginPath();
    g.arc(370, 228, 22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(360, 228);
    g.lineTo(368, 237);
    g.lineTo(382, 219);
    g.stroke();

    g.fillStyle = '#1f2328';
    g.beginPath();
    g.arc(170, 430, 110, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(110, 370);
    g.scale(120 / 16, 120 / 16);
    g.fillStyle = '#ffffff';
    g.fill(OCTOCAT);
    g.restore();
    g.fillStyle = '#111111';
    g.textAlign = 'center';
    [['2,148', 'posts'], ['4.6M', 'followers'], ['12', 'following']].forEach(([n, label], k) => {
      const x = 450 + k * 220;
      g.font = `600 52px ${SANS}`;
      g.fillText(n, x, 405);
      g.font = `400 38px ${SANS}`;
      g.fillText(label, x, 465);
    });
    g.textAlign = 'left';
    g.font = `600 42px ${SANS}`;
    g.fillText('GitHub', 60, 610);
    g.font = `400 40px ${SANS}`;
    g.fillStyle = '#333333';
    g.fillText('How people build software. Universe 2026 ✦', 60, 665);
    g.fillStyle = '#efefef';
    for (const [x, label] of [[60, 'Following'], [560, 'Message']]) {
      g.fillStyle = '#efefef';
      g.beginPath();
      g.roundRect(x, 720, 460, 90, 20);
      g.fill();
      g.fillStyle = '#111111';
      g.font = `600 40px ${SANS}`;
      g.textAlign = 'center';
      g.fillText(label, x + 230, 766);
      g.textAlign = 'left';
    }
    g.fillStyle = '#111111';
    g.fillRect(0, 900, w / 3, 5);
    g.fillStyle = '#dbdbdb';
    g.fillRect(0, 903, w, 2);
    const size = (w - 8) / 3;
    for (let i = 0; i < 12; i++) {
      const x = (i % 3) * (size + 4);
      const y = 910 + Math.floor(i / 3) * (size + 4);
      if (y > h - 200) break;
      tile(g, x, y, size, i);
    }
    g.fillStyle = '#ffffff';
    g.fillRect(0, h - 170, w, 170);
    g.fillStyle = '#dbdbdb';
    g.fillRect(0, h - 170, w, 2);
    g.strokeStyle = '#111111';
    g.lineWidth = 7;
    for (let k = 0; k < 5; k++) {
      const x = 108 + k * 216;
      g.beginPath();
      g.roundRect(x - 26, h - 120, 52, 52, k === 4 ? 26 : 12);
      g.stroke();
    }
    g.fillStyle = '#111111';
    g.beginPath();
    g.roundRect(w / 2 - 150, h - 34, 300, 12, 6);
    g.fill();
  });
}
