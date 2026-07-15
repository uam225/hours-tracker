# Hours

A small PWA for recording clock-in and clock-out times and totalling hours by
day, week, and pay period. All data stays on the device.

## What it does

- One clock-in and one clock-out per day, recorded to the minute.
- Live totals for today, this week (Monday to Sunday), and this pay period.
- The pay period ends on the last Friday of the month and starts the day after
  the previous one.
- Add, edit, and delete any day's entry manually.
- Export everything to CSV (three sections: daily rows, weekly totals,
  pay-period totals) for Numbers, Sheets, or Excel.
- Installable to the home screen and fully usable offline.

Hours are shown both as `HH:MM` and as decimal hours to two places
(7h 30m shows as `07:30` and `7.50`).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and markup. |
| `styles.css` | Styling (mobile-first, dark mode, safe-area aware). |
| `app.js` | UI controller: events and rendering. |
| `store.js` | localStorage data access and validation. |
| `calc.js` | Pure date and totals logic (no DOM, no storage). |
| `csv.js` | CSV assembly and download. |
| `manifest.json` | Install metadata. |
| `service-worker.js` | Offline caching of the app shell. |
| `icons/` | App icons (pre-generated). |

## Local preview

Service workers and home-screen install need a secure context, so serve the
folder over `localhost` rather than opening `index.html` from the file system:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Opening via `file://` will not register the
service worker and may block the module scripts.

## Data and privacy

Entries are held in the browser's `localStorage` on the device only; nothing is
sent anywhere. Export to CSV periodically as a backup, since clearing the site's
data or removing the installed app will delete the entries.

## Status

This is the Phase C implementation. Deployment to GitHub Pages, a backup
routine, and the iOS "Add to Home Screen" walkthrough are covered in Phase D.
