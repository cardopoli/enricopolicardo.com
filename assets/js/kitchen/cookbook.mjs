import {recipeFromHtml, normalise, scaleIngredient, bookmarklet} from './recipe.mjs';
import {KitchenDropbox, Archive, authURL, random, challenge, callbackURL, validateCallback} from './dropbox.mjs';

const $ = id => document.getElementById(id);
const KEY = 'cookbook.appKey', AUTH = 'cookbook.auth', PENDING = 'cookbook.pending', INDEX = 'cookbook.index', ADD = 'cookbook.add';
const CHIPS = [['bread', 'Bread'], ['everyday', 'Everyday'], ['vegetarian', 'Vegetarian'], ['favourite', 'Favourite']];
const read = (s, k, d = null) => { try { return JSON.parse(s.getItem(k)) ?? d; } catch { return d; } };
const write = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

let session = read(localStorage, AUTH) || read(sessionStorage, AUTH), db = null, archive = null;
let list = read(localStorage, INDEX, []) ?? [], filter = 'all', current = null, draft = null, serves = null, ticks = {}, lock = null;

function status(msg, bad = false) { const s = $('status'); s.textContent = msg || ''; s.classList.toggle('bad', !!bad); }
const busy = async (msg, fn) => { status(msg); try { const out = await fn(); return out; } catch (e) { status(e.message || String(e), true); throw e; } };
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null)); return e; };
const yieldText = y => /^\d+$/.test(String(y ?? '').trim()) ? `serves ${String(y).trim()}` : (y || '');
const mins = m => !m ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;

function saveSession(s) { const store = s.remember ? localStorage : sessionStorage; write(store, AUTH, s); }

async function connect() {
  const key = $('app-key').value.trim() || read(localStorage, KEY, '');
  if (!/^[A-Za-z0-9_-]{5,100}$/.test(key)) { $('setup').open = true; $('app-key').focus(); throw Error('Add your Dropbox app key in First-time setup, then connect.'); }
  if (!crypto.subtle) throw Error('Open Cookbook over HTTPS to connect Dropbox.');
  write(localStorage, KEY, key);
  const verifier = random(), state = random(), redirect = callbackURL(location.href);
  write(sessionStorage, PENDING, {key, verifier, state, redirect, remember: $('remember').checked, created: Date.now()});
  location.assign(authURL(key, redirect, state, await challenge(verifier)));
}

async function callback() {
  const u = new URL(location.href);
  if (!u.searchParams.has('code') && !u.searchParams.has('error')) return;
  const pending = read(sessionStorage, PENDING); sessionStorage.removeItem(PENDING);
  history.replaceState(null, '', callbackURL(location.href));
  validateCallback(pending, u.searchParams.get('state'));
  if (u.searchParams.has('error')) throw Error('Dropbox connection was cancelled. Connect again when ready.');
  localStorage.removeItem(AUTH); sessionStorage.removeItem(AUTH);
  session = {key: pending.key, remember: pending.remember};
  db = new KitchenDropbox(session, saveSession);
  await db.token({client_id: pending.key, grant_type: 'authorization_code', code: u.searchParams.get('code'), code_verifier: pending.verifier, redirect_uri: pending.redirect});
  localStorage.removeItem(INDEX); list = [];
}

function disconnect() {
  const access = db?.session?.access_token;
  db?.close(); db = null; archive = null; session = null;
  for (const s of [localStorage, sessionStorage]) { s.removeItem(AUTH); s.removeItem(INDEX); s.removeItem(PENDING); }
  for (const k of Object.keys(localStorage)) if (k.startsWith('cookbook.r.')) localStorage.removeItem(k);
  list = []; current = null; draft = null;
  $('app').hidden = true; $('connection').hidden = false;
  status('Disconnected. This browser no longer holds your Dropbox connection or recipe list.');
  if (access) fetch('https://api.dropboxapi.com/2/auth/token/revoke', {method: 'POST', headers: {Authorization: 'Bearer ' + access}, referrerPolicy: 'no-referrer'}).catch(() => {});
}

function show(view) {
  for (const v of ['library', 'add', 'books', 'recipe']) $(v).hidden = v !== view;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view || (view === 'recipe' && b.dataset.view === 'library') ? 'true' : 'false'));
  if (view !== 'recipe') history.replaceState(null, '', callbackURL(location.href));
  window.scrollTo({top: 0});
}

// Library
function drawChips(box, active, onPick, withAll = true) {
  box.replaceChildren();
  const all = withAll ? [['all', 'All'], ...CHIPS] : CHIPS;
  for (const [id, label] of all) {
    const b = el('button', {type: 'button', className: 'chip', textContent: label});
    b.setAttribute('aria-pressed', String(Array.isArray(active) ? active.includes(id) : active === id));
    b.onclick = () => onPick(id);
    box.append(b);
  }
}

function drawLibrary() {
  drawChips($('filters'), filter, id => { filter = id; drawLibrary(); });
  const q = $('search').value.trim().toLowerCase();
  const shown = list.filter(s => (filter === 'all' || (s.tags ?? []).includes(filter)) && (!q || [s.title, s.source, ...(s.tags ?? [])].join(' ').toLowerCase().includes(q)));
  $('count').textContent = list.length ? `${shown.length} of ${list.length} recipe${list.length === 1 ? '' : 's'}` : '';
  $('empty').hidden = list.length > 0;
  const ol = $('recipes'); ol.replaceChildren();
  for (const s of shown) {
    const meta = [s.source, mins(s.total), s.serves ? `serves ${s.serves}` : ''].filter(Boolean).join(' · ');
    const b = el('button', {type: 'button', className: 'row'}, el('span', {className: 'title', textContent: s.title}), el('span', {className: 'meta', textContent: meta}));
    b.onclick = () => open(s.id).catch(() => {});
    ol.append(el('li', {}, b));
  }
}

async function refresh() {
  list = await busy('Loading your recipes…', () => archive.index());
  for (const x of list) { const c = read(localStorage, 'cookbook.r.' + x.id); if (c && (c.updatedAt ?? c.addedAt) !== x.updatedAt) localStorage.removeItem('cookbook.r.' + x.id); }
  write(localStorage, INDEX, list); drawLibrary(); status(list.length ? '' : 'Your Cookbook is empty. Add a recipe to start.');
}

// Recipe view
async function open(id) {
  let r = read(localStorage, 'cookbook.r.' + id);
  if (!r) { r = await busy('Opening recipe…', () => archive.get(id)); write(localStorage, 'cookbook.r.' + id, r); status(''); }
  current = r; serves = r.serves || null; ticks = {};
  drawRecipe(); show('recipe');
  history.replaceState(null, '', callbackURL(location.href) + '#r=' + encodeURIComponent(id));
}

const factor = () => (current?.serves && serves ? serves / current.serves : 1);

function drawRecipe() {
  const r = current;
  $('r-title').textContent = r.title;
  const src = $('r-source'); src.replaceChildren();
  if (r.url) src.append(el('a', {href: r.url, target: '_blank', rel: 'noopener noreferrer', textContent: r.source || 'Original page'}), ' ↗');
  else src.textContent = r.source || '';
  $('r-meta').textContent = [r.times?.prep ? 'prep ' + mins(r.times.prep) : '', r.times?.cook ? 'cook ' + mins(r.times.cook) : '', r.times?.total ? 'total ' + mins(r.times.total) : '', yieldText(r.yield)].filter(Boolean).join(' · ');
  $('r-desc').textContent = r.description || ''; $('r-desc').hidden = !r.description;
  $('scale').hidden = !r.serves;
  $('serves').textContent = serves ?? '';
  const ul = $('r-ingredients'); ul.replaceChildren(...r.ingredients.map(i => el('li', {textContent: scaleIngredient(i, factor())})));
  $('scale-note').hidden = factor() === 1;
  const ol = $('r-steps'); ol.replaceChildren(); let section = null;
  for (const s of r.steps) {
    if (s.section && s.section !== section) { section = s.section; ol.append(el('li', {className: 'section', textContent: section})); }
    ol.append(el('li', {textContent: s.text}));
  }
  $('r-steps-wrap').hidden = !r.steps.length;
  drawChips($('r-tags'), r.tags ?? [], id => toggleTag(id).catch(() => {}), false);
  $('r-notes').value = r.notes || '';
}

async function persist(r, msg = 'Saved.') {
  const out = await busy('Saving to Dropbox…', () => archive.save(r));
  current = out.recipe; list = out.list; write(localStorage, INDEX, list); write(localStorage, 'cookbook.r.' + current.id, current);
  status(msg); return current;
}

async function toggleTag(id) {
  const tags = new Set(current.tags ?? []);
  tags.has(id) ? tags.delete(id) : tags.add(id);
  current = {...current, tags: [...tags]}; drawRecipe();
  await persist(current, 'Tags saved.');
}

// Adding
function preview(r) {
  draft = r;
  $('p-title').textContent = r.title;
  $('p-meta').textContent = [r.source, `${r.ingredients.length} ingredients`, `${r.steps.length} steps`, mins(r.times?.total), yieldText(r.yield)].filter(Boolean).join(' · ');
  $('p-ingredients').replaceChildren(...r.ingredients.slice(0, 8).map(i => el('li', {textContent: i})), ...(r.ingredients.length > 8 ? [el('li', {className: 'more', textContent: `and ${r.ingredients.length - 8} more`})] : []));
  const exists = list.some(s => s.id === r.id);
  $('p-exists').hidden = !exists;
  drawChips($('p-tags'), r.tags, id => { const t = new Set(draft.tags); t.has(id) ? t.delete(id) : t.add(id); draft = {...draft, tags: [...t]}; preview(draft); }, false);
  $('preview').hidden = false;
}

async function fetchLink() {
  const url = $('link').value.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw Error('Paste the full web address of a recipe page, starting with https://');
  $('preview').hidden = true;
  const html = await busy('Dropbox is fetching the page… this can take up to a minute.', () => archive.fetchPage(url));
  const r = recipeFromHtml(html, url);
  status('Found it. Check the details, then save.'); preview(r);
}

function takeHandoff() {
  const m = /^#add=(.+)$/.exec(location.hash);
  if (m) { write(sessionStorage, ADD, m[1]); history.replaceState(null, '', callbackURL(location.href)); }
  const pending = read(sessionStorage, ADD) ?? (sessionStorage.getItem(ADD) || null);
  return typeof pending === 'string' ? pending : null;
}

function useHandoff(raw) {
  sessionStorage.removeItem(ADD);
  const payload = JSON.parse(decodeURIComponent(raw));
  const r = normalise(payload.recipe, payload.url);
  show('add'); $('link').value = payload.url || ''; preview(r);
  status('Recipe received from the bookmarklet. Check the details, then save.');
}

// Kitchen mode
async function wake() { try { if ('wakeLock' in navigator) { lock = await navigator.wakeLock.request('screen'); $('k-wake').textContent = 'Screen stays on'; } } catch { $('k-wake').textContent = ''; } }
function kitchen() {
  const r = current, items = [...r.ingredients.map((t, i) => ({k: 'i' + i, text: scaleIngredient(t, factor()), kind: 'ing'})), ...r.steps.map((s, i) => ({k: 's' + i, text: s.text, kind: 'step', n: i + 1}))];
  $('k-title').textContent = r.title + (factor() !== 1 ? ` · serves ${serves}` : '');
  const ol = $('k-list'); ol.replaceChildren();
  let heading = null;
  for (const it of items) {
    if (it.kind !== heading) { heading = it.kind; ol.append(el('li', {className: 'k-head', textContent: heading === 'ing' ? 'Ingredients' : 'Method'})); }
    const b = el('button', {type: 'button', className: it.kind}, el('span', {textContent: it.kind === 'step' ? `${it.n}. ${it.text}` : it.text}));
    b.setAttribute('aria-pressed', String(!!ticks[it.k]));
    b.onclick = () => { ticks[it.k] = !ticks[it.k]; b.setAttribute('aria-pressed', String(ticks[it.k])); progress(items.length); };
    ol.append(el('li', {}, b));
  }
  progress(items.length);
  $('kitchen').hidden = false; document.body.style.overflow = 'hidden'; wake(); $('k-close').focus();
}
function progress(n) { const d = Object.values(ticks).filter(Boolean).length; $('k-progress').textContent = d === n ? 'All done. Enjoy it.' : `${d} of ${n} ticked`; }
function closeKitchen() { $('kitchen').hidden = true; document.body.style.overflow = ''; if (lock) { lock.release().catch(() => {}); lock = null; } $('k-wake').textContent = ''; $('kitchen-open').focus(); }

// Books
async function books() {
  const files = await busy('Looking for books…', () => archive.books()); status('');
  const ul = $('book-list'); ul.replaceChildren();
  $('no-books').hidden = files.length > 0;
  for (const f of files) {
    const b = el('button', {type: 'button', className: 'row'}, el('span', {className: 'title', textContent: f.name.replace(/\.(pdf|epub)$/i, '')}), el('span', {className: 'meta', textContent: f.name.split('.').pop().toUpperCase()}));
    b.onclick = async () => { const w = window.open('', '_blank'); try { const link = await busy('Opening…', () => db.stream(f.path_lower)); status(''); if (w) w.location = link; else location.href = link; } catch { w?.close(); } };
    ul.append(el('li', {}, b));
  }
}

async function ready() {
  db = db || new KitchenDropbox(session, saveSession); archive = new Archive(db);
  $('connection').hidden = true; $('app').hidden = false;
  drawLibrary();
  const pending = takeHandoff();
  if (pending) { try { useHandoff(pending); } catch (e) { status(e.message, true); } }
  else show('library');
  await refresh();
  const r = /^#r=(.+)$/.exec(location.hash);
  if (r && !pending) await open(decodeURIComponent(r[1])).catch(() => {});
}

function wire() {
  $('callback').textContent = callbackURL(location.href);
  $('app-key').value = read(localStorage, KEY, '');
  $('remember').checked = !!read(localStorage, AUTH);
  $('bm').href = bookmarklet(callbackURL(location.href));
  $('connect').onclick = () => connect().catch(e => status(e.message, true));
  $('disconnect').onclick = disconnect;
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { show(b.dataset.view); if (b.dataset.view === 'books') books().catch(() => {}); });
  $('search').oninput = drawLibrary;
  $('reload').onclick = () => refresh().catch(() => {});
  $('fetch').onclick = () => fetchLink().catch(() => {});
  $('link').onkeydown = e => { if (e.key === 'Enter') $('fetch').click(); };
  $('p-save').onclick = async () => { if (!draft) return; const r = await persist(draft, 'Saved to your Cookbook.').catch(() => null); if (!r) return; draft = null; $('preview').hidden = true; $('link').value = ''; await open(r.id); };
  $('p-cancel').onclick = () => { draft = null; $('preview').hidden = true; status(''); };
  $('back').onclick = () => { show('library'); drawLibrary(); };
  $('less').onclick = () => { if (serves > 1) { serves--; drawRecipe(); } };
  $('more').onclick = () => { serves++; drawRecipe(); };
  $('r-save-notes').onclick = () => { current = {...current, notes: $('r-notes').value}; persist(current, 'Notes saved.').catch(() => {}); };
  $('r-delete').onclick = async () => {
    if (!confirm(`Delete “${current.title}” from your Cookbook?`)) return;
    list = await busy('Deleting…', () => archive.remove(current.id)).catch(() => list);
    localStorage.removeItem('cookbook.r.' + current.id); write(localStorage, INDEX, list); current = null; show('library'); drawLibrary(); status('Deleted.');
  };
  $('kitchen-open').onclick = kitchen; $('k-close').onclick = closeKitchen;
  $('k-reset').onclick = () => { ticks = {}; kitchen(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('kitchen').hidden) closeKitchen(); });
  window.addEventListener('hashchange', () => { if (!/^#add=/.test(location.hash)) return; const p = takeHandoff(); if (p && archive) { try { useHandoff(p); } catch (e) { status(e.message, true); } } else if (p) status('Connect Dropbox to save the recipe you sent.'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('kitchen').hidden) wake(); });
}

async function start() {
  wire();
  takeHandoff();
  try { await callback(); } catch (e) { status(e.message, true); }
  if (session?.refresh_token || session?.access_token) { await ready().catch(() => {}); }
  else if (read(sessionStorage, ADD)) status('Connect Dropbox to save the recipe you sent.');
}

start();
