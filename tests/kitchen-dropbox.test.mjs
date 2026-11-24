import test from 'node:test';
import assert from 'node:assert/strict';
import {KitchenDropbox, Archive, authURL, apiArg, recipePath, PATHS, SCOPES} from '../assets/js/kitchen/dropbox.mjs';

const json = (d, status = 200) => new Response(JSON.stringify(d), {status});

// A small in-memory Dropbox: enough of the API for the archive.
function fakeDropbox({pages = {}, failSave = false} = {}) {
  const files = new Map(), calls = [];
  const transport = async (url, init) => {
    const ep = url.replace(/^https:\/\/(api|content)\.dropboxapi\.com\/2\//, '');
    calls.push(ep);
    assert.equal(init.headers.Authorization, 'Bearer t');
    const arg = init.headers['Dropbox-API-Arg'] ? JSON.parse(init.headers['Dropbox-API-Arg']) : JSON.parse(init.body || '{}');
    switch (ep) {
      case 'files/upload': assert.match(init.headers['Dropbox-API-Arg'], /^[\x00-\x7f]*$/); files.set(arg.path, String(init.body)); return json({path_display: arg.path});
      case 'files/download': return files.has(arg.path) ? new Response(files.get(arg.path)) : json({}, 409);
      case 'files/delete_v2': return files.delete(arg.path) ? json({}) : json({}, 409);
      case 'files/list_folder': {
        const entries = [...files.keys()].filter(p => p.startsWith(arg.path + '/')).map(p => ({'.tag': 'file', name: p.split('/').pop(), path_lower: p.toLowerCase()}));
        return entries.length ? json({entries, has_more: false}) : json({}, 409);
      }
      case 'files/save_url': if (failSave) return json({'.tag': 'async_job_id', async_job_id: 'bad'}); files.set(arg.path, pages[arg.url] ?? ''); return json({'.tag': 'async_job_id', async_job_id: 'job'});
      case 'files/save_url/check_job_status': return json({'.tag': arg.async_job_id === 'bad' ? 'failed' : (calls.filter(c => c === ep).length < 2 ? 'in_progress' : 'complete')});
      default: return json({}, 404);
    }
  };
  const db = new KitchenDropbox({access_token: 't', expires: Date.now() + 3600e3}, () => {}, transport, async () => {});
  return {db, files, calls};
}

const recipe = (id, extra = {}) => ({v: 1, id, title: id, source: 'example.it', tags: ['pane'], times: {total: 30}, serves: 2, ingredients: ['1 egg'], steps: [], addedAt: '2026-11-24T10:00:00.000Z', ...extra});

test('sign-in asks for write access but never sends a secret', () => {
  const u = new URL(authURL('key', 'https://x.test/tools/cookbook.html', 's', 'c'));
  assert.equal(u.searchParams.get('scope'), SCOPES);
  assert.match(SCOPES, /files\.content\.write/);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.has('client_secret'), false);
});

test('Dropbox-API-Arg is ASCII even for Italian names', () => {
  assert.equal(apiArg({path: '/books/Pane è roba dolce.pdf'}), '{"path":"/books/Pane \\u00e8 roba dolce.pdf"}');
  assert.deepEqual(JSON.parse(apiArg({path: '/è'})), {path: '/è'});
});

test('saving recipes writes the file and keeps the index in step', async () => {
  const {db, files} = fakeDropbox();
  const a = new Archive(db);
  await a.save(recipe('pasta-e-fagioli-1'));
  const {list} = await a.save(recipe('focaccia-2', {addedAt: '2026-11-25T10:00:00.000Z'}));
  assert.deepEqual(list.map(s => s.id), ['focaccia-2', 'pasta-e-fagioli-1']);
  assert.ok(files.has(recipePath('focaccia-2')));
  assert.equal(JSON.parse(files.get(PATHS.index)).recipes.length, 2);
  assert.equal((await a.get('focaccia-2')).title, 'focaccia-2');
});

test('saving the same recipe again updates it instead of duplicating', async () => {
  const {db} = fakeDropbox();
  const a = new Archive(db);
  await a.save(recipe('r-1'));
  const {list} = await a.save(recipe('r-1', {title: 'Renamed'}));
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Renamed');
});

test('the index heals itself from the recipe files', async () => {
  const {db, files} = fakeDropbox();
  files.set(recipePath('added-elsewhere'), JSON.stringify(recipe('added-elsewhere')));
  files.set(PATHS.index, JSON.stringify({recipes: [{id: 'deleted-elsewhere', title: 'gone'}]}));
  const list = await new Archive(db).index();
  assert.deepEqual(list.map(s => s.id), ['added-elsewhere']);
  assert.deepEqual(JSON.parse(files.get(PATHS.index)).recipes.map(s => s.id), ['added-elsewhere']);
});

test('an empty archive is fine', async () => {
  const {db} = fakeDropbox();
  assert.deepEqual(await new Archive(db).index(), []);
  assert.deepEqual(await new Archive(db).books(), []);
});

test('removing a recipe deletes the file and its index entry', async () => {
  const {db, files} = fakeDropbox();
  const a = new Archive(db);
  await a.save(recipe('keep'));
  await a.save(recipe('bin'));
  const list = await a.remove('bin');
  assert.deepEqual(list.map(s => s.id), ['keep']);
  assert.equal(files.has(recipePath('bin')), false);
});

test('fetching a page goes through Dropbox, waits for the job and tidies the inbox', async () => {
  const {db, files, calls} = fakeDropbox({pages: {'https://site.test/r': '<html>recipe page</html>'}});
  const html = await new Archive(db).fetchPage('https://site.test/r', 123);
  assert.equal(html, '<html>recipe page</html>');
  assert.equal(calls.filter(c => c === 'files/save_url/check_job_status').length, 2);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(files.has('/inbox/123.html'), false);
});

test('a site that blocks Dropbox gives a way forward', async () => {
  const {db} = fakeDropbox({failSave: true});
  await assert.rejects(new Archive(db).fetchPage('https://blocked.test/r'), /bookmarklet/);
});

test('books lists only PDFs and ebooks, sorted', async () => {
  const {db, files} = fakeDropbox();
  files.set('/books/Tartine.pdf', 'x'); files.set('/books/Simili.pdf', 'x'); files.set('/books/notes.txt', 'x');
  assert.deepEqual((await new Archive(db).books()).map(f => f.name), ['Simili.pdf', 'Tartine.pdf']);
});

test('expired access refreshes once for content requests too', async () => {
  let n = 0;
  const db = new KitchenDropbox({key: 'k', access_token: 'old', refresh_token: 'r', expires: Date.now() + 3600e3}, () => {}, async url => {
    if (url.includes('oauth2/token')) return json({access_token: 'new', expires_in: 14400});
    n++; return n === 1 ? json({}, 401) : new Response('hello');
  });
  assert.equal(await db.download('/x.json'), 'hello');
  assert.equal(n, 2);
});
