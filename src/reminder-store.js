// Your own reminders (no calendar needed), stored in reminders.json in the app's data folder.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPEATS = ['none', 'daily', 'weekdays', 'weekly'];
const DAY_MS = 24 * 60 * 60 * 1000;

class Reminders {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'reminders.json');
    this.items = [];
    this.load();
  }

  load() {
    try { this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    // Tidy up one-time reminders that finished more than a day ago.
    const cutoff = Date.now() - DAY_MS;
    const before = this.items.length;
    this.items = this.items.filter((r) => r.repeat !== 'none' || new Date(r.start).getTime() > cutoff);
    if (this.items.length !== before) this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }

  /** Validates and stores a reminder. Throws an Error with a friendly message on bad input. */
  add(input, now = Date.now()) {
    const title = String(input.title || '').trim().slice(0, 200);
    if (!title) throw new Error('Give your reminder a name.');
    const start = new Date(input.start);
    if (Number.isNaN(start.getTime())) throw new Error('Pick a date and time.');
    const repeat = REPEATS.includes(input.repeat) ? input.repeat : 'none';
    if (repeat === 'none' && start.getTime() <= now) throw new Error('That time has already passed.');
    let lead = input.leadMinutes;
    lead = lead === null || lead === '' || lead === undefined ? null : Number(lead);
    if (lead !== null && (!Number.isFinite(lead) || lead < 0 || lead > 24 * 60)) throw new Error('Choose when to be reminded.');
    let link = String(input.link || '').trim();
    if (link) {
      if (!/^[a-z]+:\/\//i.test(link)) link = `https://${link}`;
      try { link = new URL(link).toString(); } catch { throw new Error("The meeting link doesn't look right."); }
      if (!/^https:/i.test(link)) throw new Error('The meeting link must start with https://');
    }
    const r = { id: crypto.randomUUID(), title, start: start.toISOString(), repeat, leadMinutes: lead, link };
    this.items.push(r);
    this.save();
    return r;
  }

  remove(id) {
    this.items = this.items.filter((r) => r.id !== id);
    this.save();
  }

  /** Reminder occurrences (as overlay events) starting within [fromMs, toMs]. */
  eventsBetween(fromMs, toMs) {
    const out = [];
    for (const r of this.items) {
      for (const d of occurrencesBetween(r, fromMs, toMs)) {
        out.push({
          key: `manual|${r.id}|${d.getTime()}`,
          title: r.title,
          start: d.toISOString(),
          location: '',
          joinUrl: r.link || '',
          htmlLink: '',
          leadMinutes: r.leadMinutes,
          manual: true,
        });
      }
    }
    return out.sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  /** For the reminders window: each reminder with its next occurrence (or null if done). */
  list(now = Date.now()) {
    return this.items
      .map((r) => {
        const next = occurrencesBetween(r, now, now + 8 * DAY_MS)[0];
        return { ...r, next: next ? next.toISOString() : null };
      })
      .sort((a, b) => (a.next ? new Date(a.next).getTime() : Infinity) - (b.next ? new Date(b.next).getTime() : Infinity));
  }
}

/** Dates of a reminder within [fromMs, toMs], keeping the same local clock time across DST changes. */
function occurrencesBetween(r, fromMs, toMs) {
  const base = new Date(r.start);
  const baseMs = base.getTime();
  if (r.repeat === 'none' || !r.repeat) return baseMs >= fromMs && baseMs <= toMs ? [base] : [];

  const out = [];
  const startFrom = new Date(Math.max(baseMs, fromMs) - DAY_MS);
  const y = startFrom.getFullYear(), m = startFrom.getMonth();
  let day = startFrom.getDate();
  for (let i = 0; i < 400; i++, day++) {
    const d = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0);
    const t = d.getTime();
    if (t > toMs) break;
    if (t < baseMs || t < fromMs) continue;
    const dow = d.getDay();
    if (r.repeat === 'weekdays' && (dow === 0 || dow === 6)) continue;
    if (r.repeat === 'weekly' && dow !== base.getDay()) continue;
    out.push(d);
  }
  return out;
}

module.exports = { Reminders, occurrencesBetween };
