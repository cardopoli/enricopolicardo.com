export const SCOPES = 'files.metadata.read files.content.read';
export const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|aif|aiff)$/i;
export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export async function challenge(verifier) { return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }
export function callbackURL(href) { const u = new URL(href); u.search = ''; u.hash = ''; return u.href; }
export function authURL(key, redirect, state, codeChallenge) {
  const u = new URL('https://www.dropbox.com/oauth2/authorize');
  u.search = new URLSearchParams({client_id:key, response_type:'code', redirect_uri:redirect, state, code_challenge:codeChallenge, code_challenge_method:'S256', token_access_type:'offline', scope:SCOPES});
  return u.href;
}
export function validateCallback(pending, state, now = Date.now()) {
  if (!pending || !state || pending.state !== state || now - pending.created > 600000 || now < pending.created || !pending.verifier) throw Error('This sign-in has expired or belongs to another tab. Connect Dropbox again.');
}
export function inFolder(path, root) { const p=String(path).toLowerCase(), r=String(root).toLowerCase(); return r === '' || p === r || p.startsWith(r + '/'); }
export function track(file) { return {id:file.id, name:file.name, path:file.path_lower, display:file.path_display || file.path_lower}; }
export function shuffled(items, random = Math.random) { const a=[...items]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
export class Dropbox {
  constructor(session, save, transport = fetch) { this.session=session; this.save=save; this.transport=transport; this.refreshing=null; this.closed=false; }
  async token(form) {
    const r=await this.transport('https://api.dropboxapi.com/oauth2/token',{method:'POST',body:new URLSearchParams(form),referrerPolicy:'no-referrer'});
    const d=await r.json();
    if(!r.ok || !d.access_token) throw Error('Dropbox connection expired. Disconnect and connect again.');
    if(this.closed) throw Error('Disconnected.');
    this.session={...this.session, access_token:d.access_token, refresh_token:d.refresh_token || this.session.refresh_token, expires:Date.now()+(d.expires_in || 14400)*1000}; this.save(this.session); return this.session.access_token;
  }
  async access(force=false) {
    if(this.closed) throw Error('Disconnected.');
    if(!force && this.session.access_token && this.session.expires > Date.now()+60000) return this.session.access_token;
    if(!this.session.refresh_token) throw Error('Connect Dropbox again.');
    if(!this.refreshing) this.refreshing=this.token({grant_type:'refresh_token',refresh_token:this.session.refresh_token,client_id:this.session.key}).finally(()=>this.refreshing=null);
    return this.refreshing;
  }
  async api(endpoint, body, retry=true) {
    const token=await this.access();
    const r=await this.transport('https://api.dropboxapi.com/2/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),referrerPolicy:'no-referrer'});
    if(this.closed) throw Error('Disconnected.');
    if(r.status===401 && retry){ await this.access(true); return this.api(endpoint,body,false); }
    if(r.status===429) throw Error('Dropbox is busy. Wait a minute, then try again.');
    if(!r.ok) throw Error(r.status===409 ? 'Dropbox could not open this folder or file. It may have moved, or the app may need Full Dropbox access.' : 'Dropbox request failed ('+r.status+'). Try again.');
    return r.json();
  }
  async list(path, recursive=false, progress=()=>{}) {
    let d=await this.api('files/list_folder',{path,recursive,include_deleted:false,limit:2000}), entries=[...d.entries]; progress(entries.length);
    while(d.has_more){ d=await this.api('files/list_folder/continue',{cursor:d.cursor}); entries.push(...d.entries); progress(entries.length); }
    return entries;
  }
  async stream(path) {
    const d=await this.api('files/get_temporary_link',{path}); const u=new URL(d.link);
    if(u.protocol!=='https:' || !(u.hostname==='dropboxusercontent.com' || u.hostname.endsWith('.dropboxusercontent.com'))) throw Error('Dropbox returned an unexpected playback address.');
    return u.href;
  }
  close(){this.closed=true;this.session={};}
}
