import test from 'node:test';
import assert from 'node:assert/strict';
import { tracePath, toSVG } from '../assets/js/shredder/trace.mjs';
const grid = rows => { const h = rows.length, w = rows[0].length, m = new Uint8Array(w * h); rows.forEach((r, y) => [...r].forEach((c, x) => { m[y * w + x] = c === '#' ? 1 : 0; })); return { m, w, h }; };
// fill the traced path back into pixels (even-odd, pixel centres) and compare
function raster(d, w, h) {
  const polys = d.split('z').filter(Boolean).map(p => { const pts = []; let x = 0, y = 0;
    for (const [, c, a, b] of p.matchAll(/([Mhv])(-?\d+)(?: (-?\d+))?/g)) { if (c === 'M') { x = +a; y = +b; } else if (c === 'h') x += +a; else y += +a; pts.push([x, y]); } return pts; });
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let inside = false; const cx = x + .5, cy = y + .5;
    for (const P of polys) for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > cy) !== (yj > cy) && cx < xi + (xj - xi) * (cy - yi) / (yj - yi)) inside = !inside; }
    m[y * w + x] = inside ? 1 : 0; }
  return m;
}
test('outlines reproduce the pixels exactly, holes and touching corners included', () => {
  const cases = [
    ['....', '.##.', '.##.', '....'],
    ['#####', '#...#', '#.#.#', '#...#', '#####'],
    ['##..', '##..', '..##', '..##'],          // two squares touching at a corner
    ['#.#.', '.#.#', '#.#.', '.#.#'],          // checkerboard
    ['.###.', '##.##', '#...#', '##.##', '.###.']
  ];
  for (const rows of cases) { const { m, w, h } = grid(rows); assert.deepEqual([...raster(tracePath(m, w, h, { minArea: 0 }), w, h)], [...m], rows.join('/')); }
});
test('random grit traces exactly and specks can be dropped', () => {
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const w = 60, h = 40, m = new Float32Array(w * h).map(() => r());
  const exact = raster(tracePath(m, w, h, { minArea: 0 }), w, h);
  assert.deepEqual([...exact], [...m].map(v => v > .5 ? 1 : 0));
  assert.ok(tracePath(m, w, h, { minArea: 3 }).length < tracePath(m, w, h, { minArea: 0 }).length);
});
test('svg has one path per ink and the paper', () => {
  const { m, w, h } = grid(['.##.', '.##.']);
  const svg = toSVG([{ mask: m, ink: 2 }, { mask: m, ink: 1 }], w, h, { inks: { 1: '#111111', 2: '#e8402c' }, paper: '#f2efe8', outWidth: 400 });
  assert.match(svg, /width="400" height="200" viewBox="0 0 4 2"/);
  assert.equal(svg.match(/<path /g).length, 2); assert.match(svg, /<rect/);
});
