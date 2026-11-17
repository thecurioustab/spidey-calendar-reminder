// Renderer for reminders.html. Storage and repeat logic live in reminder-store.js (main process).
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

const REPEAT_LABEL = { none: '', daily: 'every day', weekdays: 'weekdays', weekly: 'every week' };

function setStatus(kind, text) {
  $('status').className = `status ${kind}`;
  $('status').textContent = text;
}

function resetForm() {
  // Default: the next half hour.
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  $('date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  $('time').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('title').value = '';
  $('link').value = '';
  $('repeat').value = 'none';
  $('lead').value = '';
}

function describe(r, defaultLead) {
  if (!r.next) return 'Done';
  const d = new Date(r.next);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const day = sameDay(d, today) ? 'Today' : sameDay(d, tomorrow) ? 'Tomorrow'
    : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const lead = r.leadMinutes === null ? defaultLead : r.leadMinutes;
  const parts = [`${day}, ${time}`];
  if (REPEAT_LABEL[r.repeat]) parts.push(`repeats ${REPEAT_LABEL[r.repeat]}`);
  parts.push(lead === 0 ? 'alert at the time' : `alert ${lead} min before`);
  if (r.link) parts.push('has link');
  return parts.join(' · ');
}

async function render() {
  const { reminders, defaultLead } = await window.setup.listReminders();
  $('lead').options[0].textContent = `Default (${defaultLead} min before)`;
  const ul = $('list');
  ul.replaceChildren();
  for (const r of reminders) {
    const li = document.createElement('li');
    if (!r.next) li.className = 'done';
    const info = document.createElement('div');
    info.className = 'info';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = r.title;
    const w = document.createElement('div');
    w.className = 'w';
    w.textContent = describe(r, defaultLead);
    info.append(t, w);
    const del = document.createElement('button');
    del.className = 'ghost danger';
    del.type = 'button';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', `Delete reminder ${r.title}`);
    del.addEventListener('click', async () => { await window.setup.deleteReminder(r.id); render(); });
    li.append(info, del);
    ul.append(li);
  }
  $('empty').hidden = reminders.length > 0;
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('date').value || !$('time').value) { setStatus('err', 'Pick a date and time.'); return; }
  const [y, mo, d] = $('date').value.split('-').map(Number);
  const [h, mi] = $('time').value.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, mi, 0, 0);
  const res = await window.setup.addReminder({
    title: $('title').value,
    start: start.toISOString(),
    repeat: $('repeat').value,
    leadMinutes: $('lead').value,
    link: $('link').value,
  });
  if (!res.ok) { setStatus('err', res.error); return; }
  setStatus('ok', '✓ Added!');
  setTimeout(() => setStatus('', ''), 2500);
  resetForm();
  render();
  $('title').focus();
});

$('close').addEventListener('click', () => window.close());
$('calendar').addEventListener('click', () => window.setup.openCalendarSetup());

resetForm();
render();
$('title').focus();
// Keep "Today / Done" labels fresh if the window stays open.
setInterval(render, 60 * 1000);
