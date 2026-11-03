// Lingo - the screens. Logic lives in core.mjs; modules in data/lingo/modules.json.
import { LANGS, shown, check, tiles, itemKey, today, review, mastered, rng, shuffle, sides, moduleStats, pickItems, buildLesson, validModules } from './core.mjs';

const $ = id => document.getElementById(id);
const KEY = 'ep-lingo-v1', GOAL = 30;
const T = {   // interface text, in the learner's own language
  en: { lead: 'A few minutes a day. New words first, then practice, and each word comes back just before you would forget it.', start: 'Start lesson', review: 'Review', practise: 'Practise', modules: 'Modules', streak: 'day streak', today: 'XP today', learnt: 'words learnt',
    words: n => n + ' words', mastered: n => n + ' learnt', due: n => n + ' to review', newWords: n => n + ' new', check: 'Check', next: 'Continue', skip: 'Skip', tools: 'Tools',
    new: 'New word', choose: 'Choose the translation', listen: 'What do you hear?', build: 'Build the sentence', type: 'Type it', reverse: 'What does this mean?', match: 'Match the pairs',
    right: 'Right', close: 'Right - watch the accents', wrong: 'Not quite', answer: 'Answer:', done: 'Lesson done', doneSub: (xp, ok, n) => `${xp} XP · ${ok} of ${n} right first time`,
    again: 'Another lesson', home: 'Back to modules', reset: 'Reset progress for this course', resetAsk: 'Reset all progress for this course?', foot: 'Progress is saved in this browser. For the most natural voice on iPhone: Settings > Accessibility > Read & Speak > Voices (Spoken Content on older iOS), then download an Enhanced Italian and an Enhanced English voice.',
    hearIt: 'Play sound', typeHere: 'Type in Italian', quit: 'Leave the lesson? Progress so far is kept.', loadFail: 'The modules could not load. Check your connection and refresh.' },
  it: { lead: 'Pochi minuti al giorno. Prima le parole nuove, poi la pratica, e ogni parola torna appena prima di dimenticarla.', start: 'Inizia la lezione', review: 'Ripassa', practise: 'Esercitati', modules: 'Moduli', streak: 'giorni di fila', today: 'XP oggi', learnt: 'parole imparate',
    words: n => n + ' parole', mastered: n => n + ' imparate', due: n => n + ' da ripassare', newWords: n => n + ' nuove', check: 'Verifica', next: 'Continua', skip: 'Salta', tools: 'Strumenti',
    new: 'Parola nuova', choose: 'Scegli la traduzione', listen: 'Cosa senti?', build: 'Componi la frase', type: 'Scrivilo', reverse: 'Cosa vuol dire?', match: 'Abbina le coppie',
    right: 'Giusto', close: 'Giusto - attenzione agli accenti', wrong: 'Non proprio', answer: 'Risposta:', done: 'Lezione finita', doneSub: (xp, ok, n) => `${xp} XP · ${ok} su ${n} giuste al primo colpo`,
    again: 'Un\'altra lezione', home: 'Torna ai moduli', reset: 'Azzera i progressi di questo corso', resetAsk: 'Azzerare tutti i progressi di questo corso?', foot: 'I progressi restano in questo browser. Per la voce più naturale su iPhone: in Impostazioni > Accessibilità, apri la sezione della lettura ad alta voce, poi Voci, e scarica una voce inglese e una italiana di qualità migliorata.',
    hearIt: 'Ascolta', typeHere: 'Scrivi in inglese', quit: 'Uscire dalla lezione? I progressi fatti restano.', loadFail: 'Non è stato possibile caricare i moduli. Controlla la connessione e ricarica.' }
};

// ---- saved progress ------------------------------------------------------------
const blank = () => ({ course: 'it', courses: { it: { items: {}, days: {} }, en: { items: {}, days: {} } } });
let store = blank();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.courses) store = { ...blank(), ...s, courses: { ...blank().courses, ...s.courses } }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
const course = () => store.course;
const ui = () => T[LANGS[course()].other];
const C = () => store.courses[course()];

function streak() {
  const days = C().days; let n = 0, d = new Date();
  if (!days[today(d)]) d.setDate(d.getDate() - 1);   // today not done yet doesn't break the streak
  while (days[today(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---- speech ------------------------------------------------------------------
let voices = [];
const loadVoices = () => { voices = speechSynthesis?.getVoices?.() || []; };
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.addEventListener?.('voiceschanged', loadVoices); }
// the most natural voice this device has: neural / enhanced / premium first, then the exact accent
function bestVoice(lang, code) {
  const mine = voices.filter(v => (v.lang || '').replace('_', '-').toLowerCase().startsWith(lang));
  const score = v => {
    const n = (v.name || '').toLowerCase(), l = (v.lang || '').replace('_', '-');
    return (/premium|enhanced|neural|natural|siri/.test(n) ? 8 : 0) + (/google|microsoft/.test(n) ? 4 : 0) + (l === code ? 2 : 0) + (v.localService ? 1 : 0)
      - (/compact|eloquence|novelty|whisper|bad news|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|wobble|zarvox|albert|bahh|fred|junior|kathy|ralph/.test(n) ? 10 : 0);
  };
  return mine.sort((a, b) => score(b) - score(a))[0] || null;
}
function speak(text, lang) {
  if (!('speechSynthesis' in window) || !text) return;
  const u = new SpeechSynthesisUtterance(shown(text)), code = LANGS[lang].voice;
  u.lang = code; u.rate = 0.92;
  const v = bestVoice(lang, code);
  if (v) u.voice = v;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/></svg>';
function sayButton(text, lang, big = false) {
  const b = el('button', 'say' + (big ? ' big' : '')); b.type = 'button'; b.innerHTML = SPEAKER;
  b.setAttribute('aria-label', ui().hearIt); b.addEventListener('click', () => speak(text, lang)); return b;
}

// ---- small DOM helpers ------------------------------------------------------------
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// ---- home ------------------------------------------------------------------------
let modules = [];
const modTitle = m => (LANGS[course()].other === 'it' ? m.title_it : m.title_en) || m.title_en || m.id;
function drawHome() {
  const t = ui(), c = C(), now = Date.now();
  document.documentElement.lang = LANGS[course()].other === 'it' ? 'it' : 'en-GB';
  $('course-it').setAttribute('aria-pressed', String(course() === 'it'));
  $('course-en').setAttribute('aria-pressed', String(course() === 'en'));
  $('title').textContent = LANGS[course()].name;
  $('lead').textContent = t.lead;
  document.querySelectorAll('[data-t]').forEach(n => { const v = t[n.dataset.t]; if (typeof v === 'string') n.textContent = v; });
  const xp = c.days[today()] || 0;
  $('streak').textContent = streak(); $('today-xp').textContent = xp; $('goal').style.width = Math.min(100, xp / GOAL * 100) + '%';
  $('words').textContent = Object.values(c.items).filter(mastered).length;
  let due = 0, fresh = 0;
  const list = $('mods'); list.replaceChildren();
  for (const m of modules) {
    const s = moduleStats(m, c.items, now); due += s.due; fresh += s.total - s.seen;
    const li = el('li'), b = el('button', 'mod'); b.type = 'button';
    const tx = el('span', 't'); tx.append(el('span', null, modTitle(m)), el('small', null, [t.words(s.total), s.mastered ? t.mastered(s.mastered) : ''].filter(Boolean).join(' · ')));
    const bar = el('span', 'bar'), fill = el('i'); fill.style.width = (s.mastered / s.total * 100) + '%'; bar.append(fill);
    b.append(tx); if (s.due) { const d = el('span', 'due', String(s.due)); d.title = t.due(s.due); b.append(d); } b.append(bar);
    b.addEventListener('click', () => startLesson([m]));
    li.append(b); list.append(li);
  }
  $('start-label').textContent = due ? t.review : fresh ? t.start : t.practise;
  $('start-sub').textContent = [due ? t.due(due) : '', fresh ? t.newWords(Math.min(fresh, 4)) : ''].filter(Boolean).join(' · ');
  const f = $('foot'); f.replaceChildren(el('span', null, t.foot + ' '));
  const r = el('button', null, t.reset); r.type = 'button';
  r.addEventListener('click', () => { if (confirm(t.resetAsk)) { store.courses[course()] = { items: {}, days: {} }; save(); drawHome(); } });
  f.append(r);
}
$('course-it').addEventListener('click', () => { store.course = 'it'; save(); drawHome(); });
$('course-en').addEventListener('click', () => { store.course = 'en'; save(); drawHome(); });
$('start').addEventListener('click', () => startLesson(modules));

// ---- lesson ----------------------------------------------------------------------
let steps = [], at = 0, pending = null, firstTry = new Map(), gained = 0, total = 0, answered = false;
const poolFrom = mods => mods.flatMap(m => m.items.map(item => ({ module: m, item })));

function startLesson(mods) {
  const c = C(), rand = rng();
  const pool = poolFrom(mods), all = poolFrom(modules);
  const picked = pickItems(pool, c.items, { rand });
  if (!picked.length) return;
  steps = buildLesson(picked, all, course(), rand);
  at = 0; firstTry = new Map(); gained = 0; total = picked.length;
  $('home').hidden = true; $('lesson').hidden = false; document.body.style.overflow = 'hidden';
  show();
}
function endLesson() { $('lesson').hidden = true; $('home').hidden = false; document.body.style.overflow = ''; speechSynthesis?.cancel?.(); drawHome(); scrollTo(0, 0); }
$('quit').addEventListener('click', () => { if (at === 0 || at >= steps.length || confirm(ui().quit)) endLesson(); });

function setFoot(state, title = '', detail = '') {
  const f = $('lfoot'); f.classList.toggle('good', state === 'good'); f.classList.toggle('miss', state === 'miss');
  const fb = $('feedback'); fb.replaceChildren();
  if (title) { fb.append(el('b', null, title)); if (detail) fb.append(el('small', null, detail)); }
}
function ready(ok) { $('check').disabled = !ok; }

function show() {
  const t = ui(), stage = $('stage');
  $('bar').style.width = (at / steps.length * 100) + '%';
  stage.replaceChildren(); setFoot(''); answered = false; pending = null;
  $('skip').hidden = true; $('check').textContent = t.check; ready(false);
  if (at >= steps.length) return finish();
  const s = steps[at], to = course();
  if (s.type === 'match') return drawMatch(s);
  const { prompt, answer, from } = sides(s.item, to);
  if (s.type === 'intro') {
    stage.append(el('p', 'kicker', t.new));
    const card = el('div', 'intro-card'), p = el('div', 'prompt');
    p.append(el('span', null, shown(answer)), sayButton(answer, to)); card.append(p, el('p', 'other', shown(prompt)));
    if (s.item.note) card.append(el('p', 'note', s.item.note));
    stage.append(card); speak(answer, to);
    $('check').textContent = t.next; ready(true); pending = () => true; return;
  }
  stage.append(el('p', 'kicker', t[s.type]));
  if (s.type === 'listen') { stage.append(sayButton(answer, to, true)); setTimeout(() => speak(answer, to), 250); }
  else {
    const p = el('div', 'prompt'), text = s.type === 'reverse' ? answer : prompt;
    p.append(el('span', null, shown(text)));
    if (s.type === 'reverse') p.append(sayButton(answer, to));
    stage.append(p);
  }
  if (s.type === 'choose' || s.type === 'listen' || s.type === 'reverse') {
    const target = s.type === 'reverse' ? prompt : answer, box = el('div', 'choices'); let picked = null;
    for (const c of s.choices) {
      const b = el('button', 'choice', shown(c)); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { if (answered) return; box.querySelectorAll('.choice').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); picked = { c, b }; ready(true); if (s.type !== 'reverse') speak(c, to); });
      box.append(b);
    }
    stage.append(box);
    pending = () => { const ok = shown(picked.c) === shown(target); picked.b.classList.add(ok ? 'right' : 'wrong'); if (!ok) [...box.children].find(b => b.textContent === shown(target))?.classList.add('right'); return { ok, expected: target }; };
  }
  if (s.type === 'build') {
    const line = el('div', 'answer-line'), bank = el('div', 'bank'), chosen = [];
    const redraw = () => { line.replaceChildren(...chosen.map(c => { const b = el('button', 'tile', c.w); b.type = 'button'; b.addEventListener('click', () => { if (answered) return; c.src.classList.remove('used'); c.src.disabled = false; chosen.splice(chosen.indexOf(c), 1); redraw(); }); return b; })); ready(chosen.length > 0); };
    for (const w of s.tiles) { const b = el('button', 'tile', w); b.type = 'button'; b.addEventListener('click', () => { if (answered || b.disabled) return; chosen.push({ w, src: b }); b.classList.add('used'); b.disabled = true; redraw(); }); bank.append(b); }
    stage.append(line, bank);
    pending = () => check(chosen.map(c => c.w).join(' '), answer);
  }
  if (s.type === 'type') {
    const input = el('input', 'typed'); input.type = 'text'; input.autocomplete = 'off'; input.autocapitalize = 'off'; input.spellcheck = false;
    input.setAttribute('autocorrect', 'off'); input.placeholder = t.typeHere; input.lang = to === 'it' ? 'it' : 'en';
    input.addEventListener('input', () => ready(input.value.trim().length > 0));
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('check').disabled) { e.preventDefault(); $('check').click(); } });
    stage.append(input);
    if (to === 'it') { const acc = el('div', 'accents'); for (const ch of 'àèéìòù') { const b = el('button', null, ch); b.type = 'button'; b.addEventListener('click', () => { const i = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, i) + ch + input.value.slice(input.selectionEnd ?? i); input.focus(); input.setSelectionRange(i + 1, i + 1); ready(true); }); acc.append(b); } stage.append(acc); }
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    pending = () => check(input.value, answer);
  }
  $('skip').hidden = s.type !== 'listen' && s.type !== 'type'; $('skip').textContent = t.skip;
}

function drawMatch(s) {
  const t = ui(), to = course(), stage = $('stage');
  stage.append(el('p', 'kicker', t.match));
  const grid = el('div', 'match'), left = el('div', 'col'), right = el('div', 'col');
  let sel = null, left_ = s.pairs.length, mistakes = 0;
  const pick = (b, side, p) => {
    if (b.classList.contains('done')) return;
    if (!sel || sel.side === side) { grid.querySelectorAll('.choice').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); sel = { b, side, p }; if (side === 'to') speak(p.item[to], to); return; }
    if (sel.p === p) { for (const x of [sel.b, b]) { x.classList.add('right'); setTimeout(() => x.classList.add('done'), 220); } left_--; if (side === 'to') speak(p.item[to], to); }
    else { mistakes++; for (const x of [sel.b, b]) { x.classList.add('wrong'); setTimeout(() => x.classList.remove('wrong'), 450); } }
    grid.querySelectorAll('.choice').forEach(x => x.setAttribute('aria-pressed', 'false')); sel = null;
    if (!left_) { gained += Math.max(1, s.pairs.length - mistakes); setFoot('good', t.right); $('check').textContent = t.next; ready(true); answered = true; pending = null; }
  };
  for (const p of shuffle(s.pairs)) { const b = el('button', 'choice', shown(p.item[LANGS[to].other])); b.type = 'button'; b.addEventListener('click', () => pick(b, 'from', p)); left.append(b); }
  for (const p of shuffle(s.pairs)) { const b = el('button', 'choice', shown(p.item[to])); b.type = 'button'; b.addEventListener('click', () => pick(b, 'to', p)); right.append(b); }
  grid.append(left, right); stage.append(grid);
}

function grade(result) {
  const t = ui(), s = steps[at], to = course(), c = C();
  if (s.type === 'intro') { at++; return show(); }
  const ok = result.ok, key = s.key;
  if (!firstTry.has(key)) { firstTry.set(key, ok); c.items[key] = review(c.items[key], ok); if (ok) gained += 2; save(); }
  if (ok) setFoot('good', result.close ? t.close : t.right, result.close ? t.answer + ' ' + shown(result.expected) : (shown(s.item[to]) + ' · ' + shown(s.item[LANGS[to].other])));
  else {
    setFoot('miss', t.wrong, t.answer + ' ' + shown(result.expected));
    // try it once more at the end of the lesson, choices reshuffled
    if (!s.retry) steps.push({ ...s, retry: true, choices: s.choices && shuffle(s.choices), tiles: s.tiles && shuffle(s.tiles) });
  }
  if (s.type !== 'reverse') speak(s.item[to], to);
  answered = true; $('skip').hidden = true; $('check').textContent = t.next; ready(true);
  $('stage').querySelectorAll('input,.tile').forEach(x => x.disabled = true);
}
$('check').addEventListener('click', () => {
  if (at >= steps.length) return;
  if (answered || !pending) { at++; return show(); }
  const r = pending(); if (r === true) { at++; return show(); }
  grade(r);
});
$('skip').addEventListener('click', () => { if (!answered) grade({ ok: false, expected: steps[at].item[course()] }); });
addEventListener('keydown', e => { if ($('lesson').hidden) return; if (e.key === 'Escape') $('quit').click(); else if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && !$('check').disabled) { e.preventDefault(); $('check').click(); } });

function finish() {
  const t = ui(), c = C(), ok = [...firstTry.values()].filter(Boolean).length;
  c.days[today()] = (c.days[today()] || 0) + gained; save();
  $('bar').style.width = '100%';
  const box = el('div', 'done-screen');
  box.append(el('p', 'kicker', streak() + ' ' + t.streak), el('h2', null, t.done), el('p', 'lead', t.doneSub(gained, ok, firstTry.size)));
  const again = el('button', 'go'); again.type = 'button';
  again.innerHTML = '<span class="disc"><svg viewBox="0 0 24 24" fill="#0e0e0e" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>';
  again.append(el('span', null, t.again)); again.addEventListener('click', () => startLesson(modules));
  box.append(again);
  $('stage').replaceChildren(box); setFoot('');
  $('check').textContent = t.home; ready(true); $('skip').hidden = true;
  $('check').onclick = () => { $('check').onclick = null; endLesson(); };
}

// ---- go --------------------------------------------------------------------------
(async () => {
  try {
    const r = await fetch('../data/lingo/modules.json', { cache: 'no-cache' });
    if (!r.ok) throw Error(r.status);
    modules = validModules(await r.json());
  } catch { $('lead').textContent = ui().loadFail; }
  drawHome();
})();
