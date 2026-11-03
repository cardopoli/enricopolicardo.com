// Lingo - pure logic: answer checking, spaced review, lesson building.
// No DOM here, so it can be tested with `node --test tests/lingo.test.mjs`.

export const LANGS = { it: { name: 'Italiano', voice: 'it-IT', other: 'en' }, en: { name: 'English', voice: 'en-GB', other: 'it' } };
// days until an item comes back, by box (0 = new / just failed)
export const INTERVALS = [0, 1, 3, 7, 16, 35, 90];
export const DAY = 86400000;

// "a|b" -> ["a","b"]; first is the one shown
export const options = text => String(text || '').split('|').map(s => s.trim()).filter(Boolean);
export const shown = text => options(text)[0] || '';

const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export function normalise(text, { accents = true } = {}) {
  let s = String(text || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[.,!?¿¡;:"«»()…]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!accents) s = stripAccents(s);
  return s;
}
// { ok, close, expected }  close = right apart from accents
export function check(answer, accepted) {
  const list = options(accepted), a = normalise(answer);
  if (!a) return { ok: false, close: false, expected: list[0] || '' };
  for (const x of list) if (normalise(x) === a) return { ok: true, close: false, expected: x };
  const bare = normalise(answer, { accents: false });
  for (const x of list) if (normalise(x, { accents: false }) === bare) return { ok: true, close: true, expected: x };
  return { ok: false, close: false, expected: list[0] || '' };
}

export const words = text => normalise(shown(text)).split(' ').filter(Boolean);
// display tokens keep the original spelling ("dov'è", "Enrico")
export const tiles = text => shown(text).replace(/[.,!?¿¡;:"«»()…]/g, ' ').split(/\s+/).filter(Boolean);

// a stable key for an item, independent of its position in the file
export function itemKey(moduleId, item) { return moduleId + '::' + normalise(shown(item.en)) + '::' + normalise(shown(item.it)); }

export function today(now = Date.now()) { const d = new Date(now); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// after an answer: right -> up a box, wrong -> back to box 0, due again soon
export function review(state = {}, correct, now = Date.now()) {
  const box = correct ? Math.min((state.box ?? 0) + 1, INTERVALS.length - 1) : 0;
  const wait = correct ? INTERVALS[box] * DAY : 10 * 60000;
  return { box, due: now + wait, seen: (state.seen || 0) + 1, wrong: (state.wrong || 0) + (correct ? 0 : 1) };
}
export const mastered = s => !!s && s.box >= 4;

// seeded shuffle so a lesson can be replayed in tests
export function rng(seed = Date.now()) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
export function shuffle(list, rand = Math.random) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// course 'it' = learning Italian (prompt in English), 'en' = learning English
export function sides(item, course) { const from = LANGS[course].other; return { prompt: item[from], answer: item[course], from, to: course }; }

export function moduleStats(module, progress, now = Date.now()) {
  let seen = 0, done = 0, due = 0;
  for (const item of module.items) { const s = progress[itemKey(module.id, item)]; if (s) { seen++; if (mastered(s)) done++; if (s.due <= now) due++; } }
  return { total: module.items.length, seen, mastered: done, due };
}

// pick what a lesson covers: due reviews first, then up to `fresh` new items
export function pickItems(pool, progress, { now = Date.now(), size = 8, fresh = 4, rand = Math.random } = {}) {
  const tag = ({ module, item }) => ({ module, item, key: itemKey(module.id, item), state: progress[itemKey(module.id, item)] });
  const all = pool.map(tag);
  const due = shuffle(all.filter(x => x.state && x.state.due <= now), rand).sort((a, b) => (a.state.box - b.state.box));
  const unseen = all.filter(x => !x.state);   // keep file order: modules are written easiest first
  const picked = [...due.slice(0, size)];
  for (const x of unseen) { if (picked.length >= size || picked.filter(p => !p.state).length >= fresh) break; picked.push(x); }
  if (picked.length < Math.min(4, all.length)) {   // nothing due and nothing new: practise the weakest
    const rest = shuffle(all.filter(x => !picked.includes(x)), rand).sort((a, b) => ((a.state?.box ?? 0) - (b.state?.box ?? 0)));
    picked.push(...rest.slice(0, Math.min(size, all.length) - picked.length));
  }
  return picked;
}

// turn picked items into exercises
export function buildLesson(picked, pool, course, rand = Math.random) {
  const others = (x, n, side) => shuffle(pool.filter(p => shown(p.item[side]) !== shown(x.item[side])), rand).slice(0, n).map(p => p.item[side]);
  const steps = [];
  const fresh = picked.filter(x => !x.state);
  for (const x of fresh) steps.push({ type: 'intro', ...x });
  const kinds = ['choose', 'listen', 'build', 'type', 'reverse'];
  picked.forEach((x, i) => {
    const s = sides(x.item, course), multi = tiles(s.answer).length >= 2;
    let kind = x.state ? kinds[(i + (x.state.box || 0)) % kinds.length] : (i % 2 ? 'listen' : 'choose');
    if (kind === 'build' && !multi) kind = 'type';
    if (kind === 'type' && !x.state) kind = 'choose';
    const step = { type: kind, ...x };
    if (kind === 'choose' || kind === 'listen') step.choices = shuffle([s.answer, ...others(x, 3, course)], rand);
    if (kind === 'reverse') step.choices = shuffle([s.prompt, ...others(x, 3, s.from)], rand);
    if (kind === 'build') {
      const extra = shuffle(pool.flatMap(p => tiles(p.item[course])).filter(w => !words(s.answer).includes(normalise(w))), rand);
      step.tiles = shuffle([...tiles(s.answer), ...[...new Set(extra)].slice(0, 3)], rand);
    }
    steps.push(step);
  });
  if (picked.length >= 4) {
    const pairs = shuffle(picked, rand).slice(0, 5);
    steps.splice(Math.min(steps.length, fresh.length + 3), 0, { type: 'match', pairs });
  }
  return steps;
}

export function validModules(data) {
  const list = Array.isArray(data?.modules) ? data.modules : [];
  return list.filter(m => m && typeof m.id === 'string' && Array.isArray(m.items))
    .map(m => ({ ...m, items: m.items.filter(i => i && shown(i.en) && shown(i.it)) }))
    .filter(m => m.items.length && !m.hidden);
}
