// Film looks for the Positive Film tool. Enrico Policardo, 2026. Free to use.
// Every look is a handful of readable numbers: a tone curve, colour moves in LCh, grain, softness and edges.
// Positive Film is measured (see pf-core.js); the others are built by eye from published descriptions of each film.
import {pixel as pfPixel, encode} from './pf-core.js';

export const LOOKS = [
  {id:'positive-film', name:'Positive Film', kind:'measured',
   blurb:"The original Ricoh GR's colour, measured from RAW + JPEG pairs. Strong reds and blues, quiet greens, crushed blacks."},
  {id:'portrait-negative', name:'Portrait Negative', kind:'colour',
   blurb:'Soft, warm colour negative in the spirit of Kodak Portra 400. Gentle contrast, open shadows, kind to skin.',
   autoEv:true, ev:0.25, tone:{lo:4, span:93, k:1.4, s0:0}, soften:{amt:0.12, sigma:0.8},
   chroma:0.9, bw:40, bands:[[20,0.95,2],[50,1.02,3],[85,0.85,-4],[135,0.72,-10],[200,0.85,-6],[250,0.88,-8],[300,0.8,0],[340,0.9,0]],
   split:{s:[-0.3,-0.8], m:[0.8,3.0], h:[0.8,4.0]}, grain:{L:[[0.8,0.9]], ab:[1.2,0.25]}},
  {id:'lab-print-90s', name:"'90s Lab Print", kind:'colour',
   blurb:'A fresh high-street print from consumer film such as Kodak Gold or Fujicolor: warm, contrasty, saturated, a little soft at the edges.',
   autoEv:true, ev:0.15, tone:{lo:3, span:95, k:1.85, s0:-0.05}, soften:{amt:0.28, sigma:0.9},
   chroma:1.22, bw:40, bands:[[20,1.30,3],[50,1.15,2],[85,1.25,-2],[135,1.28,-6],[200,1.0,-4],[250,1.05,2],[320,1.05,0]],
   split:{s:[-1.5,0], m:[0.6,3.2], h:[0.4,2.5]}, grain:{L:[[1.0,1.4],[0.5,0.6]], ab:[1.4,0.42]}, vignette:{stops:0.45, post:0.5}},
  {id:'muted-chrome', name:'Muted Chrome', kind:'colour',
   blurb:"Hard shadows and quiet colour, in the spirit of Fujifilm's Classic Chrome: deep reds, cyan skies, olive greens.",
   autoEv:true, ev:-0.1, tone:{lo:1, span:98, k:1.75, s0:0.1},
   chroma:0.8, bw:40, bands:[[20,1.08,0],[50,0.95,-2],[85,0.7,-6],[135,0.62,-12],[200,0.85,0],[250,0.85,-10],[300,0.75,-10],[340,0.85,0]],
   split:{s:[0,-1.0], m:[0.3,0.5], h:[0.5,1.5]}},
  {id:'night-tungsten', name:'Night Tungsten', kind:'colour',
   blurb:'Cinema film under street lights, in the spirit of CineStill 800T: teal shadows, warm highlights, a red glow around bright lights.',
   autoEv:true, ev:0, tone:{lo:2, span:96, k:1.55, s0:0},
   chroma:1.05, bw:40, bands:[[20,1.2,4],[50,1.1,0],[135,0.8,15],[200,1.05,0],[250,1.1,-6]],
   split:{s:[-3,-5], m:[-0.5,-2], h:[2,3]}, grain:{L:[[1.0,1.6]], ab:[1.4,0.4]}, halation:{from:72, sigma:7, amt:0.55, col:[1,0.28,0.1]}},
  {id:'classic-bw', name:'Classic B&W', kind:'mono',
   blurb:'Black and white in the spirit of Kodak Tri-X: full tonal range, firm mid-tones, visible grain.',
   mix:[0.32,0.58,0.10], autoEv:true, ev:0, tone:{lo:2, span:96, k:1.5, s0:0},
   preGrain:[[1.1,0.12],[0.6,0.05]], vignette:{stops:0.3}},
  {id:'high-contrast-bw', name:'High Contrast B&W', kind:'mono',
   blurb:"Pushed film on hard paper, after Daido Moriyama's Tokyo street work: deep blacks, blown whites, heavy grain, dark edges.",
   mix:[0.27,0.60,0.13], autoEv:true, ev:-0.45, tone:{lo:0, span:100, k:1.75, s0:0.1, stretch:[10,95]},
   preGrain:[[1.6,0.2],[0.7,0.08]], vignette:{stops:1.1}},
];
export const lookById = id => LOOKS.find(l => l.id === id) || LOOKS[0];
export const hasGrain = l => !!(l.grain || l.preGrain);

// ---------- maths
const WX = 0.95045592705, WZ = 1.08905775076;
const M = [0.4123907993,0.3575843394,0.1804807884,0.2126390059,0.7151686788,0.0721923154,0.0193308187,0.1191947798,0.9505321522];
const MI = [3.2409699419,-1.5373831776,-0.4986107603,-0.9692436363,1.8759675015,0.0415550574,0.0556300797,-0.2039769589,1.0569715142];
const E = 0.008856451679035631, K = 903.2962962962963;
const fLab = t => t > E ? Math.cbrt(t) : (K * t + 16) / 116;
const fInv = t => t > 0.20689655172413793 ? t * t * t : (116 * t - 16) / K;
const L2Y = L => L > 8 ? ((L + 16) / 116) ** 3 : L / K;
const c01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = (a, b, v) => { const t = c01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const DEG = 57.29577951308232;

function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function boxes(sigma) { const n = 3, wI = Math.floor(Math.sqrt(12 * sigma * sigma / n + 1)), wl = wI % 2 ? wI : wI - 1, wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)); return [0, 1, 2].map(i => i < m ? wl : wu); }
function boxLine(s, d, st, stride, len, r) {
  const k = 1 / (2 * r + 1); let acc = 0;
  for (let j = -r; j <= r; j++) acc += s[st + stride * (j < 0 ? 0 : j >= len ? len - 1 : j)];
  for (let i = 0; i < len; i++) { d[st + stride * i] = acc * k; const ad = i + r + 1, rm = i - r; acc += s[st + stride * (ad >= len ? len - 1 : ad)] - s[st + stride * (rm < 0 ? 0 : rm)]; }
}
// Gaussian blur (three box passes), in place
function blur(a, w, h, sigma, tmp) {
  if (sigma < 0.35) return a; const t = tmp || new Float32Array(a.length);
  for (const b of boxes(sigma)) { const r = (b - 1) >> 1; if (r < 1) continue; for (let y = 0; y < h; y++) boxLine(a, t, y * w, 1, w, r); for (let x = 0; x < w; x++) boxLine(t, a, x, w, h, r); }
  return a;
}
// Grain: blurred white noise, scaled so its spread equals amp. Sizes are for a 1200 px long edge.
const GCACHE = new Map();
function grainField(w, h, layers, sc, seed, tmp) {
  const key = [w, h, seed, JSON.stringify(layers)].join('|');
  if (GCACHE.has(key)) return GCACHE.get(key);
  if (GCACHE.size > 5) GCACHE.clear();
  const out = new Float32Array(w * h), f = new Float32Array(w * h);
  layers.forEach(([size, amp], li) => {
    const r = rng(seed + li * 7919);
    for (let i = 0; i < f.length; i += 2) { const u = r() || 1e-9, v = r(), m = Math.sqrt(-2 * Math.log(u)); f[i] = m * Math.cos(6.283185307 * v); if (i + 1 < f.length) f[i + 1] = m * Math.sin(6.283185307 * v); }
    blur(f, w, h, size * sc, tmp);
    let ss = 0; for (let i = 0; i < f.length; i += 7) ss += f[i] * f[i];
    const k = amp / Math.sqrt(ss / Math.ceil(f.length / 7) || 1);
    for (let i = 0; i < f.length; i++) out[i] += f[i] * k;
  });
  GCACHE.set(key, out);
  return out;
}
// Auto exposure: nudges the log-average of the middle 90% of tones towards mid grey
function keyEv(data, mix) {
  const n = data.length / 3, step = Math.max(1, Math.floor(n / 40000)), v = [];
  for (let i = 0; i < n; i += step) { const Y = mix[0] * data[i * 3] + mix[1] * data[i * 3 + 1] + mix[2] * data[i * 3 + 2]; v.push(Math.log2(Math.max(Y, 1e-5))); }
  v.sort((a, b) => a - b); const lo = v[Math.floor(v.length * 0.05)], hi = v[Math.floor(v.length * 0.95)];
  let s = 0, c = 0; for (const x of v) if (x > lo && x < hi) { s += x; c++; }
  // half-strength and capped: the camera's meter has already done most of the work
  return c ? Math.max(-1, Math.min(1, 0.5 * (Math.log2(0.18) - s / c))) : 0;
}
const vigR = (x, y, w, h) => { const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2); return Math.pow((dx * dx + dy * dy) / 2, 1.1); }; // r^2.2, r = 1 in the corners

function image(w, h) { return typeof ImageData !== 'undefined' ? new ImageData(w, h) : {width: w, height: h, data: new Uint8ClampedArray(w * h * 4)}; }

// s: {w, h, data: linear RGB Float32 (camera WB, 1 = clip), orig: encoded RGB for JPEG input, mode}
// o: {ev, strength 0-1, colour 0-1, grain 0-2}
export function renderLook(look, s, o, withBefore) {
  const {w, h, data} = s, n = w * h, kU = Math.pow(2, o.ev || 0), st = o.strength, col = o.colour, gk = o.grain;
  const A = image(w, h), B = withBefore ? image(w, h) : null, sc = Math.max(w, h) / 1200;
  const neutral = (p, q) => { // before image, and the base for the strength slider
    if (s.mode === 'raw') return [encode(c01(data[p] * kU)), encode(c01(data[p + 1] * kU)), encode(c01(data[p + 2] * kU))];
    return [s.orig[p], s.orig[p + 1], s.orig[p + 2]];
  };
  const put = (q, nb, r, g, b) => {
    A.data[q] = 255 * (nb[0] + (r - nb[0]) * st); A.data[q + 1] = 255 * (nb[1] + (g - nb[1]) * st); A.data[q + 2] = 255 * (nb[2] + (b - nb[2]) * st); A.data[q + 3] = 255;
    if (B) { B.data[q] = 255 * nb[0]; B.data[q + 1] = 255 * nb[1]; B.data[q + 2] = 255 * nb[2]; B.data[q + 3] = 255; }
  };
  if (look.kind === 'measured') {
    const t = new Float64Array(3);
    for (let p = 0, q = 0; p < data.length; p += 3, q += 4) {
      pfPixel(data[p] * kU, data[p + 1] * kU, data[p + 2] * kU, t, 0, col);
      put(q, neutral(p, q), encode(c01(t[0])), encode(c01(t[1])), encode(c01(t[2])));
    }
    return {A, B};
  }
  const mix = look.mix || [0.2126, 0.7152, 0.0722];
  const ev = Math.log2(kU) + (look.autoEv ? keyEv(data, mix) : 0) + (look.ev || 0), kE = Math.pow(2, ev);
  const T = look.tone, tmp = new Float32Array(n);
  // 1. tone curve on luminance, in stops from mid grey, with grain and edge darkening in exposure space
  const L = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 3) L[i] = Math.log2(Math.max(mix[0] * data[p] + mix[1] * data[p + 1] + mix[2] * data[p + 2], 1e-5) * kE / 0.18);
  if (look.preGrain && gk > 0) { const g = grainField(w, h, look.preGrain, sc, 11, tmp); for (let i = 0; i < n; i++) L[i] += g[i] * gk; }
  if (look.vignette && !look.vignette.post) for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) L[i] -= look.vignette.stops * vigR(x, y, w, h);
  for (let i = 0; i < n; i++) {
    let v = T.lo + T.span / (1 + Math.exp(-T.k * (L[i] - T.s0)));
    if (T.stretch) v = (v - T.stretch[0]) / (T.stretch[1] - T.stretch[0]) * 100;
    L[i] = v < 0 ? 0 : v > 100 ? 100 : v;
  }
  if (look.soften) { const b = Float32Array.from(L); blur(b, w, h, look.soften.sigma * sc, tmp); const a = look.soften.amt; for (let i = 0; i < n; i++) L[i] = L[i] * (1 - a) + b[i] * a; }
  if (look.kind === 'mono') {
    for (let i = 0, p = 0, q = 0; i < n; i++, p += 3, q += 4) { const v = encode(c01(L2Y(L[i]))); put(q, neutral(p, q), v, v, v); }
    return {A, B};
  }
  // 2. colour in LCh
  let gL = null, gA = null, gB = null, H = null;
  if (look.grain && gk > 0) { gL = grainField(w, h, look.grain.L, sc, 21, tmp); gA = grainField(w, h, [look.grain.ab], sc, 31, tmp); gB = grainField(w, h, [look.grain.ab], sc, 41, tmp); }
  if (look.halation) { const hl = look.halation; H = new Float32Array(n); for (let i = 0; i < n; i++) { const t = Math.max(0, (L[i] - hl.from) / (100 - hl.from)); H[i] = t * t; } blur(H, w, h, hl.sigma * sc, tmp); }
  const bands = look.bands || [], bw = look.bw || 40, sp = look.split, vg = look.vignette;
  for (let i = 0, p = 0, q = 0, y = 0, x = 0; i < n; i++, p += 3, q += 4) {
    const r = data[p] * kE, g = data[p + 1] * kE, b = data[p + 2] * kE;
    const X = (M[0] * r + M[1] * g + M[2] * b) / WX, Y = M[3] * r + M[4] * g + M[5] * b, Z = (M[6] * r + M[7] * g + M[8] * b) / WZ;
    const fx = fLab(X), fy = fLab(Y), fz = fLab(Z), L0 = 116 * fy - 16, a0 = 500 * (fx - fy), b0 = 200 * (fy - fz);
    let Lv = L[i];
    const C = Math.hypot(a0, b0) * Math.min(1.6, Math.max(0.6, (Lv + 8) / (L0 + 8)));
    let hh = Math.atan2(b0, a0) * DEG; if (hh < 0) hh += 360;
    let gs = 1, dh = 0;
    for (const [c, sat, sh] of bands) { const d = Math.abs(((hh - c + 540) % 360) - 180); if (d < bw) { const wt = 1 - d / bw; gs += wt * (sat - 1); dh += wt * sh; } }
    const roll = 1 - 0.85 * sstep(86, 100, Lv);
    const Cf = C * gs * look.chroma * roll, hf = (hh + dh) / DEG, hb = hh / DEG;
    let a1 = Cf * Math.cos(hf), b1 = Cf * Math.sin(hf);
    if (sp) { const ws = 1 - sstep(12, 55, Lv), wh = sstep(62, 95, Lv), wm = 1 - ws - wh; a1 += sp.s[0] * ws + sp.m[0] * wm + sp.h[0] * wh; b1 += sp.s[1] * ws + sp.m[1] * wm + sp.h[1] * wh; }
    const ab = C * roll * Math.cos(hb), bb = C * roll * Math.sin(hb);
    let av = ab + (a1 - ab) * col, bv = bb + (b1 - bb) * col;
    if (gL) { const hk = gk * (1 - sstep(70, 98, Lv)); Lv += gL[i] * gk; av += gA[i] * hk; bv += gB[i] * hk; }
    if (vg && vg.post) Lv *= Math.pow(Math.pow(2, -vg.stops * vigR(x, y, w, h)), vg.post);
    Lv = Lv < 0 ? 0 : Lv > 100 ? 100 : Lv;
    const gy = (Lv + 16) / 116, X2 = fInv(gy + av / 500) * WX, Y2 = fInv(gy), Z2 = fInv(gy - bv / 200) * WZ;
    let R = MI[0] * X2 + MI[1] * Y2 + MI[2] * Z2, G = MI[3] * X2 + MI[4] * Y2 + MI[5] * Z2, Bl = MI[6] * X2 + MI[7] * Y2 + MI[8] * Z2;
    if (H) { const hv = H[i] * look.halation.amt * col, hc = look.halation.col; R += hv * hc[0]; G += hv * hc[1]; Bl += hv * hc[2]; }
    put(q, neutral(p, q), encode(c01(R)), encode(c01(G)), encode(c01(Bl)));
    if (++x === w) { x = 0; y++; }
  }
  return {A, B};
}
