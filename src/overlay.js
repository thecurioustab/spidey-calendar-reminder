// Renderer for the transparent overlay window. Talks to main via window.spidey (preload.js).
const $ = (id) => document.getElementById(id);
let current = null;
let tick = null;
let autoHide = null;

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function updateCountdown() {
  if (!current) return;
  if (current.note) { $('when').textContent = current.note; return; }
  const start = new Date(current.start);
  const mins = Math.round((start - Date.now()) / 60000);
  const el = $('when');
  el.classList.toggle('now', mins <= 0);
  if (mins > 1) el.textContent = `Starts in ${mins} minutes · ${fmtTime(start)}`;
  else if (mins === 1) el.textContent = `Starts in 1 minute · ${fmtTime(start)}`;
  else if (mins === 0) el.textContent = `Starting now · ${fmtTime(start)}`;
  else el.textContent = `Started ${-mins} min ago · ${fmtTime(start)}`;
}

function show(ev) {
  current = ev;
  $('title').textContent = ev.title || '(No title)';
  const meta = [ev.location, ev.calendarName].filter(Boolean).join(' · ');
  $('meta').textContent = meta;
  $('join').hidden = !ev.joinUrl;
  $('open').hidden = !ev.htmlLink;
  updateCountdown();
  clearInterval(tick);
  tick = setInterval(updateCountdown, 15000);

  document.body.classList.remove('leave');
  // restart the CSS animations
  document.body.classList.remove('show');
  void document.body.offsetWidth;
  document.body.classList.add('show');

  clearTimeout(autoHide);
  autoHide = setTimeout(() => leave('timeout'), (ev.autoHideSeconds || 90) * 1000);
}

function leave(reason) {
  if (!current) return;
  clearTimeout(autoHide);
  clearInterval(tick);
  const ev = current;
  current = null;
  document.body.classList.add('leave');
  setTimeout(() => {
    document.body.classList.remove('show', 'leave');
    window.spidey.done(ev.key, reason);
  }, 650);
}

$('join').addEventListener('click', () => { current && window.spidey.openUrl(current.joinUrl); leave('join'); });
$('open').addEventListener('click', () => { current && window.spidey.openUrl(current.htmlLink); leave('open'); });
$('snooze').addEventListener('click', () => leave('snooze'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') leave('dismiss'); });

// The window ignores the mouse except over the bubble, so clicks pass through to apps below.
const bubble = $('bubble');
bubble.addEventListener('mouseenter', () => window.spidey.setInteractive(true));
bubble.addEventListener('mouseleave', () => window.spidey.setInteractive(false));

window.spidey.onShow(show);
window.spidey.ready();
