// Checks for your own reminders: node scripts/test-reminders.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Reminders, occurrencesBetween } = require('../src/reminder-store');

const local = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
const H = 60 * 60 * 1000;

// Wed 11 Nov 2026, 09:00 local
const NOW = local(2026, 11, 11, 9, 0);

// One-time
let occ = occurrencesBetween({ start: new Date(local(2026, 11, 11, 9, 30)).toISOString(), repeat: 'none' }, NOW, NOW + 3 * H);
assert.strictEqual(occ.length, 1);

// Daily, created a month ago at 10:00 -> today 10:00
occ = occurrencesBetween({ start: new Date(local(2026, 10, 1, 10, 0)).toISOString(), repeat: 'daily' }, NOW, NOW + 3 * H);
assert.deepStrictEqual(occ.map((d) => d.getTime()), [local(2026, 11, 11, 10, 0)]);

// Weekdays from Friday -> Sat/Sun skipped, next is Monday
const fri = local(2026, 11, 13, 9, 0);
occ = occurrencesBetween({ start: new Date(local(2026, 11, 6, 9, 0)).toISOString(), repeat: 'weekdays' }, fri + 1, fri + 3 * 24 * H + 1);
assert.deepStrictEqual(occ.map((d) => d.getDay()), [1]);

// Weekly on Wednesdays -> next Wednesday only
occ = occurrencesBetween({ start: new Date(local(2026, 11, 4, 8, 0)).toISOString(), repeat: 'weekly' }, NOW, NOW + 8 * 24 * H);
assert.deepStrictEqual(occ.map((d) => d.getTime()), [local(2026, 11, 18, 8, 0)]);

// Not before the reminder was first scheduled
occ = occurrencesBetween({ start: new Date(local(2026, 11, 20, 10, 0)).toISOString(), repeat: 'daily' }, NOW, NOW + 3 * H);
assert.strictEqual(occ.length, 0);

// Storage + validation
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spidey-rem-'));
const store = new Reminders(dir);
assert.throws(() => store.add({ title: '', start: new Date(NOW + H) }, NOW), /name/);
assert.throws(() => store.add({ title: 'x', start: new Date(NOW - H), repeat: 'none' }, NOW), /passed/);
assert.throws(() => store.add({ title: 'x', start: new Date(NOW + H), link: 'http://zoom.us/j/1' }, NOW), /https/);
const r = store.add({ title: 'Pay rent', start: new Date(NOW + H), repeat: 'none', leadMinutes: '5', link: 'meet.google.com/abc' }, NOW);
assert.strictEqual(r.leadMinutes, 5);
assert.strictEqual(r.link, 'https://meet.google.com/abc');
const reloaded = new Reminders(dir);
assert.strictEqual(reloaded.items.length, 1);
const ev = reloaded.eventsBetween(NOW, NOW + 3 * H);
assert.strictEqual(ev.length, 1);
assert.strictEqual(ev[0].joinUrl, 'https://meet.google.com/abc');
reloaded.remove(r.id);
assert.strictEqual(new Reminders(dir).items.length, 0);
fs.rmSync(dir, { recursive: true, force: true });

console.log('All reminder checks passed.');
