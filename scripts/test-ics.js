// Quick check of the iCal parsing: node scripts/test-ics.js
const assert = require('assert');
const { upcomingFromIcs, normalizeLink } = require('../src/ics');

// "Now" = Wed 2026-11-11 09:52 in New York (14:52 UTC)
const NOW = Date.UTC(2026, 10, 11, 14, 52);

const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:test
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:standup
SUMMARY:Daily stand-up
DTSTART;TZID=America/New_York:20230102T100000
DTEND;TZID=America/New_York:20230102T101500
RRULE:FREQ=DAILY
DESCRIPTION:Join: https://meet.google.com/abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:weekly
SUMMARY:Weekly sync (moved today)
DTSTART;TZID=America/New_York:20260101T150000
DTEND;TZID=America/New_York:20260101T160000
RRULE:FREQ=WEEKLY;BYDAY=TH
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID;TZID=America/New_York:20261112T150000
SUMMARY:Weekly sync (moved today)
DTSTART;TZID=America/New_York:20261111T100500
DTEND;TZID=America/New_York:20261111T110000
LOCATION:Room 4
END:VEVENT
BEGIN:VEVENT
UID:skipped
SUMMARY:Deleted occurrence
DTSTART;TZID=America/New_York:20261104T100000
DTEND;TZID=America/New_York:20261104T110000
RRULE:FREQ=WEEKLY
EXDATE;TZID=America/New_York:20261111T100000
END:VEVENT
BEGIN:VEVENT
UID:cancelled
SUMMARY:Cancelled one
STATUS:CANCELLED
DTSTART:20261111T150000Z
DTEND:20261111T153000Z
END:VEVENT
BEGIN:VEVENT
UID:allday
SUMMARY:Holiday
DTSTART;VALUE=DATE:20261111
DTEND;VALUE=DATE:20261112
END:VEVENT
BEGIN:VEVENT
UID:zoom
SUMMARY:Client call
DTSTART:20261111T153000Z
DTEND:20261111T160000Z
LOCATION:https://us02web.zoom.us/j/123456
END:VEVENT
BEGIN:VEVENT
UID:later
SUMMARY:Too far ahead
DTSTART:20261111T190000Z
DTEND:20261111T200000Z
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');

const t0 = Date.now();
const got = upcomingFromIcs(ics, 60, NOW);
const ms = Date.now() - t0;
console.table(got.map((e) => ({ title: e.title, start: e.start, join: e.joinUrl, location: e.location })));

assert.deepStrictEqual(got.map((e) => e.title), ['Daily stand-up', 'Weekly sync (moved today)', 'Client call']);
assert.strictEqual(got[0].start, '2026-11-11T15:00:00.000Z');            // 10:00 New York = 15:00 UTC
assert.strictEqual(got[0].joinUrl, 'https://meet.google.com/abc-defg-hij');
assert.strictEqual(got[1].start, '2026-11-11T15:05:00.000Z');            // moved occurrence picked up
assert.strictEqual(got[1].location, 'Room 4');
assert.strictEqual(got[2].joinUrl, 'https://us02web.zoom.us/j/123456');
assert.strictEqual(got[2].location, '');

assert.strictEqual(normalizeLink(' webcal://example.com/a.ics '), 'https://example.com/a.ics');
assert.throws(() => normalizeLink('http://example.com/a.ics'));
assert.throws(() => normalizeLink('not a link'));

console.log(`All iCal checks passed (${ms} ms, daily series since 2023 expanded without a cap).`);
