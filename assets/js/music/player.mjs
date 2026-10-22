import {AUDIO, Dropbox, random, challenge, callbackURL, authURL, validateCallback, inFolder, track, shuffled} from './core.mjs';
const $=id=>document.getElementById(id), audio=$('audio');
const KEY='ep-music-key-v1', AUTH='ep-music-auth-v1', PENDING='ep-music-pending-v1', STATE='ep-music-state-v1';
const read=(storage,key,fallback=null)=>{try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}};
function write(storage,key,value){storage.setItem(key,JSON.stringify(value));}
let session=read(localStorage,AUTH)||read(sessionStorage,AUTH), db, accountGeneration=0, browseGeneration=0, scanGeneration=0, playGeneration=0;
let saved=read(localStorage,STATE)||read(sessionStorage,STATE,{}), root=saved.root??null, folder=saved.folder??'', entries=[], indexed=null, queue=saved.queue||[], current=saved.current??-1, shuffle=!!saved.shuffle, repeat=saved.repeat||'off', history=[], upcoming=[], savedTime=Number(saved.time)||0, saveTimer=0, selecting=false;
let linkCache=new Map(), scanning=false;
$('app-key').value=read(localStorage,KEY,''); $('callback').textContent=callbackURL(location.href); $('remember').checked=!!read(localStorage,AUTH);
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function error(e){status(e.message || 'Something went wrong. Please try again.',true);}
function storage(){return session?.remember?localStorage:sessionStorage;}
function saveSession(value){session=value;write(storage(),AUTH,value);}
function save(){if(!db)return;const value={root,folder,queue,current,shuffle,repeat,names:displayNames,time:audio.currentTime||savedTime||0};try{write(storage(),STATE,value);}catch{status('Browser storage is full. Playback will work, but the queue could not be saved.',true);}}
function action(fn){return async(...args)=>{try{await fn(...args);}catch(e){error(e);}};}
function element(tag,text,cls){const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
function button(text,fn,label){const b=element('button',text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',action(fn));return b;}
const title=name=>String(name||'').replace(AUDIO,'');let displayNames=saved.names||{};
function resetOrder(){history=[];upcoming=[];}
function filtered(){const q=$('search').value.trim().toLowerCase();return (indexed||entries).filter(f=>!q || (f.name+' '+(f.path_display||'')).toLowerCase().includes(q));}
function tracksShown(){return filtered().filter(f=>f['.tag']==='file'&&AUDIO.test(f.name)).map(track);}
function updateMode(){
 $('shuffle').setAttribute('aria-pressed',String(shuffle));$('repeat').textContent='Repeat: '+repeat;
 $('scan').disabled=selecting||root===null||scanning;$('cancel-scan').hidden=!scanning;
 $('play-folder').disabled=$('add-folder').disabled=selecting||tracksShown().length===0;
 $('change-folder').hidden=selecting;$('select-folder').hidden=!selecting;
 $('up').disabled=folder==='' || (!selecting&&folder===root);
 $('search').placeholder=indexed?'Search all music…':'Filter this folder…';
}
function drawFiles(){
 const list=$('files');list.replaceChildren();
 const files=filtered().filter(f=>f['.tag']==='folder'||AUDIO.test(f.name)).sort((a,b)=>(a['.tag']==='folder'?0:1)-(b['.tag']==='folder'?0:1)||a.name.localeCompare(b.name,undefined,{numeric:true}));
 $('result-count').textContent=files.length+' '+(files.length===1?'item':'items')+(indexed?' · whole music folder':'');
 for(const f of files){
  const li=element('li',null,'row'),isFolder=f['.tag']==='folder';
  const name=button((isFolder?'↳ ':'')+(isFolder?f.name:title(f.name)),()=>{if(isFolder){displayNames[f.path_lower]=f.path_display||f.name;return browse(f.path_lower);}return playFromList(track(f));},(isFolder?'Open folder ':'Play ')+f.name);name.className='name';
  if(indexed&&!isFolder)name.append(element('small',f.path_display?.slice(0,-f.name.length)||''));
  li.append(name);if(!isFolder&&!selecting)li.append(button('+',()=>{queue.push(track(f));drawQueue();save();},'Add '+f.name+' to queue'));
  if(selecting&&!isFolder)name.disabled=true;
  list.append(li);
 }
 updateMode();
}
function drawQueue(){
 $('queue').replaceChildren();$('queue-count').textContent=queue.length+' '+(queue.length===1?'track':'tracks');
 for(let i=0;i<queue.length;i++){
  const f=queue[i],li=element('li',null,'row'+(i===current?' active':''));
  const b=button(title(f.name),()=>play(i));b.className='name';if(i===current)b.setAttribute('aria-current','true');li.append(b);
  li.append(button('×',()=>remove(i),'Remove '+f.name+' from queue'));$('queue').append(li);
 }
 $('previous').disabled=$('next').disabled=!queue.length;
}
async function browse(path){
 if(!db)return;
 if(!selecting&&root!==null&&!inFolder(path,root))throw Error('Choose another music folder to browse outside this library.');
 ++scanGeneration;scanning=false;const version=++browseGeneration,gen=accountGeneration;indexed=null;$('search').value='';status('Opening folder…');
 const data=await db.list(path);
 if(version!==browseGeneration||gen!==accountGeneration)return;
 folder=path;entries=data;const shown=displayNames[folder]||folder;$('path').textContent=shown||'Dropbox';$('folder-title').textContent=selecting?'Choose your music folder':(shown.split('/').pop()||'Music');
 drawFiles();save();status(data.length?'':'This folder is empty.');
}
async function scan(){
 if(root===null||selecting)return;
 const version=++scanGeneration,gen=accountGeneration;scanning=true;updateMode();status('Searching your music folder…');
 try{
  const data=await db.list(root,true,n=>{if(version!==scanGeneration||gen!==accountGeneration)throw Error('Search cancelled.');status('Searching… '+n+' files and folders checked.');});
  if(version!==scanGeneration||gen!==accountGeneration)return;
  indexed=data.filter(f=>f['.tag']==='file'&&AUDIO.test(f.name)&&inFolder(f.path_lower,root));$('search').value='';drawFiles();status('All music loaded. Search by filename, artist folder or album folder.');
 }finally{if(version===scanGeneration){scanning=false;updateMode();}}
}
function stopScan(){++scanGeneration;scanning=false;updateMode();status('Search cancelled.');}
async function playFromList(file){const list=tracksShown();queue=list;current=-1;resetOrder();await play(Math.max(0,list.findIndex(f=>f.id===file.id)));}
function showNow(f){$('now').replaceChildren(document.createTextNode(title(f.name)),element('small',(f.display?.slice(0,-f.name.length)||'').split('/').filter(Boolean).join(' / '), 'muted'));}
async function load(i,autoplay=true,resumeTime=0){
 if(!db||!queue[i])return;
 const version=++playGeneration, gen=accountGeneration,f=queue[i];
 audio.pause();audio.removeAttribute('src');audio.load();current=i;savedTime=resumeTime;drawQueue();showNow(f);$('resume').hidden=true;status('Loading '+f.name+'…');
 let cached=linkCache.get(f.path);if(!cached||cached.expires<Date.now())cached={url:await db.stream(f.path),expires:Date.now()+3*3600000};
 if(version!==playGeneration||gen!==accountGeneration)return;
 linkCache.set(f.path,cached);audio.src=cached.url;
 const seek=()=>{if(version!==playGeneration)return;if(resumeTime>0&&Number.isFinite(audio.duration))audio.currentTime=Math.min(resumeTime,Math.max(0,audio.duration-1));savedTime=0;};
 audio.addEventListener('loadedmetadata',seek,{once:true});audio.load();
 if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:f.name.replace(AUDIO,''),album:f.display?.split('/').slice(-2,-1).join('')||'Dropbox'});}
 save();
 if(autoplay){try{await audio.play();status('');}catch{if(version===playGeneration)status('Track ready. Press play.');}}
 else status('Saved track ready. Press play to continue.');
}
async function play(i){if(current>=0&&current!==i)history.push(current);upcoming=upcoming.filter(n=>n!==i);await load(i);}
async function advance(ended=false){
 if(!queue.length)return;
 if(ended&&repeat==='one'){audio.currentTime=0;await audio.play();return;}
 let target;
 if(shuffle){if(!upcoming.length){if(ended&&new Set([...history,current]).size>=queue.length&&repeat==='off'){status('Queue finished.');return;}if(repeat==='all'&&new Set([...history,current]).size>=queue.length)history=[];upcoming=shuffled(queue.map((_,i)=>i).filter(i=>i!==current));}target=upcoming.shift();if(target===undefined&&repeat==='all')target=current;}
 else {target=current+1;if(target>=queue.length){if(repeat==='all')target=0;else{status('Queue finished.');return;}}}
 if(target!==undefined)await play(target);
}
async function previous(){if(audio.currentTime>3){audio.currentTime=0;return;}const target=history.pop();await load(target??Math.max(0,current-1));}
function remove(i){const wasCurrent=i===current;queue.splice(i,1);resetOrder();if(wasCurrent){++playGeneration;audio.pause();audio.removeAttribute('src');audio.load();current=-1;savedTime=0;$('now').textContent='Choose a track';}else if(i<current)current--;drawQueue();save();}
async function connect(){
 const key=$('app-key').value.trim()||read(localStorage,KEY,'');if(!/^[A-Za-z0-9_-]{5,100}$/.test(key)){$('setup').open=true;$('app-key').focus();throw Error('Add your Dropbox app key in First-time setup, then connect.');}
 if(!crypto.subtle)throw Error('Open this player over HTTPS to connect Dropbox.');
 write(localStorage,KEY,key);const verifier=random(),state=random(),redirect=callbackURL(location.href);
 write(sessionStorage,PENDING,{key,verifier,state,redirect,remember:$('remember').checked,created:Date.now()});
 location.assign(authURL(key,redirect,state,await challenge(verifier)));
}
async function callback(){
 const u=new URL(location.href);if(!u.searchParams.has('code')&&!u.searchParams.has('error'))return;
 const pending=read(sessionStorage,PENDING);sessionStorage.removeItem(PENDING);historyReplace();
 validateCallback(pending,u.searchParams.get('state'));
 if(u.searchParams.has('error'))throw Error('Dropbox connection was cancelled. You can connect again when ready.');
 localStorage.removeItem(AUTH);sessionStorage.removeItem(AUTH);session={key:pending.key,remember:pending.remember};db=new Dropbox(session,saveSession);
 await db.token({client_id:pending.key,grant_type:'authorization_code',code:u.searchParams.get('code'),code_verifier:pending.verifier,redirect_uri:pending.redirect});
 // A new authorisation starts a fresh library, preventing files from another account carrying over.
 root=null;folder='';queue=[];current=-1;savedTime=0;resetOrder();localStorage.removeItem(STATE);sessionStorage.removeItem(STATE);
}
function historyReplace(){window.history.replaceState(null,'',callbackURL(location.href));}
async function ready(){
 db=db||new Dropbox(session,saveSession);$('connection').hidden=true;$('disconnect').hidden=false;$('browser').hidden=false;$('player').hidden=false;
 selecting=root===null;drawQueue();updateMode();await browse(selecting?'':(inFolder(folder,root)?folder:root));
 if(queue[current]){showNow(queue[current]);$('resume').hidden=false;}
}
async function disconnect(){
 const old=db;const access=old?.session.access_token;++accountGeneration;++browseGeneration;++scanGeneration;++playGeneration;
 old?.close();db=null;session=null;scanning=false;audio.pause();audio.removeAttribute('src');audio.load();linkCache.clear();
 for(const s of [localStorage,sessionStorage]){s.removeItem(AUTH);s.removeItem(STATE);s.removeItem(PENDING);}
 queue=[];entries=[];indexed=null;root=null;folder='';current=-1;savedTime=0;resetOrder();$('files').replaceChildren();$('queue').replaceChildren();$('search').value='';$('now').textContent='Choose a track';
 $('connection').hidden=false;$('disconnect').hidden=true;$('browser').hidden=true;$('player').hidden=true;status('Disconnected. This browser’s connection and listening history have been cleared.');
 if('mediaSession' in navigator)navigator.mediaSession.metadata=null;
 if(access)fetch('https://api.dropboxapi.com/2/auth/token/revoke',{method:'POST',headers:{Authorization:'Bearer '+access},referrerPolicy:'no-referrer'}).catch(()=>{});
}
$('connect').addEventListener('click',action(connect));$('disconnect').addEventListener('click',action(disconnect));
$('save-key').addEventListener('click',()=>{const key=$('app-key').value.trim();if(!/^[A-Za-z0-9_-]{5,100}$/.test(key)){error(Error('Enter the app key shown in Dropbox’s App Console.'));return;}write(localStorage,KEY,key);status('App key saved. You can connect Dropbox now.');$('setup').open=false;});
$('copy').addEventListener('click',action(async()=>{await navigator.clipboard.writeText(callbackURL(location.href));status('Redirect address copied.');}));
$('up').addEventListener('click',action(()=>browse(folder.split('/').slice(0,-1).join('/'))));
$('refresh').addEventListener('click',action(()=>browse(folder)));
$('select-folder').addEventListener('click',action(async()=>{++playGeneration;audio.pause();audio.removeAttribute('src');audio.load();root=folder;selecting=false;queue=[];current=-1;savedTime=0;$('now').textContent='Choose a track';resetOrder();save();drawQueue();drawFiles();status('Music folder selected. Open an album or search the whole folder.');}));
$('change-folder').addEventListener('click',action(async()=>{stopScan();selecting=true;await browse('');}));
$('scan').addEventListener('click',action(scan));$('cancel-scan').addEventListener('click',stopScan);$('search').addEventListener('input',drawFiles);
$('play-folder').addEventListener('click',action(async()=>{queue=tracksShown();current=-1;resetOrder();await play(0);}));
$('add-folder').addEventListener('click',()=>{queue.push(...tracksShown());drawQueue();save();status('Tracks added to the queue.');});
$('clear-queue').addEventListener('click',()=>{++playGeneration;audio.pause();audio.removeAttribute('src');audio.load();queue=[];current=-1;savedTime=0;resetOrder();$('now').textContent='Choose a track';$('resume').hidden=true;drawQueue();save();});
$('previous').addEventListener('click',action(previous));$('next').addEventListener('click',action(()=>advance()));$('resume').addEventListener('click',action(()=>load(current,true,savedTime)));
$('shuffle').addEventListener('click',()=>{shuffle=!shuffle;resetOrder();updateMode();save();});$('repeat').addEventListener('click',()=>{repeat=({off:'all',all:'one',one:'off'})[repeat]||'off';updateMode();save();});
 audio.addEventListener('ended',action(()=>advance(true)));audio.addEventListener('error',()=>{if(audio.getAttribute('src')){const f=queue[current];if(f)linkCache.delete(f.path);status('This track could not play. Its format may not be supported, or its link may have expired. Select the track again to retry.',true);}});
 audio.addEventListener('play',()=>{status('');if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';});
 audio.addEventListener('pause',()=>{save();if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused';});
 audio.addEventListener('timeupdate',()=>{if(Date.now()-saveTimer>5000){saveTimer=Date.now();savedTime=0;save();}if('mediaSession' in navigator&&navigator.mediaSession.setPositionState&&Number.isFinite(audio.duration)&&audio.duration>0)try{navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,audio.duration)});}catch{}});
 window.addEventListener('pagehide',save);
 if('mediaSession' in navigator)for(const [name,fn] of Object.entries({play:()=>audio.getAttribute('src')?audio.play():load(current,true,savedTime),pause:()=>audio.pause(),previoustrack:previous,nexttrack:()=>advance(),seekto:d=>{audio.currentTime=d.seekTime;}})){try{navigator.mediaSession.setActionHandler(name,action(fn));}catch{}}
 try{await callback();if(session?.access_token||session?.refresh_token)await ready();else{$('setup').open=!$('app-key').value;status('Connect Dropbox to open your music.');}}catch(e){error(e);if(!session?.access_token){db=null;session=null;}}
