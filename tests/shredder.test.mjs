import test from 'node:test'; import assert from 'node:assert/strict';
import { TREATMENTS, apply, blur, noise, rng } from '../assets/js/shredder/fx.mjs';
// a simple "letter": a filled rectangle in a 160x80 field, u = 60px
const w = 160, h = 80, u = 60, mask = new Float32Array(w * h);
for (let y = 15; y < 65; y++) for (let x = 30; x < 130; x++) mask[y * w + x] = 1;
const inRange = a => a.every(v => v >= 0 && v <= 1 && !Number.isNaN(v));

test('every treatment returns a valid ink mask, and the same seed gives the same result', () => {
  for (const key of Object.keys(TREATMENTS)) {
    const a = apply(mask, w, h, [{ type: key, values: {} }], 42, u), b = apply(mask, w, h, [{ type: key, values: {} }], 42, u);
    assert.ok(a.length >= 1, key);
    for (const [i, L] of a.entries()) { assert.equal(L.mask.length, w * h, key); assert.ok(inRange(L.mask), key + ' out of range'); assert.deepEqual(L.mask, b[i].mask, key + ' not repeatable'); }
    const ink = a.reduce((s, L) => s + L.mask.reduce((t, v) => t + v, 0), 0);
    assert.ok(ink > 200, key + ' wiped the type out');
  }
});
test('a different seed gives a different take', () => {
  const a = apply(mask, w, h, [{ type: 'photocopy', values: {} }], 1, u)[0].mask, b = apply(mask, w, h, [{ type: 'photocopy', values: {} }], 2, u)[0].mask;
  assert.notDeepEqual(a, b);
});
test('effects chain, and misregister adds a second ink', () => {
  const layers = apply(mask, w, h, [{ type: 'photocopy', values: {} }, { type: 'misregister', values: {} }], 3, u);
  assert.deepEqual(layers.map(l => l.ink).sort(), [1, 2]);
});
test('blur keeps the total ink and noise stays in 0..1', () => {
  const b = blur(mask, w, h, 4), sum = a => a.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum(b) - sum(mask)) / sum(mask) < 0.05);
  assert.ok(inRange(noise(w, h, 12, rng(5), 3)));
});
