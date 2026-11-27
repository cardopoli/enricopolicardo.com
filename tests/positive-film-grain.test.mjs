import test from 'node:test';
import assert from 'node:assert/strict';
import {plan, grainBW, addDigital, STOCKS} from '../assets/js/positive-film/grain.js';

// Kodak measures the negative: density spread through a 48 µm aperture at density 1.0.
function negativeRms(long) {
  const w = long, h = Math.round(long * 2 / 3), p = plan('tri-x', 400, w, h, {}), pitch = 36000 / long, ap = Math.round(Math.sqrt(Math.PI) * 24 / pitch);
  const printed = p.sigmaD; p.sigmaD = printed / 2.0; // undo the paper step to read the negative
  const D = [];
  for (let y0 = 0; y0 + ap < h; y0 += ap) for (let x0 = 0; x0 + ap < w; x0 += ap) {
    let s = 0; for (let y = y0; y < y0 + ap; y++) for (let x = x0; x < x0 + ap; x++) s += grainBW(p, y * w + x, 0.1);
    D.push(-Math.log10(s / (ap * ap)));
  }
  const m = D.reduce((a, b) => a + b) / D.length;
  return 1000 * Math.sqrt(D.reduce((a, b) => a + (b - m) ** 2, 0) / D.length);
}
test('Tri-X matches its datasheet granularity (RMS 17)', () => {
  const r = negativeRms(5000);
  assert.ok(Math.abs(r - STOCKS['tri-x'].rms) < 1.5, `measured ${r}`);
});
test('grain fades into clean whites and solid blacks', () => {
  const p = plan('tri-x', 400, 2000, 1333, {});
  const spread = Y => { let s = 0; for (let i = 0; i < 5000; i++) s += (grainBW(p, i, Y) - Y) ** 2; return Math.sqrt(s / 5000); };
  assert.ok(spread(0.45) > 3 * spread(0.995));
  assert.ok(spread(0.45) > 3 * spread(0.002));
});
test('higher ISO, more grain', () => {
  const a = plan('tri-x', 400, 1500, 1000, {}), b = plan('tri-x', 1600, 1500, 1000, {});
  assert.ok(b.sigmaD > a.sigmaD * 1.3);
});
test('digital: nothing added at the ISO it was shot at, noise above it', () => {
  const meta = {iso: 400, make: 'RICOH', model: 'GR', nativeLong: 4928};
  for (const [iso, adds] of [[400, false], [100, false], [3200, true]]) {
    const p = plan('positive-film', iso, 300, 200, meta), d = new Float32Array(300 * 200 * 3).fill(0.2);
    addDigital(p, d);
    const base = Math.fround(0.2);
    assert.equal(d.some(v => v !== base), adds, `ISO ${iso}`);
  }
});
test('off means off', () => assert.equal(plan('tri-x', 'off', 100, 100, {}), null));
