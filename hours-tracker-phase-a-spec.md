# Hours Tracker: Phase A Specification

**Status:** Phase A (Requirements & Scoping) complete
**Owner:** Umair
**Engineer persona:** Ada
**Date:** 22 June 2026

## 1. Purpose

A single-user iPhone web application to record daily clock-in and clock-out times and report total hours for the day, the week, and the pay period. Output is exportable as a spreadsheet-compatible file.

## 2. Constraints

- Single user.
- iPhone, installed as a Progressive Web App (added to the home screen) for app-like behaviour and improved storage persistence under iOS.
- Offline-first. No network dependency at runtime.
- No accounts, no login, no server-side component.
- Source of truth is on-device browser storage. CSV export is the durable copy.
- Free to run and host.

## 3. Data model

One record per working day. The `date` field is the unique key, so a day can hold at most one record. This removes the duplicate-record class of error by construction.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable unique key. |
| `date` | string | Day worked, `YYYY-MM-DD`. Unique. |
| `clockIn` | string | 24-hour device-local time, `HH:MM`. |
| `clockOut` | string | 24-hour device-local time, `HH:MM`. |

Daily, weekly, and pay-period totals are derived at runtime and never stored. There is no second table and no stored aggregate.

Storage uses the browser `localStorage` API. The entire dataset is held as a single JSON value, read and written synchronously. This suits the data volume (one small record per day, comfortably under a megabyte across several years) and avoids the additional machinery of IndexedDB.

## 4. Calculation rules

**Daily total.** `clockOut` minus `clockIn`, exact to the minute. Displayed as `HH:MM` and as decimal hours to two places (7h 30m = 7.50). One figure per day.

**Weekly total.** Sum of daily hours across the Monday 00:00 to Sunday 23:59 window containing the reference date. The live view shows the current week. The week starts Monday.

**Pay-period total.** A period ends on its pay day P and begins the day after the previous pay day. The window is `(previous pay day, P]`, inclusive of P. The current period is the one whose window contains today.

- Pay day P is the last Friday of the month, computed deterministically with no holiday adjustment (a confirmed simplification).
- Worked example: previous pay day Friday the 27th, this pay day Friday the 24th of the next month, gives a period of Saturday the 28th through Friday the 24th inclusive.

## 5. Validation rules

- `clockOut` must be later than `clockIn`. Day shifts only; an overnight span is rejected as invalid.
- A record with `clockIn` and no `clockOut` is shown as in-progress, with no daily total until clocked out.
- Clocking in on a date that already has a record edits that record rather than creating a duplicate.

## 6. MVP features

1. Clock in and clock out, stamping the current time onto today's record.
2. Manual add, edit, and delete of any record (date, in, out), for forgotten or mistyped times.
3. Live totals on the main screen: today, this week, this pay period.
4. History list of past records.
5. One-tap CSV export.

## 7. CSV export format

A single file with three stacked sections, all of which open in Numbers, Sheets, or Excel:

- **Daily rows:** Date, Weekday, Clock In, Clock Out, Hours (HH:MM), Hours (decimal).
- **Weekly totals:** Week starting (Monday), Total (HH:MM), Total (decimal).
- **Pay-period totals:** Pay day, Period start, Period end, Total (HH:MM), Total (decimal).

## 8. Out of scope

Pay-amount or hourly-rate calculation, overtime, breaks, multiple sessions per day, overnight shifts, notes or tags, accounts or login, any server, cloud sync, Google Sheets integration, Apple Numbers write-back, and holiday-adjusted pay days. Any of these can be reintroduced later as a scoped change.

## 9. Residual risk

A local-only store is not durable against clearing Safari data or iOS storage eviction. Mitigation, to be detailed in Phase D:

1. Request persistent storage via the Storage API.
2. Treat the CSV export as the backup.
3. Export at least once per pay period.

This is an operational discipline rather than a code defect.
