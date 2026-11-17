# Spidey Calendar Reminder 🕷️

A small Windows tray app for reminders. Before each meeting or reminder, Spider-Man slides down on a web from the top-right corner of your screen and a comic-style speech bubble tells you what's coming up:

> **SPIDEY-SENSE TINGLING!**
> Team stand-up · Starts in 10 minutes · 11:55 AM
> [Join meeting] [Open in Calendar] · Remind me in 2 min

- **Add your own reminders**: one-time or repeating (daily, weekdays, weekly), with an optional meeting link. No account needed.
- **Optionally connect a calendar**: Google Calendar, Outlook or Apple iCloud. You just paste your calendar's private link: no sign-in, no Google Cloud project, no API keys.
- The pop-up floats above every window but **doesn't steal focus**, and clicks pass through everything except the bubble.
- **Join meeting** opens the Google Meet, Zoom, Teams or Webex link it finds in the event.
- Handles recurring meetings, moved or deleted occurrences, and time zones. Skips all-day and cancelled events.
- The pop-up hides itself after 90 seconds, or when you click **Join meeting**, **Open in Calendar** or **Remind me in 2 min**.

## Install and run

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone <this repo>
cd "Spidey Calendar Reminder"
npm install
npm start
```

> **Windows PowerShell says "running scripts is disabled"?** Use `npm.cmd` instead of `npm` (e.g. `npm.cmd install`, `npm.cmd start`). Nothing needs to be changed on your system.

The app lives in the system tray: look for the Spidey mask icon near the clock (it may be under the `^` arrow) and click it for the menu. On first launch it also offers to connect a calendar. You can click **Cancel** and just use your own reminders.

To just see the animation:

```bash
npm run demo
```

## Add your own reminders

Tray menu → **Add a reminder…** (or `npm run reminders`, or launch the app again while it's running).

1. Type what to remind you about.
2. Pick the date and time.
3. Choose **Repeat**: Never, Every day, Weekdays (Mon–Fri) or Every week.
4. Choose **Remind me**: at the time, 5 / 10 / 15 / 30 minutes or 1 hour before, or the default from the tray menu.
5. Optionally paste a Meet / Zoom / Teams link to get a **Join meeting** button.

The **Coming up** list shows each reminder's next time, with a **Delete** button. Reminders are saved in `%APPDATA%spidey-calendar-remindereminders.json` on your PC. Finished one-time reminders are cleaned up after a day.

## Connect a calendar (optional)

Tray menu → **Connect a calendar…**. Paste your calendar's private iCal link into the setup window and click **Test & save**.

**Google Calendar**
1. Open [Google Calendar settings](https://calendar.google.com/calendar/r/settings).
2. On the left, under **Settings for my calendars**, click your calendar.
3. Scroll to **Integrate calendar** and copy **Secret address in iCal format**.

**Outlook / Microsoft 365**
1. Open [Outlook → Settings → Calendar → Shared calendars](https://outlook.office.com/calendar/options/calendar/SharedCalendars).
2. Under **Publish a calendar**, pick your calendar and **Can view all details**, then **Publish**.
3. Copy the **ICS** link.

**Apple iCloud**
1. In Calendar, right-click your calendar → **Share Calendar**.
2. Turn on **Public Calendar** and copy the `webcal://` link.

To change or remove the link later, use **Change calendar link…** in the tray menu.

### Privacy

- The link works like a password: anyone who has it can read that calendar. The app stores it **only on your PC**, encrypted with Windows (DPAPI), at `%APPDATA%\spidey-calendar-reminder\settings.json`. It is never sent anywhere except to your calendar provider.
- If you think your link leaked, reset it in your calendar settings (Google: **Reset** next to the secret address), then paste the new one.
- Nothing personal lives in this repository folder, so it's safe to commit and share.

### Good to know

- The app downloads your calendar every 2 minutes. Calendar providers don't guarantee how fast their iCal links update, so a meeting created only a few minutes before it starts might be missed. Normal meetings are no problem.
- The link covers one calendar. Use the link of the calendar that has your meetings.

## Tray menu

| Item | What it does |
| --- | --- |
| Up next | Meetings and reminders in the coming hour |
| Add a reminder… | Add, see and delete your own reminders |
| Connect a calendar… / Change calendar link… | Open the calendar setup window |
| Show test reminder | Make Spider-Man drop in right now |
| Check now | Download your calendar immediately |
| Remind me | Default alert time: 5 / 10 / 15 / 30 minutes before (default 10). Individual reminders can override it. |
| Pause reminders | Stop pop-ups without quitting |
| Start with Windows | Launch automatically when you log in |

## Project layout

```
assets/
  source/             original images (spidey.jpg, web.jpg)
  spidey.png, web.png transparent cut-outs used by the overlay
  icon.png            tray icon (cropped mask)
scripts/
  prepare-assets.js   regenerates the PNGs from assets/source (npm run prepare-assets)
  test-ics.js, test-reminders.js   checks for calendar parsing and reminder repeats (npm test)
src/
  main.js             tray, settings, calendar polling, windows and reminder queue
  ics.js              downloads and reads the iCal link (recurrences, time zones, meeting links)
  reminder-store.js   your own reminders: saving, validation, repeat schedule
  overlay.*           the transparent pop-up: web, thread, Spider-Man, speech bubble
  setup.*             the "Connect your calendar" window
  reminders.*, reminders-window.js   the "My reminders" window
  preload.js, setup-preload.js   safe bridges between the windows and the main process
```

To change the look, edit `src/overlay.css`. The slide-in time (`--drop-time`), thread length (`--drop`), Spider-Man's size (`--spidey-w`) and thread position (`--anchor-right`) are variables at the top of that file.

## Disclaimer

Spider-Man is a trademark of Marvel. This is an unofficial fan project, not affiliated with or endorsed by Marvel or Disney.
