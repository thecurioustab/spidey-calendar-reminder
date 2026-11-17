const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { normalizeLink, fetchIcs, upcomingFromIcs, calendarWebUrl } = require('./ics');
const { Reminders } = require('./reminder-store');

const APP_DIR = path.join(__dirname, '..');
const ASSETS = path.join(APP_DIR, 'assets');
const TICK_MS = 30 * 1000;          // how often we check whether a reminder is due
const FETCH_MS = 2 * 60 * 1000;     // how often we re-download the calendar
const LOOKAHEAD_MIN = 180;          // keep the next 3 hours of meetings in memory
const SNOOZE_MS = 2 * 60 * 1000;
const WIN_W = 580;
const WIN_H = 560;

// Dev hook: SPIDEY_USER_DATA=<folder> runs with separate settings/reminders (for testing).
if (process.env.SPIDEY_USER_DATA) app.setPath('userData', process.env.SPIDEY_USER_DATA);

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('com.spidey.calendar-reminder');

// ---------- settings ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const defaults = { leadMinutes: 10, paused: false, calendarLink: null, setupSeen: false };
let settings = { ...defaults };
function loadSettings() {
  try { settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }; } catch {}
}
function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

// The calendar link works like a password, so keep it encrypted with the OS (Windows DPAPI).
function getLink() {
  const s = settings.calendarLink;
  if (!s) return '';
  try {
    return s.encrypted ? safeStorage.decryptString(Buffer.from(s.data, 'base64')) : s.data;
  } catch { return ''; }
}
function setLink(link) {
  if (!link) settings.calendarLink = null;
  else if (safeStorage.isEncryptionAvailable()) {
    settings.calendarLink = { encrypted: true, data: safeStorage.encryptString(link).toString('base64') };
  } else {
    settings.calendarLink = { encrypted: false, data: link };
  }
  saveSettings();
}
const hasLink = () => !!getLink();

// ---------- state ----------
let tray = null;
let overlay = null;
let overlayReady = false;
const windows = {};             // 'setup' | 'reminders' -> BrowserWindow
let reminders = null;
let tickTimer = null;
let lastFetch = 0;
let lastError = '';
let events = [];                  // cached upcoming meetings from the last calendar download
let allEvents = [];               // calendar meetings + your own reminders
const notified = new Set();       // event keys already shown
const snoozed = new Map();        // key -> { ev, at }
const queue = [];
let showing = null;

// ---------- overlay window ----------
function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: workArea.x + workArea.width - WIN_W,
    y: workArea.y,
    width: WIN_W,
    height: WIN_H,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.on('closed', () => { overlay = null; overlayReady = false; });
}

function positionOverlay() {
  if (!overlay) return;
  const { workArea } = screen.getPrimaryDisplay();
  overlay.setBounds({ x: workArea.x + workArea.width - WIN_W, y: workArea.y, width: WIN_W, height: WIN_H });
}

function enqueue(ev) {
  if (showing && showing.key === ev.key) return;
  if (queue.some((q) => q.key === ev.key)) return;
  queue.push(ev);
  queue.sort((a, b) => new Date(a.start) - new Date(b.start));
  pump();
}

function pump() {
  if (showing || !queue.length || !overlay || !overlayReady) return;
  showing = queue.shift();
  positionOverlay();
  overlay.showInactive();            // don't steal focus from whatever you're typing in
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.webContents.send('show-reminder', showing);
}

ipcMain.on('overlay-ready', () => { overlayReady = true; pump(); });
ipcMain.on('set-interactive', (_e, on) => {
  if (!overlay) return;
  overlay.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('open-url', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on('reminder-done', (_e, { key, reason }) => {
  const ev = showing;
  showing = null;
  if (overlay) {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.hide();
  }
  if (reason === 'snooze' && ev && ev.key === key && !ev.demo) {
    snoozed.set(key, { ev, at: Date.now() + SNOOZE_MS });
  }
  setTimeout(pump, 300);
});

// ---------- calendar polling ----------
async function refreshEvents(force = false) {
  const link = getLink();
  if (!link) { events = []; return; }
  if (!force && Date.now() - lastFetch < FETCH_MS) return;
  try {
    const ics = await fetchIcs(link);
    const web = calendarWebUrl(link);
    events = upcomingFromIcs(ics, LOOKAHEAD_MIN).map((e) => ({ ...e, htmlLink: web }));
    lastFetch = Date.now();
    lastError = '';
  } catch (err) {
    lastError = (err && err.message) || String(err);
    lastFetch = Date.now() - FETCH_MS + 30 * 1000;   // retry in ~30 s, keep the old events meanwhile
  }
}

async function tick(force = false) {
  checkSnoozes();
  if (!settings.paused && hasLink()) await refreshEvents(force);
  const now = Date.now();
  const own = reminders.eventsBetween(now - 60 * 1000, now + LOOKAHEAD_MIN * 60 * 1000);
  allEvents = [...events, ...own].sort((a, b) => new Date(a.start) - new Date(b.start));
  if (!settings.paused) {
    for (const ev of allEvents) {
      const msUntil = new Date(ev.start) - now;
      const lead = ev.leadMinutes == null ? settings.leadMinutes : ev.leadMinutes;
      if (msUntil <= lead * 60 * 1000 && msUntil > -60 * 1000 && !notified.has(ev.key)) {
        notified.add(ev.key);
        enqueue({ ...ev, autoHideSeconds: 90 });
      }
    }
  }
  refreshTray();
}

function checkSnoozes() {
  const now = Date.now();
  for (const [key, s] of snoozed) {
    if (s.at <= now) { snoozed.delete(key); enqueue(s.ev); }
  }
}

function startTicking() {
  clearInterval(tickTimer);
  tick(true);
  tickTimer = setInterval(() => tick(false), TICK_MS);
}

// ---------- normal windows (calendar setup, my reminders) ----------
const WINDOW_DEFS = {
  setup: { file: 'setup.html', width: 580, height: 600, title: 'Spidey Reminder - Connect your calendar' },
  reminders: { file: 'reminders.html', width: 560, height: 720, title: 'Spidey Reminder - My reminders' },
};

function openWindow(name) {
  const existing = windows[name];
  if (existing) { existing.show(); existing.focus(); return existing; }
  const def = WINDOW_DEFS[name];
  const win = new BrowserWindow({
    width: def.width,
    height: def.height,
    resizable: name === 'reminders',
    minWidth: 460,
    minHeight: 480,
    maximizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    title: def.title,
    icon: path.join(ASSETS, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'setup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, def.file));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { delete windows[name]; });
  windows[name] = win;
  if (name === 'setup' && !settings.setupSeen) { settings.setupSeen = true; saveSettings(); }
  return win;
}
const openSetup = () => openWindow('setup');
const openReminders = () => openWindow('reminders');

ipcMain.on('open-window', (_e, name) => { if (WINDOW_DEFS[name]) openWindow(name); });

// ---------- your own reminders ----------
ipcMain.handle('reminders:list', () => ({ reminders: reminders.list(), defaultLead: settings.leadMinutes }));
ipcMain.handle('reminders:add', async (_e, input) => {
  try {
    reminders.add(input || {});
    await tick(false);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});
ipcMain.handle('reminders:delete', async (_e, id) => {
  reminders.remove(String(id));
  await tick(false);
  return true;
});

ipcMain.handle('setup:status', () => ({ hasLink: hasLink() }));

ipcMain.handle('setup:save', async (_e, input) => {
  try {
    const link = normalizeLink(input);
    const ics = await fetchIcs(link);
    const count = upcomingFromIcs(ics, 24 * 60).length;
    setLink(link);
    notified.clear();
    await tick(true);
    enqueue(noteEvent('Calendar connected!', "I'll swing by before every meeting."));
    return { ok: true, count };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle('setup:remove', () => {
  setLink(null);
  events = [];
  lastError = '';
  refreshTray();
  return true;
});

// ---------- demo ----------
function demoEvent(title = 'Team stand-up (demo)', minutes = settings.leadMinutes) {
  return {
    key: `demo-${Date.now()}`,
    demo: true,
    title,
    start: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    location: 'Conference Room B',
    joinUrl: 'https://meet.google.com/',
    htmlLink: 'https://calendar.google.com/',
    autoHideSeconds: 60,
  };
}

function noteEvent(title, note) {
  return { key: `note-${Date.now()}`, demo: true, title, note, start: new Date().toISOString(), autoHideSeconds: 20 };
}

// ---------- tray ----------
function fmt(d) { return new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

function refreshTray() {
  if (!tray) return;
  const connected = hasLink();
  const hasOwn = reminders.items.length > 0;
  const status = settings.paused ? 'Paused'
    : connected && lastError ? `⚠ ${lastError}`
    : connected ? 'Watching your calendar'
    : hasOwn ? 'Watching your reminders'
    : 'Add a reminder to get started';

  const soon = Date.now() + 60 * 60 * 1000;
  const next = allEvents.filter((e) => new Date(e.start) > Date.now() && new Date(e.start) <= soon).slice(0, 5);
  const upcomingItems = next.length
    ? next.map((e) => ({ label: `${fmt(e.start)}  ${truncate(e.title || '(No title)', 40)}`, click: () => e.htmlLink && shell.openExternal(e.htmlLink) }))
    : [{ label: 'No meetings in the next hour', enabled: false }];

  const leadChoices = [5, 10, 15, 30].map((m) => ({
    label: `${m} minutes before`,
    type: 'radio',
    checked: settings.leadMinutes === m,
    click: () => { settings.leadMinutes = m; saveSettings(); tick(false); },
  }));

  const login = app.getLoginItemSettings();

  tray.setToolTip(`Spidey Reminder - ${truncate(status, 100)}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `🕷  ${truncate(status, 70)}`, enabled: false },
    { type: 'separator' },
    ...(connected || hasOwn ? [{ label: 'Up next', enabled: false }, ...upcomingItems, { type: 'separator' }] : []),
    { label: 'Add a reminder…', click: openReminders },
    { label: connected ? 'Change calendar link…' : 'Connect a calendar…', click: openSetup },
    { label: 'Show test reminder', click: () => enqueue(demoEvent()) },
    { label: 'Check now', enabled: connected, click: () => tick(true) },
    { type: 'separator' },
    { label: 'Remind me', submenu: leadChoices },
    {
      label: 'Pause reminders',
      type: 'checkbox',
      checked: settings.paused,
      click: (i) => { settings.paused = i.checked; saveSettings(); tick(false); },
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: login.openAtLogin,
      click: (i) => { app.setLoginItemSettings({ openAtLogin: i.checked, args: loginArgs() }); refreshTray(); },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function loginArgs() {
  // In dev (`electron .`) the app path must be passed; a packaged exe needs nothing.
  return app.isPackaged ? [] : [path.resolve(APP_DIR)];
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ---------- lifecycle ----------
app.whenReady().then(() => {
  loadSettings();
  reminders = new Reminders(app.getPath('userData'));

  const icon = nativeImage.createFromPath(path.join(ASSETS, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.on('click', () => tray.popUpContextMenu());

  createOverlay();
  screen.on('display-metrics-changed', positionOverlay);
  refreshTray();
  startTicking();

  if (process.argv.includes('--demo')) {
    overlay.webContents.once('did-finish-load', () => setTimeout(() => enqueue(demoEvent()), 300));
  }
  // First run: offer to connect a calendar once (it can be skipped; own reminders work without it).
  if ((!hasLink() && !settings.setupSeen) || process.argv.includes('--setup')) openSetup();
  if (process.argv.includes('--reminders')) openReminders();

  // Dev hook: SPIDEY_CAPTURE=<file.png> saves a snapshot (of the overlay, or the setup
  // window with SPIDEY_CAPTURE_WINDOW=setup), then quits.
  if (process.env.SPIDEY_CAPTURE) {
    setTimeout(async () => {
      const win = windows[process.env.SPIDEY_CAPTURE_WINDOW] || overlay;
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SPIDEY_CAPTURE, img.toPNG());
      app.quit();
    }, Number(process.env.SPIDEY_CAPTURE_DELAY || 3500));
  }
});

app.on('second-instance', () => openReminders());
app.on('window-all-closed', (e) => e.preventDefault()); // live in the tray
