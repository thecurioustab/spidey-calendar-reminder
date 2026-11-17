const $ = (id) => document.getElementById(id);
const status = $('status');

function setStatus(kind, text) {
  status.className = `status ${kind}`;
  status.textContent = text;
}

// Provider tabs
document.querySelectorAll('[role=tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', t === tab));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  });
});

document.querySelectorAll('[data-open]').forEach((a) => {
  a.addEventListener('click', (e) => { e.preventDefault(); window.setup.openUrl(a.dataset.open); });
});

$('reveal').addEventListener('click', () => {
  const show = $('link').type === 'password';
  $('link').type = show ? 'text' : 'password';
  $('reveal').textContent = show ? 'Hide' : 'Show';
});

$('cancel').addEventListener('click', () => window.close());

$('remove').addEventListener('click', async () => {
  await window.setup.remove();
  $('link').value = '';
  $('remove').hidden = true;
  setStatus('', 'Link removed. Spidey will stop checking this calendar.');
});

async function save() {
  const btn = $('save');
  btn.disabled = true;
  setStatus('busy', 'Checking your calendar…');
  try {
    const r = await window.setup.save($('link').value);
    if (!r.ok) { setStatus('err', r.error); return; }
    const n = r.count;
    setStatus('ok', `✓ Connected! Found ${n} meeting${n === 1 ? '' : 's'} in the next 24 hours.`);
    setTimeout(() => window.close(), 1600);
  } finally {
    btn.disabled = false;
  }
}
$('save').addEventListener('click', save);
$('link').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

(async () => {
  const s = await window.setup.status();
  if (s.hasLink) {
    $('remove').hidden = false;
    $('link').placeholder = 'A link is saved. Paste a new one to replace it.';
    setStatus('', 'A calendar link is already saved.');
  }
  $('link').focus();
})();
