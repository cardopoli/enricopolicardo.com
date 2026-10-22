// Player bar for tools/music.html: one round play button, a hairline progress
// line and times. It only drives the <audio> element and the existing buttons;
// all Dropbox, queue and shuffle logic stays in player.mjs.
const $ = id => document.getElementById(id);
const audio = $('audio'), play = $('play'), icon = $('play-icon'), seek = $('seek');
const now = $('time-now'), total = $('time-total'), repeat = $('repeat');
const PLAY = 'M8 5v14l11-7z', PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
let dragging = false;

const clock = s => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const setIcon = playing => { icon.setAttribute('d', playing ? PAUSE : PLAY); play.setAttribute('aria-label', playing ? 'Pause' : 'Play'); };
const paint = () => {
  const d = audio.duration, ok = Number.isFinite(d) && d > 0;
  seek.disabled = !ok;
  total.textContent = clock(ok ? d : 0);
  if (!dragging) {
    const v = ok ? Math.round(audio.currentTime / d * 1000) : 0;
    seek.value = String(v);
    now.textContent = clock(audio.currentTime);
  }
  seek.style.setProperty('--p', (seek.value / 10) + '%');
};

play.addEventListener('click', () => {
  if (audio.getAttribute('src')) { audio.paused ? audio.play().catch(() => {}) : audio.pause(); return; }
  // nothing loaded yet: continue a saved track, else start the queue, else play the folder shown
  if (!$('resume').hidden) return $('resume').click();
  const first = document.querySelector('#queue .name');
  if (first) return first.click();
  if (!$('play-folder').disabled) $('play-folder').click();
});
audio.addEventListener('play', () => setIcon(true));
audio.addEventListener('pause', () => setIcon(false));
audio.addEventListener('emptied', () => { setIcon(false); paint(); });
for (const e of ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked']) audio.addEventListener(e, paint);

seek.addEventListener('input', () => {
  dragging = true;
  const d = audio.duration;
  if (Number.isFinite(d)) now.textContent = clock(seek.value / 1000 * d);
  seek.style.setProperty('--p', (seek.value / 10) + '%');
});
seek.addEventListener('change', () => {
  const d = audio.duration;
  if (Number.isFinite(d)) audio.currentTime = seek.value / 1000 * d;
  dragging = false;
});

// Repeat cycles off / all / one: light it up whenever it isn't off
const markRepeat = () => repeat.classList.toggle('on', !/off$/i.test(repeat.textContent));
new MutationObserver(markRepeat).observe(repeat, { childList: true, characterData: true, subtree: true });
markRepeat();

// Space plays and pauses, arrows skip - unless you're typing
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || $('player').hidden) return;
  if (e.target.closest?.('#np-open') && e.key === ' ') return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); play.click(); }
  else if (e.key === 'ArrowRight' && !$('next').disabled) { e.preventDefault(); $('next').click(); }
  else if (e.key === 'ArrowLeft' && !$('previous').disabled) { e.preventDefault(); $('previous').click(); }
});
paint();

// ── Full-screen "now playing" ────────────────────────────────────────────
// Mirrors the bar: same audio, same buttons (the full view's buttons press the
// bar's), cover large with its colours blurred behind. Tap the bar to open;
// "Library", Escape or a swipe down to close.
const full = $('full'), npOpen = $('np-open'), npArt = $('np-art');
const fArt = $('full-art'), fBg = $('full-bg'), fBgImg = $('full-bg-img'), fBlank = $('full-blank');
const fTitle = $('full-title'), fWhere = $('full-where'), fSeek = $('full-seek'), fNow = $('full-now'), fTotal = $('full-total');
const fIcon = $('full-play-icon');
let fDragging = false, lastFocus = null;

const hue = text => { let h = 0; for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function mirrorMeta() {
  const now = $('now'), small = now.querySelector('small');
  fTitle.textContent = small ? now.firstChild?.textContent || '' : now.textContent;
  fWhere.textContent = small ? small.textContent : '';
  const url = npArt.hidden ? '' : npArt.getAttribute('src') || '';
  for (const img of [fArt, fBgImg]) { if (url) { img.src = url; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; } }
  fBlank.hidden = !!url;
  // no cover: a quiet colour field made from the album's name, so each album still has its own look
  const h = hue(fWhere.textContent || fTitle.textContent);
  fBg.style.background = url ? '' : `radial-gradient(70% 55% at 30% 25%, hsl(${h} 32% 30%), transparent 70%), radial-gradient(60% 50% at 75% 70%, hsl(${(h + 40) % 360} 28% 22%), transparent 70%), #0e0e0e`;
  fBlank.style.background = url ? '' : `linear-gradient(145deg, hsl(${h} 30% 34%), hsl(${(h + 40) % 360} 26% 18%))`;
}
new MutationObserver(mirrorMeta).observe($('now'), { childList: true, characterData: true, subtree: true });
new MutationObserver(mirrorMeta).observe(npArt, { attributes: true, attributeFilter: ['src', 'hidden'] });
mirrorMeta();

const mirrorModes = () => {
  $('full-shuffle').textContent = $('shuffle').textContent;
  $('full-shuffle').classList.toggle('on', $('shuffle').getAttribute('aria-pressed') === 'true');
  $('full-repeat').textContent = repeat.textContent;
  $('full-repeat').classList.toggle('on', repeat.classList.contains('on'));
};
for (const el of [$('shuffle'), repeat]) new MutationObserver(mirrorModes).observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
mirrorModes();

const paintFull = () => {
  const d = audio.duration, ok = Number.isFinite(d) && d > 0;
  fSeek.disabled = !ok; fTotal.textContent = clock(ok ? d : 0);
  if (!fDragging) { fSeek.value = String(ok ? Math.round(audio.currentTime / d * 1000) : 0); fNow.textContent = clock(audio.currentTime); }
  fSeek.style.setProperty('--p', (fSeek.value / 10) + '%');
};
for (const e of ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked', 'emptied']) audio.addEventListener(e, paintFull);
fSeek.addEventListener('input', () => { fDragging = true; const d = audio.duration; if (Number.isFinite(d)) fNow.textContent = clock(fSeek.value / 1000 * d); fSeek.style.setProperty('--p', (fSeek.value / 10) + '%'); });
fSeek.addEventListener('change', () => { const d = audio.duration; if (Number.isFinite(d)) audio.currentTime = fSeek.value / 1000 * d; fDragging = false; });
const fullIcon = playing => { fIcon.setAttribute('d', playing ? PAUSE : PLAY); $('full-play').setAttribute('aria-label', playing ? 'Pause' : 'Play'); };
audio.addEventListener('play', () => fullIcon(true)); audio.addEventListener('pause', () => fullIcon(false)); audio.addEventListener('emptied', () => fullIcon(false));

// the full view's buttons press the bar's, so there is one source of truth
for (const [mine, theirs] of [['full-prev', 'previous'], ['full-play', 'play'], ['full-next', 'next'], ['full-shuffle', 'shuffle'], ['full-repeat', 'repeat']])
  $(mine).addEventListener('click', () => $(theirs).click());
new MutationObserver(() => { $('full-prev').disabled = $('previous').disabled; $('full-next').disabled = $('next').disabled; })
  .observe($('previous'), { attributes: true, attributeFilter: ['disabled'] });
$('full-prev').disabled = $('previous').disabled; $('full-next').disabled = $('next').disabled;

function openFull() {
  if (!full.hidden) return;
  lastFocus = document.activeElement; mirrorMeta(); mirrorModes(); paintFull(); fullIcon(!audio.paused);
  full.hidden = false; document.body.classList.add('full-open'); $('full-play').focus({ preventScroll: true });
}
function closeFull() {
  if (full.hidden) return;
  full.hidden = true; document.body.classList.remove('full-open'); (lastFocus || npOpen).focus?.({ preventScroll: true });
}
npOpen.addEventListener('click', e => { if (!e.target.closest('.progress')) openFull(); });
npOpen.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === npOpen) { e.preventDefault(); openFull(); } });
$('full-close').addEventListener('click', closeFull);
addEventListener('keydown', e => { if (e.key === 'Escape') closeFull(); });
let startY = null;
full.addEventListener('touchstart', e => { startY = e.target.closest('.progress') ? null : e.touches[0].clientY; }, { passive: true });
full.addEventListener('touchend', e => { if (startY !== null && e.changedTouches[0].clientY - startY > 90) closeFull(); startY = null; }, { passive: true });
