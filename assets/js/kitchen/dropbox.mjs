// Dropbox archive for the kitchen tools. Builds on the Music player's tested client
// (PKCE sign-in, shared token refresh, 401 retry), adding writes inside an app folder.
import {Dropbox as BaseDropbox, b64url, random, challenge, callbackURL, validateCallback} from '../music/core.mjs';

export {random, challenge, callbackURL, validateCallback, b64url};
export const SCOPES = 'files.metadata.read files.content.read files.content.write';

export function authURL(key, redirect, state, codeChallenge) {
  const u = new URL('https://www.dropbox.com/oauth2/authorize');
  u.search = new URLSearchParams({client_id: key, response_type: 'code', redirect_uri: redirect, state, code_challenge: codeChallenge, code_challenge_method: 'S256', token_access_type: 'offline', scope: SCOPES});
  return u.href;
}

// Dropbox-API-Arg must be ASCII: escape everything else as \uXXXX.
export const apiArg = obj => JSON.stringify(obj).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

const message = (status, what) =>
  status === 429 ? 'Dropbox is busy. Wait a minute, then try again.' :
  status === 409 ? `Dropbox couldn't ${what}. It may have moved or been deleted.` :
  status === 401 ? 'Dropbox connection expired. Disconnect and connect again.' :
  status === 403 ? 'This Dropbox app is missing a permission. Check the setup steps.' :
  `Dropbox request failed (${status}). Try again.`;

export class KitchenDropbox extends BaseDropbox {
  constructor(session, save, transport = fetch, wait = ms => new Promise(r => setTimeout(r, ms))) { super(session, save, transport); this.wait = wait; }

  async api(endpoint, body, retry = true) {
    const token = await this.access();
    const r = await this.transport('https://api.dropboxapi.com/2/' + endpoint, {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify(body), referrerPolicy: 'no-referrer'});
    if (this.closed) throw Error('Disconnected.');
    if (r.status === 401 && retry) { await this.access(true); return this.api(endpoint, body, false); }
    if (!r.ok) { const e = Error(message(r.status, 'find that file or folder')); e.status = r.status; e.detail = await r.text().catch(() => ''); throw e; }
    return r.json();
  }

  async content(endpoint, arg, body, retry = true) {
    const token = await this.access();
    const headers = {Authorization: 'Bearer ' + token, 'Dropbox-API-Arg': apiArg(arg)};
    if (body != null) headers['Content-Type'] = 'application/octet-stream';
    const r = await this.transport('https://content.dropboxapi.com/2/' + endpoint, {method: 'POST', headers, body: body ?? undefined, referrerPolicy: 'no-referrer'});
    if (this.closed) throw Error('Disconnected.');
    if (r.status === 401 && retry) { await this.access(true); return this.content(endpoint, arg, body, false); }
    if (!r.ok) { const e = Error(message(r.status, endpoint.includes('upload') ? 'save that file' : 'open that file')); e.status = r.status; throw e; }
    return r;
  }

  async upload(path, text) { return (await this.content('files/upload', {path, mode: 'overwrite', autorename: false, mute: true}, text)).json(); }
  async download(path) { return (await this.content('files/download', {path})).text(); }
  async exists(path) { try { await this.api('files/get_metadata', {path}); return true; } catch (e) { if (e.status === 409) return false; throw e; } }
  async remove(path) { return this.api('files/delete_v2', {path}); }
  async ensureFolder(path) { try { await this.api('files/create_folder_v2', {path, autorename: false}); } catch (e) { if (e.status !== 409) throw e; } }
  async listSafe(path) { try { return await this.list(path); } catch (e) { if (e.status === 409) return []; throw e; } }

  // Dropbox fetches the page on its own servers, so the browser never has to.
  async saveUrl(path, url, {timeout = 60000, every = 1500} = {}) {
    const first = await this.api('files/save_url', {path, url});
    if (first['.tag'] === 'complete') return first;
    const id = first.async_job_id;
    if (!id) throw Error('Dropbox did not accept that link.');
    for (let waited = 0; waited <= timeout; waited += every) {
      await this.wait(every);
      const s = await this.api('files/save_url/check_job_status', {async_job_id: id});
      if (s['.tag'] === 'complete') return s;
      if (s['.tag'] === 'failed') throw Error("Dropbox couldn't fetch that page. The site may block it - use the bookmarklet on the page instead.");
    }
    throw Error('Dropbox is taking too long to fetch that page. Try the bookmarklet instead.');
  }
}

// The archive layout inside the app folder (Dropbox/Apps/<app name>/).
export const PATHS = {recipes: '/recipes', inbox: '/inbox', books: '/books', index: '/index.json'};
export const recipePath = id => `${PATHS.recipes}/${id}.json`;

export const summary = r => ({id: r.id, title: r.title, source: r.source, tags: r.tags ?? [], total: r.times?.total ?? null, serves: r.serves ?? null, image: r.image ?? '', addedAt: r.addedAt, updatedAt: r.updatedAt ?? r.addedAt});

export class Archive {
  constructor(db) { this.db = db; }

  async index() {
    let index = [];
    try { index = JSON.parse(await this.db.download(PATHS.index)).recipes ?? []; } catch (e) { if (e.status && e.status !== 409) throw e; }
    const files = (await this.db.listSafe(PATHS.recipes)).filter(f => f['.tag'] === 'file' && f.name.endsWith('.json'));
    const ids = new Set(files.map(f => f.name.slice(0, -5)));
    let changed = false;
    const kept = index.filter(s => ids.has(s.id));
    if (kept.length !== index.length) changed = true;
    const known = new Set(kept.map(s => s.id));
    for (const id of ids) if (!known.has(id)) {
      try { kept.push(summary(JSON.parse(await this.db.download(recipePath(id))))); changed = true; } catch { /* unreadable file: skip */ }
    }
    kept.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    if (changed) await this.writeIndex(kept);
    return kept;
  }

  async writeIndex(list) { await this.db.upload(PATHS.index, JSON.stringify({v: 1, updatedAt: new Date().toISOString(), recipes: list}, null, 1)); }
  async get(id) { return JSON.parse(await this.db.download(recipePath(id))); }

  async save(recipe) {
    const r = {...recipe, updatedAt: new Date().toISOString()};
    await this.db.upload(recipePath(r.id), JSON.stringify(r, null, 1));
    const list = await this.index();
    const at = list.findIndex(s => s.id === r.id);
    if (at >= 0) list[at] = summary(r); else list.unshift(summary(r));
    await this.writeIndex(list);
    return {recipe: r, list};
  }

  async remove(id) {
    await this.db.remove(recipePath(id)).catch(e => { if (e.status !== 409) throw e; });
    const list = (await this.index()).filter(s => s.id !== id);
    await this.writeIndex(list);
    return list;
  }

  async fetchPage(url, stamp = Date.now()) {
    const path = `${PATHS.inbox}/${stamp}.html`;
    await this.db.saveUrl(path, url);
    try { return await this.db.download(path); } finally { this.db.remove(path).catch(() => {}); }
  }

  async books() {
    return (await this.db.listSafe(PATHS.books)).filter(f => f['.tag'] === 'file' && /\.(pdf|epub)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  }
}
