import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { check, normalise, review, INTERVALS, DAY, pickItems, buildLesson, validModules, itemKey, rng, tiles, shown, moduleStats } from '../assets/js/lingo/core.mjs';
const data = JSON.parse(readFileSync(new URL('../data/lingo/modules.json', import.meta.url)));

test('answers: alternatives, case, punctuation, apostrophes', () => {
  assert.equal(check('Ciao', 'ciao|salve').ok, true);
  assert.equal(check('salve!', 'ciao|salve').ok, true);
  assert.equal(check('dov’è la stazione', "dov'è la stazione?").ok, true);
  assert.equal(check('  Come   STA ', 'come stai?|come sta?').ok, true);
  assert.equal(check('arrivederla', 'arrivederci|ciao').ok, false);
  assert.equal(check('', 'sì').ok, false);
});
test('missing accents count as right but are flagged', () => {
  const r = check('un caffe, per favore', 'un caffè, per favore'); assert.equal(r.ok, true); assert.equal(r.close, true);
  assert.equal(check('lunedì', 'lunedì').close, false);
});
test('spaced review: right moves up, wrong drops back and returns soon', () => {
  const now = 1e12; let s = review(undefined, true, now); assert.equal(s.box, 1); assert.equal(s.due, now + INTERVALS[1] * DAY);
  s = review(s, true, now); assert.equal(s.box, 2);
  s = review(s, false, now); assert.equal(s.box, 0); assert.ok(s.due - now < DAY); assert.equal(s.wrong, 1);
  let top = {}; for (let i = 0; i < 20; i++) top = review(top, true, now); assert.equal(top.box, INTERVALS.length - 1);
});
test('modules file is valid and every item has both languages', () => {
  const mods = validModules(data); assert.ok(mods.length >= 6);
  const ids = new Set(); for (const m of mods) { assert.ok(!ids.has(m.id), 'duplicate id ' + m.id); ids.add(m.id); assert.ok(m.title_en && m.title_it); for (const i of m.items) { assert.ok(shown(i.en)); assert.ok(shown(i.it)); } }
  const keys = mods.flatMap(m => m.items.map(i => itemKey(m.id, i))); assert.equal(new Set(keys).size, keys.length, 'duplicate items');
});
test('a first lesson introduces at most 4 new words, then reviews come first', () => {
  const mods = validModules(data), pool = mods.flatMap(m => m.items.map(item => ({ module: m, item })));
  const first = pickItems(pool, {}, { rand: rng(1) }); assert.equal(first.length, 4); assert.ok(first.every(x => !x.state));
  const now = 1e12, progress = {}; for (const x of first) progress[x.key] = { box: 1, due: now - 1 };
  const second = pickItems(pool, progress, { now, rand: rng(2) });
  assert.deepEqual(second.slice(0, 4).map(x => x.key).sort(), first.map(x => x.key).sort());
});
test('lessons in both directions build valid exercises', () => {
  const mods = validModules(data), pool = mods.flatMap(m => m.items.map(item => ({ module: m, item })));
  for (const course of ['it', 'en']) for (let seed = 1; seed < 40; seed++) {
    const rand = rng(seed), progress = {};
    pool.slice(0, seed % 30).forEach((x, i) => { progress[itemKey(x.module.id, x.item)] = { box: i % 5, due: 0 }; });
    const steps = buildLesson(pickItems(pool, progress, { now: 1, rand }), pool, course, rand);
    assert.ok(steps.length >= 4);
    for (const s of steps) {
      if (s.choices) { assert.equal(s.choices.length, 4); assert.equal(new Set(s.choices.map(shown)).size, 4, 'duplicate choices'); }
      if (s.type === 'choose' || s.type === 'listen') assert.ok(s.choices.includes(s.item[course]));
      if (s.type === 'build') { const need = tiles(s.item[course]); for (const w of need) assert.ok(s.tiles.includes(w)); assert.ok(check(need.join(' '), s.item[course]).ok); }
      if (s.type === 'match') assert.ok(s.pairs.length >= 4 && s.pairs.length <= 5);
    }
  }
});
test('module stats count learnt and due', () => {
  const m = validModules(data)[0], k = itemKey(m.id, m.items[0]);
  const st = moduleStats(m, { [k]: { box: 4, due: 0 } }, 10); assert.equal(st.mastered, 1); assert.equal(st.due, 1); assert.equal(st.total, m.items.length);
});
