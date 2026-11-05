// Shredder - controls, type rendering, preview and export. The damage itself is in fx.mjs.
import { TREATMENTS, apply, rng } from './fx.mjs';

const $ = id => document.getElementById(id);
const KEY = 'ep-shredder-v1', PREVIEW_U = 150, MAX_PIXELS = 36e6;
const out = $('out'), paper = $('paper');

// ---- state (remembered in this browser) -------------------------------------------
let state = { text: 'THIS WAS\nTOMORROW', font: 'Archivo Black|400', custom: '', align: 'center', lh: 92, ls: 0,
  ink: '#111111', ink2: '#e8402c', paper: '#f2efe8', transparent: false, scale: 3, seed: 1,
  steps: [{ type: 'photocopy', values: {} }] };
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.steps)) state = { ...state, ...s }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
let image = null;   // an uploaded image, kept in memory only

// ---- source: text or image as an ink mask --------------------------------------------
function fontSpec(u) {
  if (state.font === 'custom') return `${u}px "${(state.custom || 'Helvetica').replace(/"/g, '')}", Helvetica, Arial, sans-serif`;
  const [family, weight] = state.font.split('|');
  return `${weight} ${u}px ${family.includes(',') ? family : '"' + family + '"'}, Helvetica, Arial, sans-serif`;
}
function drawText(u) {
  const lines = (state.text || ' ').split('\n'), c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = fontSpec(u);
  const ls = state.ls / 100 * u, canLS = 'letterSpacing' in x;
  const width = line => canLS ? (x.letterSpacing = ls + 'px', x.measureText(line).width) : x.measureText(line).width + ls * Math.max(0, [...line].length - 1);
  const lh = state.lh / 100 * u, pad = Math.round(u * 0.35);
  const widths = lines.map(width), w = Math.ceil(Math.max(...widths, u) + pad * 2), h = Math.ceil(lh * (lines.length - 1) + u * 1.25 + pad * 2);
  c.width = w; c.height = h;
  x.font = fontSpec(u); if (canLS) x.letterSpacing = ls + 'px';
  x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    const lw = widths[i], left = state.align === 'left' ? pad : state.align === 'right' ? w - pad - lw : (w - lw) / 2;
    const y = pad + u * 0.95 + i * lh;
    if (canLS || !ls) x.fillText(line, left, y);
    else { let cx = left; for (const ch of line) { x.fillText(ch, cx, y); cx += x.measureText(ch).width + ls; } }
  });
  return toMask(x, w, h, 'alpha');
}
function drawImage(u) {
  const box = u * 6, k = Math.min(box / image.width, box / image.height), pad = Math.round(u * 0.35);
  const iw = Math.max(1, Math.round(image.width * k)), ih = Math.max(1, Math.round(image.height * k));
  const c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = iw + pad * 2; c.height = ih + pad * 2; x.drawImage(image, pad, pad, iw, ih);
  return toMask(x, c.width, c.height, image.hasAlpha ? 'alpha' : 'dark');
}
function toMask(x, w, h, mode) {
  const d = x.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) {
    const a = d[i * 4 + 3] / 255;
    m[i] = mode === 'alpha' ? a : a * (1 - (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255);
  }
  return { m, w, h };
}

// ---- render ------------------------------------------------------------------------
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function render(u, canvas, { transparent = false } = {}) {
  const src = image ? drawImage(u) : drawText(u);
  const layers = apply(src.m, src.w, src.h, state.steps, state.seed, u);
  canvas.width = src.w; canvas.height = src.h;
  const x = canvas.getContext('2d'), img = x.createImageData(src.w, src.h), d = img.data;
  const bg = hex(state.paper), inks = { 1: hex(state.ink), 2: hex(state.ink2) };
  for (let i = 0; i < src.m.length; i++) {
    let r = bg[0], g = bg[1], b = bg[2], a = transparent ? 0 : 1;
    for (const L of layers) {   // paint each ink layer over what is there
      const t = L.mask[i]; if (t <= 0) continue;
      const c = inks[L.ink] || inks[1], na = t + a * (1 - t);
      r = (c[0] * t + r * a * (1 - t)) / na; g = (c[1] * t + g * a * (1 - t)) / na; b = (c[2] * t + b * a * (1 - t)) / na; a = na;
    }
    const j = i * 4; d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  return src;
}
let timer, drawing = false, again = false;
function schedule() { clearTimeout(timer); paper.classList.add('busy'); timer = setTimeout(draw, 60); }
async function draw() {
  if (drawing) { again = true; return; }
  drawing = true;
  try {
    await document.fonts.load(fontSpec(40), state.text || 'A').catch(() => {});
    render(PREVIEW_U, out, { transparent: false });
    $('size').textContent = exportSize();
  } finally { drawing = false; paper.classList.remove('busy'); if (again) { again = false; draw(); } }
  save();
}
function exportSize() { const k = state.scale; return Math.round(out.width * k) + ' × ' + Math.round(out.height * k) + ' px'; }

// ---- controls ------------------------------------------------------------------------
const fontSel = $('font'), custom = $('custom-font');
$('text').value = state.text; fontSel.value = state.font; custom.value = state.custom; custom.hidden = state.font !== 'custom';
for (const [id, k] of [['ink', 'ink'], ['ink2', 'ink2'], ['paper-c', 'paper']]) { $(id).value = state[k]; $(id).addEventListener('input', e => { state[k] = e.target.value; schedule(); }); }
$('transparent').checked = state.transparent; $('transparent').addEventListener('change', e => { state.transparent = e.target.checked; paper.classList.toggle('checker', state.transparent); save(); });
paper.classList.toggle('checker', state.transparent);
$('scale').value = String(state.scale); $('scale').addEventListener('change', e => { state.scale = Number(e.target.value); $('size').textContent = exportSize(); save(); });
$('text').addEventListener('input', e => { state.text = e.target.value; schedule(); });
fontSel.addEventListener('change', () => { state.font = fontSel.value; custom.hidden = state.font !== 'custom'; if (!custom.hidden) custom.focus(); schedule(); });
custom.addEventListener('input', () => { state.custom = custom.value.trim(); schedule(); });
const range = (id, k) => { const r = $(id), o = $(id + '-o'); const sync = () => { o.textContent = r.value; r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }; r.value = state[k]; sync(); r.addEventListener('input', () => { state[k] = Number(r.value); sync(); schedule(); }); };
range('lh', 'lh'); range('ls', 'ls');
document.querySelectorAll('[data-align]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.align === state.align)); b.addEventListener('click', () => { state.align = b.dataset.align; document.querySelectorAll('[data-align]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); schedule(); }); });

function drawSteps() {
  const box = $('steps'); box.replaceChildren();
  state.steps.forEach((step, n) => {
    const t = TREATMENTS[step.type], card = document.createElement('div'); card.className = 'step';
    const head = document.createElement('div'); head.className = 'head';
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Effect ' + (n + 1));
    for (const fam of ['Dry', 'Wet', 'Shredded']) {
      const og = document.createElement('optgroup'); og.label = fam;
      for (const [key, tr] of Object.entries(TREATMENTS)) if (tr.family === fam) { const o = document.createElement('option'); o.value = key; o.textContent = tr.name; og.append(o); }
      sel.append(og);
    }
    sel.value = step.type; sel.addEventListener('change', () => { state.steps[n] = { type: sel.value, values: {} }; drawSteps(); schedule(); });
    head.append(sel);
    if (state.steps.length > 1) { const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove effect'); x.addEventListener('click', () => { state.steps.splice(n, 1); drawSteps(); schedule(); }); head.append(x); }
    card.append(head);
    for (const q of t.params) {
      const row = document.createElement('label'); row.className = 'slider';
      const name = document.createElement('span'); name.textContent = q.label;
      const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = step.values[q.key] ?? q.value;
      const o = document.createElement('output'); const sync = () => { o.textContent = r.value; r.style.setProperty('--p', r.value + '%'); }; sync();
      r.addEventListener('input', () => { step.values[q.key] = Number(r.value); sync(); schedule(); });
      row.append(name, r, o); card.append(row);
    }
    box.append(card);
  });
  $('add').hidden = state.steps.length >= 4;
}
$('add').addEventListener('click', () => { const keys = Object.keys(TREATMENTS); state.steps.push({ type: keys[(Math.random() * keys.length) | 0], values: {} }); drawSteps(); schedule(); });
$('reroll').addEventListener('click', () => { state.seed = (Math.random() * 1e9) | 0; schedule(); });
$('surprise').addEventListener('click', () => {
  const R = rng((Math.random() * 1e9) | 0), keys = Object.keys(TREATMENTS), n = 1 + (R() < 0.55 ? 1 : 0) + (R() < 0.15 ? 1 : 0), steps = [];
  for (let i = 0; i < n; i++) { const type = keys[(R() * keys.length) | 0], values = {}; for (const q of TREATMENTS[type].params) values[q.key] = Math.round(15 + R() * 70); steps.push({ type, values }); }
  state.steps = steps; state.seed = (R() * 1e9) | 0; drawSteps(); schedule();
});

// ---- image in --------------------------------------------------------------------------
async function useFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const bmp = await createImageBitmap(file);
  const probe = document.createElement('canvas'); probe.width = Math.min(64, bmp.width); probe.height = Math.min(64, bmp.height);
  const px = probe.getContext('2d'); px.drawImage(bmp, 0, 0, probe.width, probe.height);
  const a = px.getImageData(0, 0, probe.width, probe.height).data; let clear = 0; for (let i = 3; i < a.length; i += 4) if (a[i] < 250) clear++;
  image = bmp; image.hasAlpha = clear > a.length / 4 * 0.02;   // transparent PNG: use its shape; otherwise dark = ink
  $('clear-img').hidden = false; schedule();
}
$('img').addEventListener('change', e => useFile(e.target.files[0]));
$('clear-img').addEventListener('click', () => { image = null; $('img').value = ''; $('clear-img').hidden = true; schedule(); });
let depth = 0;
addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { depth++; $('drop').hidden = false; } });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('drop').hidden = true; } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); depth = 0; $('drop').hidden = true; useFile(e.dataTransfer.files[0]); });

// ---- export ----------------------------------------------------------------------------
$('export').addEventListener('click', async () => {
  const btn = $('export'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Shredding…';
  await new Promise(r => setTimeout(r, 30));
  try {
    let u = PREVIEW_U * state.scale; const area = out.width * out.height * state.scale * state.scale;
    if (area > MAX_PIXELS) u = Math.floor(u * Math.sqrt(MAX_PIXELS / area));   // stay within what browsers can hold
    const c = document.createElement('canvas'); render(u, c, { transparent: state.transparent });
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const name = (image ? 'image' : (state.text || 'type').trim().split(/\s+/).slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')) || 'type';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shredder-${name}-${state.seed}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } finally { btn.disabled = false; btn.textContent = label; }
});

drawSteps(); draw();
document.fonts?.ready?.then(() => schedule());
