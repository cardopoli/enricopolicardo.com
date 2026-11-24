// Recipe reader for the kitchen tools (Cookbook, Bread bench, Pasto Semplice).
// Pulls schema.org Recipe data out of a web page. No network, no AI.

const ENTITIES = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',egrave:'è',eacute:'é',agrave:'à',ograve:'ò',ugrave:'ù',igrave:'ì',Egrave:'È',deg:'°',frac12:'½',frac14:'¼',frac34:'¾',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',hellip:'…'};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e] ?? m;
  });
}

export function cleanText(s) {
  return decodeEntities(String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function extractJsonLd(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html)))) {
    const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    for (const attempt of [raw, decodeEntities(raw), raw.replace(/[\u0000-\u001f]+/g, ' ')]) {
      try { out.push(JSON.parse(attempt)); break; } catch { /* try next */ }
    }
  }
  return out;
}

const isRecipe = n => n && typeof n === 'object' && [].concat(n['@type'] ?? []).some(t => /(^|\/)Recipe$/i.test(String(t)));

export function findRecipe(nodes) {
  const seen = new Set(), stack = [].concat(nodes ?? []);
  while (stack.length) {
    const n = stack.shift();
    if (!n || typeof n !== 'object' || seen.has(n)) continue;
    seen.add(n);
    if (Array.isArray(n)) { stack.push(...n); continue; }
    if (isRecipe(n)) return n;
    for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'hasPart']) if (n[k]) stack.push(...[].concat(n[k]));
  }
  return null;
}

export function minutes(iso) {
  if (typeof iso === 'number') return Math.round(iso);
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(String(iso ?? '').trim());
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [d, h, mi, s] = m.slice(1).map(x => Number(x || 0));
  return Math.round(d * 1440 + h * 60 + mi + s / 60);
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return cleanText(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  return cleanText(v.name ?? v.text ?? v['@value'] ?? '');
}

function image(v) {
  const first = [].concat(v ?? [])[0];
  if (!first) return '';
  const u = typeof first === 'string' ? first : first.url ?? first.contentUrl ?? '';
  return /^https:\/\//i.test(u) ? u : '';
}

export function steps(v) {
  const out = [];
  const walk = (x, section) => {
    if (x == null) return;
    if (typeof x === 'string') {
      const t = cleanText(x);
      const parts = t.includes('\n') ? t.split('\n') : [t];
      parts.map(p => p.replace(/^\s*(\d+[.)]|step\s*\d+[:.)]?)\s*/i, '').trim()).filter(Boolean).forEach(p => out.push(section ? {section, text: p} : {text: p}));
      return;
    }
    if (Array.isArray(x)) { x.forEach(y => walk(y, section)); return; }
    const type = [].concat(x['@type'] ?? []).join(' ');
    if (/HowToSection/i.test(type) || (x.itemListElement && !x.text)) { walk(x.itemListElement, cleanText(x.name) || section); return; }
    const t = cleanText(x.text ?? x.name ?? x.description ?? '');
    if (t) out.push(section ? {section, text: t} : {text: t});
  };
  walk(v);
  return out;
}

function tags(r) {
  const t = new Set();
  for (const k of ['recipeCategory', 'recipeCuisine', 'keywords']) {
    for (const v of [].concat(r[k] ?? [])) String(typeof v === 'object' ? text(v) : v).split(/[,;|]/).map(s => cleanText(s).toLowerCase()).filter(s => s && s.length < 40).forEach(s => t.add(s));
  }
  for (const d of [].concat(r.suitableForDiet ?? [])) {
    const s = String(typeof d === 'object' ? d['@id'] ?? d.url ?? '' : d);
    if (/VegetarianDiet/i.test(s)) t.add('vegetarian');
    if (/VeganDiet/i.test(s)) { t.add('vegan'); t.add('vegetarian'); }
    if (/GlutenFreeDiet/i.test(s)) t.add('gluten-free');
  }
  return [...t].slice(0, 20);
}

export function slug(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recipe';
}

export function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function normalise(r, url = '', now = new Date()) {
  if (!isRecipe(r)) throw Error('That page has no recipe the app can read.');
  const title = text(r.name) || text(r.headline) || 'Untitled recipe';
  const ingredients = [].concat(r.recipeIngredient ?? r.ingredients ?? []).map(text).filter(Boolean);
  if (!ingredients.length) throw Error('Found a recipe, but without an ingredient list.');
  const yieldText = [].concat(r.recipeYield ?? []).map(text).filter(Boolean)[0] ?? '';
  const serves = Number((/\d+/.exec(yieldText) ?? [])[0]) || null;
  let source = '';
  try { source = url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { source = ''; }
  return {
    v: 1,
    id: slug(title) + '-' + hash(url || title),
    title,
    description: text(r.description).slice(0, 600),
    url: /^https?:\/\//i.test(url) ? url : '',
    source,
    author: text([].concat(r.author ?? [])[0]),
    image: image(r.image),
    yield: yieldText,
    serves,
    times: {prep: minutes(r.prepTime), cook: minutes(r.cookTime), total: minutes(r.totalTime) ?? ((minutes(r.prepTime) ?? 0) + (minutes(r.cookTime) ?? 0) || null)},
    ingredients,
    steps: steps(r.recipeInstructions),
    tags: tags(r),
    notes: '',
    addedAt: now.toISOString(),
  };
}

export function recipeFromHtml(html, url = '', now) {
  const r = findRecipe(extractJsonLd(html));
  if (!r) throw Error('That page has no recipe the app can read. Try the bookmarklet on the page instead.');
  return normalise(r, url, now);
}

// Ingredient quantities, for scaling.
const FRACTIONS = {'½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875};
const UNIT = '(?:kg|g|gr|grammi|mg|ml|cl|dl|l|lt|litri|litres?|liters?|tsp|teaspoons?|tbsp|tablespoons?|cups?|oz|lbs?|pinch(?:es)?|cucchiai(?:ni|no|o)?|spicchi?|cloves?|tins?|cans?)';
const NUM = '(\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\/\\d+|\\s*[½¼¾⅓⅔⅛⅜⅝⅞])?|\\d+\\/\\d+|[½¼¾⅓⅔⅛⅜⅝⅞])';
const LEAD = new RegExp('^\\s*' + NUM + '(?:\\s*[-–]\\s*' + NUM + ')?(\\s*' + UNIT + '\\b\\.?)?', 'i');
const TRAIL = new RegExp('(\\s)' + NUM + '(?:\\s*[-–]\\s*' + NUM + ')?(\\s*' + UNIT + '\\b\\.?)?\\s*$', 'i');

export function number(s) {
  s = String(s).trim().replace(',', '.');
  let total = 0;
  for (const part of s.split(/\s+/)) {
    if (FRACTIONS[part]) total += FRACTIONS[part];
    else if (/^\d+\/\d+$/.test(part)) { const [a, b] = part.split('/').map(Number); total += b ? a / b : 0; }
    else {
      const m = /^(\d+(?:\.\d+)?)([½¼¾⅓⅔⅛⅜⅝⅞])?$/.exec(part);
      if (!m) return NaN;
      total += Number(m[1]) + (m[2] ? FRACTIONS[m[2]] : 0);
    }
  }
  return total;
}

export function parseIngredient(line) {
  const t = String(line ?? '').trim();
  let m = LEAD.exec(t);
  if (m && !/^0\d/.test(m[1])) return {text: t, at: 'lead', match: m[0], qty: number(m[1]), max: m[2] ? number(m[2]) : null, unit: (m[3] ?? '').trim().toLowerCase(), rawUnit: m[3] ?? ''};
  m = TRAIL.exec(t);
  if (m && !/^0\d/.test(m[2]) && (m[4] || !/\b(tipo|farina|type)\s*$/i.test(t.slice(0, m.index)))) return {text: t, at: 'trail', match: m[0].slice(m[1].length), qty: number(m[2]), max: m[3] ? number(m[3]) : null, unit: (m[4] ?? '').trim().toLowerCase(), rawUnit: m[4] ?? ''};
  return {text: t, at: null, qty: null, max: null, unit: '', rawUnit: ''};
}

const METRIC = /^(kg|g|gr|grammi|mg|ml|cl|dl|l|lt|litri|litres?|liters?)\.?$/i;
const SPOONS = /^(tsp|teaspoons?|tbsp|tablespoons?|cups?|cucchiai(ni|no|o)?)\.?$/i;
const NICE = [[0, ''], [.25, '¼'], [1 / 3, '⅓'], [.5, '½'], [2 / 3, '⅔'], [.75, '¾']];

export function formatQty(q, unit = '') {
  if (!Number.isFinite(q)) return '';
  if (METRIC.test(unit)) {
    if (q >= 100) return String(Math.round(q / 5) * 5);
    if (q >= 10) return String(Math.round(q));
    return String(Math.round(q * 10) / 10);
  }
  if (q >= 10) return String(Math.round(q));
  const whole = Math.floor(q), frac = q - whole;
  const pool = SPOONS.test(unit) ? NICE : NICE.filter(([v]) => v === 0 || v === .5);
  let best = pool[0];
  for (const p of pool) if (Math.abs(frac - p[0]) < Math.abs(frac - best[0])) best = p;
  let w = whole, f = best[1];
  if (Math.abs(frac - 1) < Math.abs(frac - best[0])) { w += 1; f = ''; }
  if (!w && !f) return SPOONS.test(unit) ? '¼' : '½';
  return (w ? String(w) : '') + (w && f ? ' ' : '') + f;
}

export function scaleIngredient(line, factor) {
  const p = parseIngredient(line);
  if (p.qty == null || !Number.isFinite(p.qty) || !factor || factor === 1) return p.text;
  const q = formatQty(p.qty * factor, p.unit) + (p.max != null ? '–' + formatQty(p.max * factor, p.unit) : '') + p.rawUnit;
  const rest = p.at === 'lead' ? p.text.slice(p.match.length) : p.text.slice(0, p.text.length - p.match.length);
  return p.at === 'lead' ? q + (rest && !/^\s/.test(rest) && !p.rawUnit ? ' ' : '') + rest : rest + q;
}

// The bookmarklet: runs on the recipe page, finds the Recipe data and hands it to the app.
export function bookmarklet(appUrl) {
  const src = `(()=>{const A=${JSON.stringify(appUrl)};const R=n=>n&&typeof n=='object'&&[].concat(n['@type']||[]).some(t=>/(^|\\/)Recipe$/i.test(t));let f=null;for(const s of document.querySelectorAll('script[type="application/ld+json"]')){let d;try{d=JSON.parse(s.textContent)}catch(e){continue}const q=[d];while(q.length&&!f){const n=q.shift();if(!n||typeof n!='object')continue;if(Array.isArray(n)){q.push(...n);continue}if(R(n)){f=n;break}for(const k of['@graph','mainEntity','itemListElement'])if(n[k])q.push(...[].concat(n[k]))}if(f)break}if(!f){alert('No recipe data found on this page.');return}const u=A+'#add='+encodeURIComponent(JSON.stringify({url:location.href,recipe:f}));if(!window.open(u,'_blank'))location.href=u})()`;
  return 'javascript:' + encodeURIComponent(src);
}
