// Grain for the Positive Film tool: physical, per pixel, driven by ISO. Enrico Policardo, 2026. Free to use.
//
// Film. The picture is treated as one 35 mm frame (36 mm on the long edge), so a pixel stands for a known
// patch of film. Grain strength is calibrated to Kodak's diffuse RMS granularity (density fluctuation through
// a 48 µm aperture at density 1.0), carried to each pixel's area with Selwyn's law (sigma × sqrt(area) is
// constant). Its dependence on tone follows the Boolean grain model (Newson, Delon & Galerne 2017): each pixel's
// value sets how much of it is covered by grains, so grain peaks in the mid-tones and fades into clean
// whites and solid blacks. Black and white is hard, neutral silver; colour is three softer dye layers.
//
// Digital. Sensor noise is counted light: photon shot noise plus read noise, per pixel. Fewer photons per
// pixel (smaller pixels, higher ISO) means more noise; a downsized file averages it away.
//
// Both only add what is missing: noise already in the file at the ISO it was shot at is taken off first.

const LN10 = Math.LN10, FRAME_UM = 36000, A48 = Math.PI * 24 * 24;

// Stocks. rms: Kodak diffuse RMS granularity × 1000 at the stock's own ISO (B&W from datasheets; colour
// converted from Kodak's Print Grain Index, PGI 37 = 10, each PGI point ≈ 3.5%). exp: how granularity grows
// with exposure index (classic cubic grain ≈ 0.45, T-grain colour ≈ 0.35). clump: dye-cloud / clump size in µm.
// The datasheet measures the negative; the picture you see is a print or scan of it, which multiplies the
// negative's density flicker by the paper's contrast (gamma): about 2.0 for grade-2 B&W paper, 2.6 for colour paper.
const PRINT = {bw: 2.0, colour: 2.6};
export const STOCKS = {
  'tri-x':    {type: 'bw', name: 'Tri-X 400', iso: 400, rms: 17, exp: 0.45, clump: 7, white: 0.55},          // F-4017: RMS 17
  'shinjuku': {type: 'bw', name: 'Tri-X 400 pushed', iso: 400, rms: 17, exp: 0.45, clump: 7, white: 0.55, start: 1600},
  'portra-400': {type: 'colour', name: 'Portra 400', iso: 400, rms: 10, exp: 0.35, clump: 9, white: 0.3},    // E-4050: PGI 37
  'one-hour-photo': {type: 'colour', name: 'Gold 200', iso: 200, rms: 12.7, exp: 0.35, clump: 10, white: 0.3}, // PGI 44
  '800t':     {type: 'colour', name: 'Vision3 500T, rated 800', iso: 800, rms: 13, exp: 0.35, clump: 11, white: 0.3},
  'positive-film': {type: 'digital'},
  'classic-chrome': {type: 'digital'},
};
// The speeds each film is really shot at: box speed, pulled (rated slower) and pushed (rated faster, developed longer).
const B = 'box speed';
export const SPEEDS = {
  'tri-x': [[200, 'pulled'], [400, B], [800, 'pushed 1'], [1600, 'pushed 2'], [3200, 'pushed 3']],
  'shinjuku': [[800, 'pushed 1'], [1600, 'pushed 2'], [3200, 'pushed 3']],
  'portra-400': [[200, 'rated 200'], [400, B], [800, 'pushed 1']],
  'one-hour-photo': [[100, 'rated 100'], [200, B], [400, 'pushed 1']],
  '800t': [[400, 'rated 400'], [800, B], [1600, 'pushed 1'], [3200, 'pushed 2']],
};
const DIGITAL = [100, 200, 400, 800, 1600, 3200, 6400];
// Options for the grain buttons: [value, label, note]. Film starts at its box speed (Shinjuku pushed), digital as shot.
export function isoOptions(lookId) {
  const st = STOCKS[lookId];
  if (!st) return {options: [], start: 'off'};
  if (st.type === 'digital') return {options: [['shot', 'As shot', ''], ...DIGITAL.map(v => [v, String(v), '']), ['off', 'Off', '']], start: 'shot'};
  return {options: [...SPEEDS[lookId].map(([v, n]) => [v, String(v), n === B ? 'box' : n]), ['off', 'Off', '']], start: st.start || st.iso};
}
export const ISO_STEPS = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400];

// Sensor long edge in mm, for working out pixel size. Fallback: from the 35 mm-equivalent focal length.
const SENSORS = [[/ricoh.*gr/i, 23.6], [/dmc-gx8|dmc-gx80|dmc-gx85|dc-g9|dmc-g/i, 17.3], [/d810|d850|d750|d780|z ?[5-9]\b|a7|ilce-7|eos r\b|eos 5d|eos 6d/i, 35.9],
  [/x10\b|x20\b|x30\b/i, 8.8], [/x100|x-t|x-pro|x-e|x-s|x-h/i, 23.5], [/iphone/i, 9.8], [/pixel/i, 9.6]];
export function sensorLongMm(meta = {}) {
  const who = `${meta.make || ''} ${meta.model || ''}`;
  for (const [rx, mm] of SENSORS) if (rx.test(who)) return mm;
  if (meta.focal > 0 && meta.focal35 > 0) return 36 * meta.focal / meta.focal35;
  return 23.5; // APS-C if we know nothing
}

// ---------- Boolean model: how grain varies with tone
// F(m) = (1/a) ∫ (exp(m·g(h)) − 1) dh, g = overlap fraction of two unit disks at distance h, m = −ln(transmittance).
const FT = (() => {
  const t = new Float64Array(241), g = h => { const x = h / 2; return x >= 1 ? 0 : (2 / Math.PI) * (Math.acos(x) - x * Math.sqrt(1 - x * x)); };
  for (let j = 0; j < t.length; j++) {
    const m = j * 0.05; let s = 0; const N = 400;
    for (let i = 0; i < N; i++) { const h = (i + 0.5) * 2 / N; s += 2 * Math.PI * h * (Math.exp(m * g(h)) - 1) * (2 / N); }
    t[j] = s / Math.PI;
  }
  return t;
})();
const F = m => { if (m <= 0) return 0; const x = Math.min(m, 12) / 0.05, i = Math.min(239, Math.floor(x)), f = x - i; return FT[i] * (1 - f) + FT[i + 1] * f; };
const F_REF = F(LN10);
// Spread of a pixel's value (0–1, linear) relative to its spread at density 1.0.
const SHAPE = (() => { const t = new Float32Array(1025); for (let i = 0; i <= 1024; i++) { const Y = i / 1024; t[i] = Y <= 0 ? 0 : Y * Math.sqrt(F(-Math.log(Y)) / F_REF); } return t; })();
const shape = Y => SHAPE[Y <= 0 ? 0 : Y >= 1 ? 1024 : (Y * 1024) | 0];

// ---------- random fields
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(n, seed) { const f = new Float32Array(n), r = rng(seed); for (let i = 0; i < n; i += 2) { const u = r() || 1e-9, v = r(), m = Math.sqrt(-2 * Math.log(u)); f[i] = m * Math.cos(6.283185307 * v); if (i + 1 < n) f[i + 1] = m * Math.sin(6.283185307 * v); } return f; }
function blurG(a, w, h, s) { // separable Gaussian, small radius
  const r = Math.max(1, Math.ceil(s * 3)), k = new Float32Array(2 * r + 1); let ks = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * s * s)); ks += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const t = new Float32Array(a.length);
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; v += a[o + xx] * k[i + r]; } t[o + x] = v; } }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let v = 0; for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i; v += t[yy * w + x] * k[i + r]; } a[y * w + x] = v; }
  return a;
}
// Unit-variance field: a crisp per-pixel part (single grains) plus a clump part of a physical size.
// Returns the field and its "noise area" in px² (the integral of its correlation), used for Selwyn scaling.
const CACHE = new Map();
function field(w, h, seed, clumpPx, white) {
  const key = `${w}|${h}|${seed}|${clumpPx.toFixed(3)}|${white}`;
  if (CACHE.has(key)) return CACHE.get(key);
  if (CACHE.size > 8) CACHE.clear();
  const n = w * h, a = gauss(n, seed);
  let area = 1;
  if (clumpPx >= 0.45) {
    const b = blurG(gauss(n, seed + 7919), w, h, clumpPx);
    let ss = 0; for (let i = 0; i < n; i += 5) ss += b[i] * b[i];
    const kb = 1 / Math.sqrt(ss / Math.ceil(n / 5) || 1), sw = Math.sqrt(white), sc = Math.sqrt(1 - white);
    for (let i = 0; i < n; i++) a[i] = sw * a[i] + sc * b[i] * kb;
    area = white + (1 - white) * 4 * Math.PI * clumpPx * clumpPx;
  }
  const out = {f: a, area, clumpPx, white};
  CACHE.set(key, out);
  return out;
}

// Variance of a unit field averaged over a square aperture of side a px (same area as Kodak's 48 µm circle)
function apertureVar(fl, a) {
  if (fl.area === 1) return 1 / (a * a);
  const c = 2 * fl.clumpPx, x = a / c, erf = z => { const t = 1 / (1 + 0.3275911 * z); return 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); };
  const I1 = (c * c / (a * a)) * (Math.sqrt(Math.PI) * x * erf(x) + Math.exp(-x * x) - 1);
  return fl.white / (a * a) + (1 - fl.white) * I1 * I1;
}

// ---------- digital noise (in linear 0–1, relative to clipping)
const E_PER_UM2 = 1500, READ_E = 2.5;
function digitalSigma(v, iso, pitchUm, binning) {
  const nsat = E_PER_UM2 * pitchUm * pitchUm * 100 / iso, varE = Math.max(v, 0) * nsat + READ_E * READ_E * binning * binning;
  return Math.sqrt(varE) / nsat;
}

// Resolve what the slider means for this look and photo.
// iso: 'off' | 'shot' | number. meta: {iso, make, model, focal, focal35, nativeLong, mode}
export function plan(lookId, iso, w, h, meta = {}) {
  const st = STOCKS[lookId];
  if (!st || iso === 'off') return null;
  const shotIso = meta.iso > 0 ? meta.iso : null;
  const target = iso === 'shot' ? (st.type === 'digital' ? shotIso : (shotIso || st.iso)) : +iso;
  if (!target) return null;
  const long = Math.max(w, h), sensorUm = sensorLongMm(meta) * 1000, pitchD = sensorUm / long;
  const binning = Math.max(1, (meta.nativeLong || long) / long);
  // the file's own noise; camera JPEGs have had most of it cleaned away
  const own = shotIso ? {iso: shotIso, k: meta.mode === 'jpeg' ? 0.5 : 1} : null;
  const p = {type: st.type, iso: target, stock: st, w, h, pitchD, binning, own};
  if (st.type !== 'digital') {
    const q = target / st.iso, pitch = FRAME_UM / long, clump = st.clump * Math.pow(q, 0.25) / pitch;
    const rms = st.rms * Math.pow(q, st.exp) / 1000;
    const fl = field(w, h, 101, clump, st.white);
    p.sigmaD = PRINT[st.type] * rms / Math.sqrt(apertureVar(fl, Math.sqrt(A48) / pitch)); // per pixel: the 48 µm reading on the negative equals the datasheet, then printed
    p.L = fl.f;
    if (st.type === 'colour') { p.C = [field(w, h, 202, clump, st.white).f, field(w, h, 303, clump, st.white).f, field(w, h, 404, clump * 1.25, st.white).f]; }
  } else {
    p.D = [gauss(w * h, 505), gauss(w * h, 606), gauss(w * h, 707)];
  }
  return p;
}

// Digital: noise on the linear sensor values, before the look. Adds only what the file is missing.
export function addDigital(p, data) {
  if (!p || p.type !== 'digital') return;
  const n = p.w * p.h, gw = [1, 0.82, 1.05]; // two green photosites per Bayer square
  for (let i = 0, k = 0; i < n; i++, k += 3) for (let c = 0; c < 3; c++) {
    const v = data[k + c], s = digitalSigma(v, p.iso, p.pitchD, p.binning);
    const o = p.own ? digitalSigma(v, p.own.iso, p.pitchD, p.binning) * p.own.k : 0;
    const add = s > o ? Math.sqrt(s * s - o * o) : 0;
    if (add) data[k + c] = v + add * gw[c] * (0.55 * p.D[1][i] + 0.835 * p.D[c][i]); // partly shared: demosaicing mixes channels
  }
}
// How much of the film grain is still missing, given the file's own noise (luminance, linear).
function missing(p, Y, sY) {
  if (!p.own) return 1;
  const o = digitalSigma(Y, p.own.iso, p.pitchD, p.binning) * p.own.k;
  return sY > o ? Math.sqrt(1 - (o * o) / (sY * sY)) : 0;
}
// Black and white: one silver layer, on display-linear luminance.
export function grainBW(p, i, Y) {
  const s = p.sigmaD * LN10 * shape(Y);
  return Y + s * missing(p, Y, s) * p.L[i];
}
// Colour: three dye layers, partly following luminance, on display-linear RGB.
export function grainColour(p, i, rgb) {
  const L = p.L[i];
  for (let c = 0; c < 3; c++) {
    const v = rgb[c], s = p.sigmaD * LN10 * shape(v) * (c === 2 ? 1.2 : 1);
    rgb[c] = v + s * missing(p, v, s) * (0.6 * L + 0.8 * p.C[c][i]);
  }
  return rgb;
}
