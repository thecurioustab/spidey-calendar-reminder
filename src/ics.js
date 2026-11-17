// Reads a calendar from its private iCal (.ics) link — Google "Secret address in iCal format",
// Outlook "Publish calendar" ICS link, Apple iCloud public link, etc. No sign-in needed.
const IcalExpander = require('ical-expander');

const FETCH_TIMEOUT_MS = 30 * 1000;

/** Accepts https:// and webcal:// links; returns a normalised https URL or throws a friendly error. */
function normalizeLink(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Paste your calendar link first.');
  if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:\/\//i, 'https://');
  let url;
  try { url = new URL(s); } catch { throw new Error("That doesn't look like a link."); }
  if (url.protocol !== 'https:') throw new Error('The link must start with https:// (or webcal://).');
  return url.toString();
}

async function fetchIcs(link) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(link, { signal: ctrl.signal, headers: { Accept: 'text/calendar, */*' } });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The calendar took too long to respond.' : 'Could not reach the calendar - check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404 || res.status === 403 || res.status === 401) {
    throw new Error('The calendar link was rejected. It may have been reset - copy it again from your calendar settings.');
  }
  if (!res.ok) throw new Error(`The calendar server returned an error (${res.status}).`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error("That link didn't return a calendar. Make sure you copied the iCal / .ics address.");
  }
  return text;
}

/**
 * Timed events starting between (now - 1 min) and (now + withinMinutes).
 * Handles recurring meetings, edited/moved single occurrences, deleted occurrences and time zones.
 */
function upcomingFromIcs(ics, withinMinutes, now = Date.now()) {
  const expander = new IcalExpander({ ics, maxIterations: 0, skipInvalidDates: true });
  const from = new Date(now - 60 * 1000);
  const to = new Date(now + withinMinutes * 60 * 1000);
  const { events, occurrences } = expander.between(from, to);

  const items = [];
  for (const e of events) items.push({ ev: e, start: e.startDate });
  for (const o of occurrences) items.push({ ev: o.item, start: o.startDate });
  // An edited occurrence that was moved INTO this window from a slot outside it.
  for (const e of expander.events) {
    if (e.isRecurrenceException()) items.push({ ev: e, start: e.startDate });
  }

  const seen = new Set();
  const out = [];
  for (const { ev, start } of items) {
    if (!start || start.isDate) continue;                               // all-day
    const startMs = start.toJSDate().getTime();
    if (startMs < from.getTime() || startMs > to.getTime()) continue;
    const status = String(ev.component.getFirstPropertyValue('status') || '').toUpperCase();
    if (status === 'CANCELLED') continue;
    const key = `${ev.uid}|${startMs}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const location = ev.location || '';
    const description = ev.description || '';
    const conf = ev.component.getFirstPropertyValue('x-google-conference') || '';
    out.push({
      key,
      title: ev.summary,
      start: new Date(startMs).toISOString(),
      location: location && !/^https?:/i.test(location) ? location : '',
      joinUrl: conf || findMeetingLink(`${location} ${description}`),
      htmlLink: '',
    });
  }
  return out.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function findMeetingLink(text) {
  const m = String(text).match(/https?:\/\/[^\s"<>]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com)[^\s"<>]*/i);
  return m ? m[0] : '';
}

/** Where the "Open in Calendar" button should go for a given feed. */
function calendarWebUrl(link) {
  try {
    const host = new URL(link).hostname;
    if (/google\.com$/.test(host)) return 'https://calendar.google.com/calendar/r';
    if (/outlook\.(office365|live)\.com$|office\.com$/.test(host)) return 'https://outlook.office.com/calendar/';
    if (/icloud\.com$/.test(host)) return 'https://www.icloud.com/calendar/';
  } catch {}
  return '';
}

module.exports = { normalizeLink, fetchIcs, upcomingFromIcs, calendarWebUrl, findMeetingLink };
