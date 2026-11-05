// Shredder - the damage. Pure pixel work on "ink masks" (Float32Array, 0 = paper,
// 1 = full ink), so it runs in the browser and in node tests alike.
// Every size is measured in u = the type's size in pixels, so a small preview and a
// big export of the same seed look the same.

export function rng(seed = 1) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = t => t * t * (3 - 2 * t);

// smooth random field, values 0..1; cell = feature size in pixels
export function noise(w, h, cell, rand, octaves = 1) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0, c = Math.max(1, cell);
  for (let o = 0; o < octaves; o++) {
    const gw = Math.ceil(w / c) + 2, gh = Math.ceil(h / c) + 2, g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    for (let y = 0; y < h; y++) {
      const fy = y / c, y0 = fy | 0, ty = smooth(fy - y0), r0 = y0 * gw, r1 = r0 + gw;
      for (let x = 0; x < w; x++) {
        const fx = x / c, x0 = fx | 0, tx = smooth(fx - x0);
        const a = g[r0 + x0] + (g[r0 + x0 + 1] - g[r0 + x0]) * tx, b = g[r1 + x0] + (g[r1 + x0 + 1] - g[r1 + x0]) * tx;
        out[y * w + x] += (a + (b - a) * ty) * amp;
      }
    }
    total += amp; amp *= 0.5; c = Math.max(1, c / 2);
  }
  if (octaves > 1) for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
// per-pixel grain
export function grain(w, h, rand) { const out = new Float32Array(w * h); for (let i = 0; i < out.length; i++) out[i] = rand(); return out; }

// fast blur: three box passes each way ~ gaussian
export function blur(src, w, h, radius) {
  const r = Math.round(radius); if (r < 1) return Float32Array.from(src);
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  const pass = (from, to, horizontal) => {
    const len = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w, k = 1 / (2 * r + 1);
    for (let l = 0; l < lines; l++) {
      const base = horizontal ? l * w : l;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += from[base + Math.min(len - 1, Math.max(0, i)) * step];
      for (let i = 0; i < len; i++) {
        to[base + i * step] = acc * k;
        acc += from[base + Math.min(len - 1, i + r + 1) * step] - from[base + Math.max(0, i - r) * step];
      }
    }
  };
  for (let n = 0; n < 3; n++) { pass(a, b, true); pass(b, a, false); }
  return a;
}

function sample(m, w, h, x, y) {   // bilinear, outside = paper
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0;
  const a = m[y0 * w + x0] + (m[y0 * w + x1] - m[y0 * w + x0]) * tx, b = m[y1 * w + x0] + (m[y1 * w + x1] - m[y1 * w + x0]) * tx;
  return a + (b - a) * ty;
}
function blobs(m, w, h, count, rmin, rmax, value, rand, within) {
  for (let n = 0; n < count; n++) {
    const cx = rand() * w, cy = rand() * h, r = rmin + rand() * (rmax - rmin);
    if (within && within[(cy | 0) * w + (cx | 0)] < 0.5) continue;
    const ri = Math.ceil(r);
    for (let y = Math.max(0, (cy - ri) | 0); y < Math.min(h, cy + ri + 1); y++)
      for (let x = Math.max(0, (cx - ri) | 0); x < Math.min(w, cx + ri + 1); x++) {
        const d = Math.hypot(x - cx, y - cy) / r; if (d < 1) m[y * w + x] = value ? Math.max(m[y * w + x], 1 - d * d * 0.3) : Math.min(m[y * w + x], d * d * 0.3);
      }
  }
}
const area = (w, h, u) => (w * h) / (u * u);

// ---- the treatments -----------------------------------------------------------------
// each: { name, family, params: [{key,label,min,max,value}], run(mask,w,h,p,rand,u) -> mask | {layers} }
export const TREATMENTS = {
  photocopy: { name: 'Photocopy', family: 'Dry', params: [['amount', 'Damage', 70], ['grain', 'Grain', 40], ['dust', 'Dust', 30]],
    run(m, w, h, p, R, u) {
      const s = blur(m, w, h, u * 0.012), fine = noise(w, h, u * (0.003 + p.grain * 0.012), R), coarse = noise(w, h, u * 0.08, R, 2);
      const out = new Float32Array(m.length), a = p.amount;
      for (let i = 0; i < out.length; i++) out[i] = s[i] + (fine[i] - 0.5) * a * 1.1 + (coarse[i] - 0.5) * a * 0.7 > 0.5 ? 1 : 0;
      blobs(out, w, h, Math.round(p.dust * area(w, h, u) * 0.6), u * 0.003, u * 0.012, 1, R);
      blobs(out, w, h, Math.round(p.dust * area(w, h, u) * 0.8), u * 0.004, u * 0.02, 0, R, m);
      return out;
    } },
  toner: { name: 'Toner skip', family: 'Dry', params: [['amount', 'Skips', 55], ['bands', 'Bands', 45], ['streaks', 'Streaks', 35]],
    run(m, w, h, p, R, u) {
      const rows = new Float32Array(h), bandNoise = noise(1, h, u * (0.06 + (1 - p.bands) * 0.3), R, 2);
      for (let y = 0; y < h; y++) rows[y] = bandNoise[y];
      const cols = noise(w, 1, u * 0.012, R), fine = noise(w, h, u * 0.004, R), out = new Float32Array(m.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, skip = Math.max(0, rows[y] - (1 - p.amount * 0.9)) * 3, streak = cols[x] > 1 - p.streaks * 0.25 ? p.streaks : 0;
        out[i] = m[i] * (1 - skip - streak * 0.9) + (fine[i] - 0.5) * 0.6 > 0.45 ? 1 : 0;
      }
      return out;
    } },
  letterpress: { name: 'Worn letterpress', family: 'Dry', params: [['wear', 'Wear', 50], ['squeeze', 'Ink squeeze', 45], ['texture', 'Paper', 50]],
    run(m, w, h, p, R, u) {
      const soft = blur(m, w, h, u * 0.015), wear = noise(w, h, u * 0.18, R, 3), paper = noise(w, h, u * 0.006, R, 2), out = new Float32Array(m.length);
      for (let i = 0; i < out.length; i++) {
        if (m[i] < 0.02 && soft[i] < 0.02) continue;
        const edge = Math.max(0, m[i] - soft[i]) * 4 * p.squeeze;
        const ink = 1 - p.wear * smooth(clamp01((wear[i] - 0.35) * 2.2)) * 0.95 - (paper[i] - 0.5) * p.texture * 1.2;
        out[i] = clamp01((m[i] * ink + edge) * 1.6 - 0.25);
      }
      return out;
    } },
  speckle: { name: 'Sandpaper', family: 'Dry', params: [['holes', 'Holes', 55], ['speckle', 'Speckle', 40], ['size', 'Size', 30]],
    run(m, w, h, p, R, u) {
      const g = noise(w, h, Math.max(1, u * (0.002 + p.size * 0.012)), R), out = new Float32Array(m.length);
      for (let i = 0; i < out.length; i++) out[i] = m[i] > 0.5 ? (g[i] < p.holes * 0.55 ? 0 : 1) : (g[i] > 1 - p.speckle * 0.06 ? 1 : 0);
      return out;
    } },
  dither: { name: '1-bit dither', family: 'Dry', params: [['soft', 'Softness', 35], ['dot', 'Dot size', 35], ['tone', 'Tone', 50]],
    run(m, w, h, p, R, u) {
      const cell = Math.max(2, Math.round(u * (0.008 + p.dot * 0.04)));
      const s = blur(m, w, h, u * (0.006 + p.soft * 0.06)), vary = noise(w, h, u * 0.25, R, 2);
      const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell), t = new Float32Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = Math.min(h - 1, y * cell) * w + Math.min(w - 1, x * cell); t[y * cw + x] = clamp01(s[i] * (0.55 + p.tone * 0.9) * (0.75 + vary[i] * 0.5)); }
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {   // Floyd-Steinberg
        const i = y * cw + x, old = t[i], v = old > 0.5 ? 1 : 0, e = old - v; t[i] = v;
        if (x + 1 < cw) t[i + 1] += e * 7 / 16;
        if (y + 1 < ch) { if (x > 0) t[i + cw - 1] += e * 3 / 16; t[i + cw] += e * 5 / 16; if (x + 1 < cw) t[i + cw + 1] += e / 16; }
      }
      const out = new Float32Array(m.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = t[((y / cell) | 0) * cw + ((x / cell) | 0)];
      return out;
    } },
  bleed: { name: 'Ink bleed', family: 'Wet', params: [['spread', 'Spread', 45], ['rough', 'Roughness', 55], ['fill', 'Fill in', 40]],
    run(m, w, h, p, R, u) {
      const s = blur(m, w, h, u * (0.01 + p.spread * 0.05)), n = noise(w, h, u * 0.02, R, 3), out = new Float32Array(m.length);
      const cut = 0.5 - p.fill * 0.35;
      for (let i = 0; i < out.length; i++) out[i] = clamp01((s[i] + (n[i] - 0.5) * p.rough * 0.6 - cut) * 8);
      return out;
    } },
  water: { name: 'Water damage', family: 'Wet', params: [['amount', 'Warp', 45], ['flow', 'Flow', 50], ['rings', 'Tide marks', 40]],
    run(m, w, h, p, R, u) {
      const nx = noise(w, h, u * (0.15 + p.flow * 0.4), R, 3), ny = noise(w, h, u * (0.15 + p.flow * 0.4), R, 3), amp = u * p.amount * 0.12;
      const warped = new Float32Array(m.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; warped[i] = sample(m, w, h, x + (nx[i] - 0.5) * amp * 2, y + (ny[i] - 0.5) * amp * 2); }
      const s = blur(warped, w, h, u * 0.02), out = new Float32Array(m.length);
      for (let i = 0; i < out.length; i++) { const v = s[i], ring = p.rings * Math.exp(-((v - 0.42) ** 2) / 0.004); out[i] = clamp01(v * (0.55 + nx[i] * 0.4) + ring * 0.8 > 0.4 ? Math.max(0.55 + nx[i] * 0.45, ring) : ring * 0.6); }
      return out;
    } },
  slices: { name: 'Glitch slices', family: 'Shredded', params: [['slices', 'Slices', 50], ['shift', 'Shift', 45], ['drop', 'Dropouts', 20]],
    run(m, w, h, p, R, u) {
      const out = new Float32Array(m.length);
      let y = 0;
      while (y < h) {
        const bh = Math.max(1, Math.round(u * (0.01 + R() * (0.25 - p.slices * 0.22)))), cut = R() < p.slices * 0.9;
        const dx = cut ? Math.round((R() - 0.5) * 2 * u * p.shift * 0.6) : 0, gone = R() < p.drop * 0.25;
        for (let yy = y; yy < Math.min(h, y + bh); yy++) if (!gone) for (let x = 0; x < w; x++) { const sx = x - dx; out[yy * w + x] = sx >= 0 && sx < w ? m[yy * w + sx] : 0; }
        y += bh;
      }
      return out;
    } },
  torn: { name: 'Torn strips', family: 'Shredded', params: [['strips', 'Strips', 45], ['drift', 'Drift', 40], ['tear', 'Rough edges', 55]],
    run(m, w, h, p, R, u) {
      const n = Math.max(2, Math.round(3 + p.strips * 22)), sw = w / n, edge = noise(1, h, u * 0.01, R, 3), out = new Float32Array(m.length), offs = [];
      for (let s = 0; s < n; s++) offs.push(Math.round((R() - 0.5) * 2 * u * p.drift * 0.4));
      for (let y = 0; y < h; y++) {
        const wob = (edge[y] - 0.5) * u * p.tear * 0.08;
        for (let x = 0; x < w; x++) {
          const s = Math.min(n - 1, Math.floor((x + wob) / sw)), local = (x + wob) - s * sw;
          if (local < u * p.tear * 0.012 * (1 + edge[y])) continue;   // the gap between strips
          const sy = y - offs[s]; out[y * w + x] = sy >= 0 && sy < h ? m[sy * w + x] : 0;
        }
      }
      return out;
    } },
  fax: { name: 'Fax drift', family: 'Shredded', params: [['drift', 'Drift', 45], ['lines', 'Line loss', 35], ['noise', 'Noise', 40]],
    run(m, w, h, p, R, u) {
      const out = new Float32Array(m.length), g = grain(w, h, R); let off = 0;
      const lh = Math.max(1, Math.round(u * 0.012));
      for (let y = 0; y < h; y++) {
        if (y % lh === 0) off = Math.max(-u * 0.3, Math.min(u * 0.3, off + (R() - 0.5) * u * p.drift * 0.08));
        const lost = (y / lh | 0) % 7 === 0 && R() < p.lines;
        for (let x = 0; x < w; x++) { const i = y * w + x; if (lost) continue; const v = sample(m, w, h, x - off, y); out[i] = v + (g[i] - 0.5) * p.noise * 1.4 > 0.5 ? 1 : (g[i] > 1 - p.noise * 0.01 ? 1 : 0); }
      }
      return out;
    } },
  misregister: { name: 'Misregister', family: 'Shredded', params: [['offset', 'Offset', 45], ['outline', 'Outline', 0], ['angle', 'Angle', 30]],
    run(m, w, h, p, R, u) {
      const a = (p.angle - 0.5) * Math.PI * 1.2 + R() * 0.4, d = u * p.offset * 0.2, dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      const inner = blur(m, w, h, u * (0.004 + p.outline * 0.02)), second = new Float32Array(m.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = sample(m, w, h, x - dx, y - dy), vi = sample(inner, w, h, x - dx, y - dy);
        second[y * w + x] = p.outline > 0.05 ? (v > 0.5 && vi < 0.5 + p.outline * 0.45 ? 1 : 0) : v;
      }
      return { layers: [{ mask: second, ink: 2 }, { mask: m, ink: 1 }] };
    } },
};
for (const t of Object.values(TREATMENTS)) t.params = t.params.map(([key, label, value]) => ({ key, label, value }));

// run a chain of steps [{type, values:{key:0..100}}] on a mask; returns layers [{mask, ink}]
export function apply(mask, w, h, steps, seed, u) {
  let layers = [{ mask, ink: 1 }];
  steps.forEach((step, n) => {
    const t = TREATMENTS[step.type]; if (!t) return;
    const p = {}; for (const q of t.params) p[q.key] = (step.values?.[q.key] ?? q.value) / 100;
    const next = [];
    layers.forEach((layer, k) => {
      const r = t.run(layer.mask, w, h, p, rng(seed * 7919 + n * 104729 + k * 31), u);
      if (r.layers) for (const l of r.layers) next.push({ mask: l.mask, ink: layer.ink === 2 ? 2 : l.ink });
      else next.push({ mask: r, ink: layer.ink });
    });
    layers = next;
  });
  return layers;
}
