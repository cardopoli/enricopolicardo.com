import {score, daysLeft, money, ics} from './score.mjs';
import {KitchenDropbox, authURL, random, challenge, callbackURL, validateCallback} from '../kitchen/dropbox.mjs';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null && k !== false)); return e; };
const read = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };
const K = {state: 'opps.state', visit: 'opps.lastVisit', profiles: 'opps.profiles', auth: 'opps.dropbox', pending: 'opps.pending', key: 'opps.appKey'};
const STAGES = [['shortlist', 'Shortlist'], ['preparing', 'Preparing'], ['submitted', 'Submitted'], ['result', 'Result']];
const KIND_LABEL = {residency: 'Residency', open_call: 'Open call', commission: 'Commission', prize: 'Prize', fellowship: 'Fellowship', grant: 'Grant', tender: 'Tender', training: 'Training', other: 'Other'};
const REGION_LABEL = {UK: 'UK', IE: 'Ireland', IT: 'Italy', 'IT-FVG': 'Friuli Venezia Giulia', SI: 'Slovenia', 'IT-SI': 'Italy-Slovenia', EU: 'Europe (EU)', CH: 'Switzerland', International: 'International'};
const today = new Date();

let data = {items: [], sources: []}, defaults = [], profiles = [], manual = [];
let state = Object.assign({pipeline: {}, hidden: {}, updatedAt: 0}, read(K.state, {}));
let view = 'leads', profileId = read('opps.profile', 'practice'), kinds = new Set(), limit = 60;
let lastVisit = null; // the daily check you had seen before this one
let db = null, session = read(K.auth) || null, syncTimer = 0;

function status(msg, bad = false) { const s = $('status'); s.textContent = msg || ''; s.classList.toggle('bad', !!bad); }
const fmtDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
const ago = iso => { const h = Math.round((Date.now() - Date.parse(iso)) / 36e5); return h < 1 ? 'just now' : h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };

// ---------- state & sync ----------
function save() {
  state.updatedAt = Date.now(); write(K.state, state);
  if (db) { clearTimeout(syncTimer); syncTimer = setTimeout(() => push().catch(e => status(e.message, true)), 1200); }
}
function mergeStates(a, b) {
  const out = {pipeline: {...a.pipeline}, hidden: {...a.hidden, ...b.hidden}, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0)};
  for (const [id, p] of Object.entries(b.pipeline || {})) if (!out.pipeline[id] || (p.updatedAt || 0) > (out.pipeline[id].updatedAt || 0)) out.pipeline[id] = p;
  for (const id of Object.keys(out.pipeline)) if (out.pipeline[id]?.deleted && (b.pipeline?.[id]?.deleted || a.pipeline?.[id]?.deleted)) { /* keep tombstone so deletes travel */ }
  return out;
}
async function pull() {
  let remote = null;
  try { remote = JSON.parse(await db.download('/opportunities/pipeline.json')); } catch (e) { if (e.status && e.status !== 409) throw e; }
  if (remote) { state = mergeStates(state, remote); write(K.state, state); }
}
async function push() { await db.upload('/opportunities/pipeline.json', JSON.stringify({...state, v: 1}, null, 1)); status('Pipeline saved to Dropbox.'); }

async function connect() {
  const key = $('app-key').value.trim() || read(K.key, '') || read('cookbook.appKey', '');
  if (!/^[A-Za-z0-9_-]{5,100}$/.test(key)) { $('sync-setup').open = true; $('app-key').focus(); throw Error('Add your Dropbox app key first.'); }
  write(K.key, key);
  const verifier = random(), st = random(), redirect = callbackURL(location.href);
  sessionStorage.setItem(K.pending, JSON.stringify({key, verifier, state: st, redirect, remember: true, created: Date.now()}));
  location.assign(authURL(key, redirect, st, await challenge(verifier)));
}
async function callback() {
  const u = new URL(location.href);
  if (!u.searchParams.has('code') && !u.searchParams.has('error')) return;
  const pending = JSON.parse(sessionStorage.getItem(K.pending) || 'null'); sessionStorage.removeItem(K.pending);
  history.replaceState(null, '', callbackURL(location.href));
  validateCallback(pending, u.searchParams.get('state'));
  if (u.searchParams.has('error')) throw Error('Dropbox connection was cancelled.');
  session = {key: pending.key, remember: true};
  db = new KitchenDropbox(session, s => write(K.auth, s));
  await db.token({client_id: pending.key, grant_type: 'authorization_code', code: u.searchParams.get('code'), code_verifier: pending.verifier, redirect_uri: pending.redirect});
}
function disconnect() {
  const access = db?.session?.access_token; db?.close(); db = null; session = null; localStorage.removeItem(K.auth);
  if (access) fetch('https://api.dropboxapi.com/2/auth/token/revoke', {method: 'POST', headers: {Authorization: 'Bearer ' + access}, referrerPolicy: 'no-referrer'}).catch(() => {});
  drawSync(); status('Dropbox disconnected. Your pipeline stays in this browser.');
}
function drawSync() {
  $('sync-on').hidden = !db; $('sync-off').hidden = !!db;
  $('callback').textContent = callbackURL(location.href);
  $('app-key').value = read(K.key, '') || read('cookbook.appKey', '');
}

// ---------- profiles ----------
function activeProfile() { return profiles.find(p => p.id === profileId) || null; }
function loadProfiles() {
  const over = read(K.profiles, {});
  profiles = defaults.map(p => ({...p, ...(over[p.id] || {})}));
}

// ---------- leads ----------
function itemById(id) { return state.pipeline[id]?.item || data.items.find(i => i.id === id); }

function filtered() {
  const p = activeProfile(), q = $('q').value.trim().toLowerCase(), region = $('region').value, when = $('when').value, min = Number($('min').value), sort = $('sort').value;
  const onlyNew = $('only-new').checked;
  let list = data.items.filter(i => i.present !== false && i.status !== 'closed' && !state.hidden[i.id]);
  if (q) list = list.filter(i => [i.title, i.summary, i.source, i.programme].join(' ').toLowerCase().includes(q));
  if (kinds.size) list = list.filter(i => (i.kinds || []).some(k => kinds.has(k)));
  if (region) list = list.filter(i => i.region === region);
  if (onlyNew && lastVisit) list = list.filter(i => i.first_seen > lastVisit);
  if (when) list = list.filter(i => { const d = daysLeft(i, today); return when === 'rolling' ? i.status === 'rolling' : when === 'dated' ? d != null : d != null && d >= 0 && d <= Number(when); });
  const scored = list.map(i => ({i, s: p ? score(i, p) : null})).filter(x => x.s == null || x.s >= min);
  const dl = x => daysLeft(x.i, today) ?? 9999;
  scored.sort(sort === 'soon' ? (a, b) => dl(a) - dl(b) : sort === 'new' ? (a, b) => b.i.first_seen.localeCompare(a.i.first_seen) : (a, b) => (b.s ?? 0) - (a.s ?? 0) || dl(a) - dl(b));
  return scored;
}

function deadlineBadge(i) {
  const d = daysLeft(i, today);
  if (d == null) return el('span', {className: 'dl muted', textContent: i.status === 'rolling' ? 'Rolling' : 'No date found'});
  const cls = d < 0 ? 'past' : d <= 14 ? 'urgent' : d <= 45 ? 'soon' : 'ok';
  return el('span', {className: 'dl ' + cls, title: i.deadline_text || ''}, el('b', {textContent: fmtDate(i.deadline)}), el('small', {textContent: d < 0 ? 'passed' : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`}));
}

function row({i, s}) {
  const inPipe = state.pipeline[i.id] && !state.pipeline[i.id].deleted;
  const meta = [i.source, REGION_LABEL[i.region] || i.region, (i.kinds || []).map(k => KIND_LABEL[k] || k).join(', '), money(i.amount)].filter(Boolean).join(' · ');
  const isNew = lastVisit && i.first_seen > lastVisit;
  const star = el('button', {type: 'button', className: 'icon' + (inPipe ? ' on' : ''), title: inPipe ? 'In your pipeline' : 'Add to pipeline', textContent: inPipe ? '★' : '☆', ariaLabel: inPipe ? 'In your pipeline' : 'Add to pipeline'});
  star.onclick = () => { if (!inPipe) addToPipeline(i); else { view = 'pipeline'; draw(); } };
  const hide = el('button', {type: 'button', className: 'icon', title: 'Hide this lead', textContent: '×', ariaLabel: 'Hide this lead'});
  hide.onclick = () => { state.hidden[i.id] = Date.now(); save(); draw(); status('Hidden. Undo from “Hidden leads” at the bottom.'); };
  const cal = i.deadline ? el('button', {type: 'button', className: 'icon', title: 'Add deadline to calendar', textContent: '⧗', ariaLabel: 'Add deadline to calendar'}) : null;
  if (cal) cal.onclick = () => download(ics([i]), slugify(i.title) + '.ics', 'text/calendar');
  const details = el('details', {}, el('summary', {textContent: 'Details'}),
    i.summary ? el('p', {textContent: i.summary}) : null,
    i.deadline_text ? el('p', {className: 'small', textContent: 'Deadline found in: “' + i.deadline_text + '”'}) : null,
    i.amount?.text ? el('p', {className: 'small', textContent: 'Amount found in: “' + i.amount.text + '”'}) : null,
    ...(i.also_on || []).map(a => el('p', {className: 'small'}, 'Also on ', el('a', {href: a.url, target: '_blank', rel: 'noopener', textContent: a.source}))),
    el('p', {className: 'small', textContent: `First seen ${fmtDate(i.first_seen.slice(0, 10))}. A lead, not a verified call: check eligibility, fees and rights on the funder's page.`}));
  return el('li', {className: 'lead'},
    el('div', {className: 'main'},
      el('a', {className: 'title', href: i.url, target: '_blank', rel: 'noopener', textContent: i.title}), isNew ? el('span', {className: 'new', textContent: 'New'}) : null,
      el('div', {className: 'meta', textContent: meta}), details),
    el('div', {className: 'side'}, deadlineBadge(i), s != null ? el('div', {className: 'match', title: 'Match with this profile'}, el('span', {style: `width:${s}%`}), el('small', {textContent: s})) : null,
      el('div', {className: 'acts'}, star, cal, hide)));
}

function drawLeads() {
  const list = filtered();
  $('count').textContent = `${list.length} lead${list.length === 1 ? '' : 's'}` + (activeProfile() ? ` matching “${activeProfile().name}”` : '');
  const ol = $('leads'); ol.replaceChildren(...list.slice(0, limit).map(row));
  $('more').hidden = list.length <= limit;
  $('none').hidden = list.length > 0;
}

// ---------- pipeline ----------
function addToPipeline(i, stage = 'shortlist') {
  state.pipeline[i.id] = {id: i.id, stage, notes: '', item: {id: i.id, title: i.title, url: i.url, source: i.source, region: i.region, kinds: i.kinds, deadline: i.deadline || null, amount: i.amount || null, summary: i.summary || ''}, addedAt: Date.now(), updatedAt: Date.now()};
  save(); draw(); status(`Added to your shortlist: ${i.title}`);
}

function card(p) {
  const i = p.item;
  const stage = el('select', {ariaLabel: 'Stage'}, ...STAGES.map(([v, l]) => el('option', {value: v, textContent: l, selected: p.stage === v})));
  stage.onchange = () => { p.stage = stage.value; p.updatedAt = Date.now(); save(); draw(); };
  const result = el('select', {ariaLabel: 'Result', hidden: p.stage !== 'result'}, ...[['', 'Waiting'], ['won', 'Won'], ['declined', 'Not this time'], ['withdrawn', 'Withdrawn']].map(([v, l]) => el('option', {value: v, textContent: l, selected: (p.result || '') === v})));
  result.onchange = () => { p.result = result.value; p.updatedAt = Date.now(); save(); };
  const notes = el('textarea', {value: p.notes || '', placeholder: 'Notes: requirements, partners, what to send…', rows: 3});
  notes.onchange = () => { p.notes = notes.value; p.updatedAt = Date.now(); save(); };
  const dl = el('input', {type: 'date', value: i.deadline || '', ariaLabel: 'Deadline'});
  dl.onchange = () => { i.deadline = dl.value || null; p.updatedAt = Date.now(); save(); draw(); };
  const del = el('button', {type: 'button', className: 'link', textContent: 'Remove'});
  del.onclick = () => { if (confirm(`Remove “${i.title}” from your pipeline?`)) { state.pipeline[p.id] = {id: p.id, deleted: true, updatedAt: Date.now()}; save(); draw(); } };
  return el('li', {className: 'card' + (p.result ? ' r-' + p.result : '')},
    el('a', {className: 'title', href: i.url || '#', target: '_blank', rel: 'noopener', textContent: i.title}),
    el('div', {className: 'meta', textContent: [i.source, money(i.amount)].filter(Boolean).join(' · ')}),
    el('div', {className: 'row'}, deadlineBadge(i), dl),
    el('div', {className: 'row'}, stage, result), notes, el('div', {className: 'row end'}, del));
}

function drawPipeline() {
  const items = Object.values(state.pipeline).filter(p => p && !p.deleted && p.item);
  const box = $('columns'); box.replaceChildren();
  for (const [stage, label] of STAGES) {
    const rank = p => { const d = daysLeft(p.item, today); return d == null ? 1e6 : d < 0 ? 2e6 - d : d; }; // upcoming, then undated, then passed
    const mine = items.filter(p => p.stage === stage).sort((a, b) => rank(a) - rank(b));
    box.append(el('section', {className: 'col'}, el('h3', {}, label, el('small', {textContent: mine.length})), el('ol', {}, ...mine.map(card))));
  }
  $('pipe-empty').hidden = items.length > 0;
}

// ---------- sources ----------
function drawSources() {
  const ok = data.sources.filter(s => s.status === 'ok').length;
  $('src-summary').textContent = `${ok} of ${data.sources.length} checked automatically answered on the last run · ${manual.length} to check by hand`;
  $('src-list').replaceChildren(...data.sources.map(s => el('li', {className: s.status},
    el('a', {href: s.url, target: '_blank', rel: 'noopener', textContent: s.name}),
    el('span', {textContent: s.status === 'ok' ? `${s.listings} listed${s.new ? ` · ${s.new} new` : ''}` : `not answering (${s.error})`}))));
  $('manual-list').replaceChildren(...manual.map(s => el('li', {}, el('a', {href: s.url, target: '_blank', rel: 'noopener', textContent: s.name}), el('span', {textContent: s.why || ''}))));
  const hidden = Object.keys(state.hidden).map(id => data.items.find(i => i.id === id)).filter(Boolean);
  $('hidden-count').textContent = hidden.length;
  $('hidden-list').replaceChildren(...hidden.map(i => { const b = el('button', {type: 'button', className: 'link', textContent: 'Show again'}); b.onclick = () => { delete state.hidden[i.id]; save(); draw(); }; return el('li', {}, el('span', {textContent: i.title}), b); }));
}

// ---------- profiles editor ----------
function drawProfileEditor() {
  const p = activeProfile();
  $('profile-edit').hidden = !p;
  if (!p) return;
  $('pe-name').textContent = p.name;
  for (const k of ['strong', 'medium', 'exclude']) $('pe-' + k).value = (p[k] || []).join(', ');
}
function saveProfile() {
  const p = activeProfile(); if (!p) return;
  const over = read(K.profiles, {});
  over[p.id] = Object.fromEntries(['strong', 'medium', 'exclude'].map(k => [k, $('pe-' + k).value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)]));
  write(K.profiles, over); loadProfiles(); draw(); status('Profile saved on this device. The weekly email uses the defaults in the repo.');
}

// ---------- add by link ----------
async function addByLink() {
  const url = $('add-url').value.trim(), title = $('add-title').value.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw Error('Paste the full web address of the call, starting with https://');
  const known = data.items.find(i => i.url === url);
  if (known) { addToPipeline(known); $('add-url').value = ''; return; }
  let found = {};
  if (db && !title) {
    status('Dropbox is fetching the page…');
    const path = `/opportunities/inbox/${Date.now()}.html`;
    try { await db.saveUrl(path, url); found = readCall(await db.download(path)); } catch (e) { status(e.message + ' Add a title by hand instead.', true); } finally { db.remove(path).catch(() => {}); }
  }
  const t = title || found.title;
  if (!t) { $('add-title').focus(); throw Error('Add a title for this call (or connect Dropbox so the page can be read for you).'); }
  const id = 'own-' + Date.now().toString(36);
  state.pipeline[id] = {id, stage: 'shortlist', notes: '', item: {id, title: t, url, source: new URL(url).hostname.replace(/^www\./, ''), deadline: $('add-deadline').value || found.deadline || null, amount: null, summary: found.summary || ''}, addedAt: Date.now(), updatedAt: Date.now()};
  save(); $('add-url').value = ''; $('add-title').value = ''; $('add-deadline').value = '';
  view = 'pipeline'; draw(); status(`Added “${t}” to your shortlist${found.deadline ? ' with its deadline' : ''}.`);
}
const MONTHS = {january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, dicembre: 12};
export function readCall(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = n => doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content?.trim() || '';
  doc.querySelectorAll('script,style,nav,header,footer').forEach(n => n.remove());
  const text = (doc.body?.innerText || doc.body?.textContent || '').replace(/\s+/g, ' ');
  let deadline = null;
  const re = /(deadline|closing date|closes|apply by|scadenza|entro il|rok za oddajo)[^.]{0,120}?(\d{1,2})(?:st|nd|rd|th)?[\s./-]+(\d{1,2}|[a-z]+)[\s./-]+(20\d\d)/gi;
  for (const m of text.matchAll(re)) {
    const mo = /^\d+$/.test(m[3]) ? Number(m[3]) : MONTHS[m[3].toLowerCase()];
    if (!mo) continue;
    const iso = `${m[4]}-${String(mo).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(iso)) && iso >= today.toISOString().slice(0, 10)) { deadline = iso; break; }
  }
  return {title: meta('og:title') || doc.querySelector('h1')?.textContent?.trim() || doc.title?.trim() || '', summary: meta('og:description') || meta('description'), deadline};
}

// ---------- misc ----------
const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 50);
function download(text, name, type) { const a = el('a', {href: URL.createObjectURL(new Blob([text], {type})), download: name}); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

function importBackup(file) {
  file.text().then(t => {
    const got = JSON.parse(t);
    if (!got || typeof got.pipeline !== 'object') throw Error('That file is not an Opportunities backup.');
    state = mergeStates(state, got); save(); view = 'pipeline'; draw();
    status(`Imported ${Object.keys(got.pipeline).length} pipeline items.`);
  }).catch(e => status(e.message, true));
}

function oldNotes() {
  const n = localStorage.getItem('urcommons-notes');
  $('old-notes').hidden = !n || state.pipeline['old-notes'];
  $('old-notes-btn').onclick = () => {
    state.pipeline['old-notes'] = {id: 'old-notes', stage: 'shortlist', notes: n, item: {id: 'old-notes', title: 'Notes from the old Opportunities page', url: '', source: 'old page'}, addedAt: Date.now(), updatedAt: Date.now()};
    save(); view = 'pipeline'; draw(); status('Your old notes are now a card in your pipeline.');
  };
}

function draw() {
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  document.body.classList.toggle('compact', view !== 'leads');
  for (const v of ['leads', 'pipeline', 'sources']) $('v-' + v).hidden = v !== view;
  document.querySelectorAll('[data-profile]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.profile === profileId)));
  $('min-wrap').hidden = !activeProfile();
  const pipeCount = Object.values(state.pipeline).filter(p => p && !p.deleted).length;
  $('pipe-count').textContent = pipeCount ? ` (${pipeCount})` : '';
  if (view === 'leads') { drawLeads(); drawProfileEditor(); }
  if (view === 'pipeline') drawPipeline();
  if (view === 'sources') drawSources();
}

function wire() {
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; draw(); });
  document.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => { profileId = b.dataset.profile; write('opps.profile', profileId); limit = 60; draw(); });
  for (const id of ['q', 'region', 'when', 'sort', 'only-new']) $(id).addEventListener('input', () => { limit = 60; drawLeads(); });
  $('min').addEventListener('input', () => { $('min-out').textContent = $('min').value; limit = 60; drawLeads(); });
  const kbox = $('kinds');
  for (const [k, label] of Object.entries(KIND_LABEL)) {
    if (k === 'other') continue;
    const b = el('button', {type: 'button', className: 'chip', textContent: label}); b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { kinds.has(k) ? kinds.delete(k) : kinds.add(k); b.setAttribute('aria-pressed', String(kinds.has(k))); limit = 60; drawLeads(); };
    kbox.append(b);
  }
  $('more').onclick = () => { limit += 60; drawLeads(); };
  $('pe-save').onclick = saveProfile;
  $('pe-reset').onclick = () => { const over = read(K.profiles, {}); delete over[profileId]; write(K.profiles, over); loadProfiles(); draw(); status('Profile reset to the default.'); };
  $('add-go').onclick = () => addByLink().catch(e => status(e.message, true));
  $('ics-all').onclick = () => { const items = Object.values(state.pipeline).filter(p => p && !p.deleted && p.item?.deadline && p.stage !== 'result').map(p => p.item); if (!items.length) return status('No pipeline deadlines yet.'); download(ics(items), 'opportunities-deadlines.ics', 'text/calendar'); };
  $('backup').onclick = () => download(JSON.stringify({...state, v: 1}, null, 1), `opportunities-pipeline-${today.toISOString().slice(0, 10)}.json`, 'application/json');
  $('restore').onchange = e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; };
  $('connect').onclick = () => connect().catch(e => status(e.message, true));
  $('disconnect').onclick = disconnect;
  const regions = [...new Set(data.items.map(i => i.region).filter(Boolean))].sort((a, b) => (REGION_LABEL[a] || a).localeCompare(REGION_LABEL[b] || b));
  $('region').append(...regions.map(r => el('option', {value: r, textContent: REGION_LABEL[r] || r})));
}

async function start() {
  try { await callback(); } catch (e) { status(e.message, true); }
  if (!db && session?.refresh_token) db = new KitchenDropbox(session, s => write(K.auth, s));
  try {
    const [d, p, s] = await Promise.all([
      fetch('../data/opportunities.json', {cache: 'no-cache'}).then(r => { if (!r.ok) throw Error('Could not load the opportunities list.'); return r.json(); }),
      fetch('../data/opportunity-profiles.json', {cache: 'no-cache'}).then(r => r.json()),
      fetch('../scripts/opportunities/sources.json', {cache: 'no-cache'}).then(r => r.json()).catch(() => ({sources: []})),
    ]);
    data = d; defaults = p.profiles; manual = s.sources.filter(x => x.kind === 'manual');
  } catch (e) { status(e.message, true); }
  loadProfiles();
  const open = data.items.filter(i => i.present !== false && i.status !== 'closed').length;
  $('checked').textContent = data.checked_at ? `Checked ${ago(data.checked_at)} · ${open} open leads from ${data.sources_ok ?? '?'} sources` : '';
  const seen = read(K.visit, null);
  const marks = seen && typeof seen === 'object' ? seen : {previous: null, current: typeof seen === 'string' ? seen : null};
  if (data.checked_at && marks.current !== data.checked_at) { marks.previous = marks.current; marks.current = data.checked_at; write(K.visit, marks); }
  lastVisit = marks.previous;
  if (lastVisit) { const n = data.items.filter(i => i.first_seen > lastVisit && i.status !== 'closed').length; $('only-new-label').textContent = `New since your last visit (${n})`; }
  else $('only-new-wrap').hidden = true;
  wire(); drawSync(); oldNotes(); draw();
  if (db) pull().then(() => { draw(); status('Pipeline synced with Dropbox.'); }).catch(e => status(e.message, true));
}

start();
