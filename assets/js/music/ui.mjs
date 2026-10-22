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
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); play.click(); }
  else if (e.key === 'ArrowRight' && !$('next').disabled) { e.preventDefault(); $('next').click(); }
  else if (e.key === 'ArrowLeft' && !$('previous').disabled) { e.preventDefault(); $('previous').click(); }
});
paint();
