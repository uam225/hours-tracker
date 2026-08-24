/**
 * calc.js
 * ----------------------------------------------------------------------------
 * Pure domain logic: time parsing, duration maths, calendar boundaries, and
 * aggregation. This module deliberately touches neither the DOM nor storage so
 * that every function here is deterministic and unit-testable in isolation.
 *
 * Time-of-day is represented as a "HH:MM" string in 24-hour device-local time.
 * Calendar dates are represented as a "YYYY-MM-DD" string. Whenever a Date
 * object is constructed from a date string we anchor it to LOCAL midnight via
 * `new Date(year, monthIndex, day)`. We never use `new Date("YYYY-MM-DD")`
 * because that form is parsed as UTC, which would shift the calendar day for
 * any user east or west of Greenwich and silently corrupt the totals.
 */

// Fixed English names. A lookup table is used instead of Intl so the output is
// deterministic regardless of the device locale (a user with a non-UK locale
// should still see consistent column values in the CSV export).
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FRIDAY = 5; // Date.getDay(): 0 = Sunday ... 6 = Saturday.

/**
 * Left-pad a number to two digits.
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/* -------------------------------------------------------------------------- */
/* Validation predicates                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Validate a strict "YYYY-MM-DD" string AND confirm it is a real calendar date.
 * The shape check alone would accept "2025-13-40", so we round-trip through a
 * Date and compare the components back out.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/**
 * Validate a strict 24-hour "HH:MM" string (00:00 to 23:59).
 * @param {string} value
 * @returns {boolean}
 */
export function isValidHHMM(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/* -------------------------------------------------------------------------- */
/* Time-of-day helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Convert "HH:MM" to minutes since midnight.
 * @param {string} hhmm
 * @returns {number} 0..1439
 */
export function parseHHMM(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Format a minute count as "HH:MM". Hours are NOT capped at 24 because this is
 * used for weekly and pay-period totals, which routinely exceed a day
 * (e.g. 2550 minutes -> "42:30").
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatMinutesHHMM(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/**
 * Convert a minute count to decimal hours to two places (450 -> "7.50").
 * @param {number} totalMinutes
 * @returns {string}
 */
export function minutesToDecimal(totalMinutes) {
  return (totalMinutes / 60).toFixed(2);
}

/** @returns {string} Current local time as "HH:MM". */
export function nowHHMM() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/* Calendar-date helpers (all anchored to LOCAL midnight)                     */
/* -------------------------------------------------------------------------- */

/**
 * Strip the time component, returning a new Date at local midnight. Used before
 * any date comparison so two dates differing only by time-of-day compare equal.
 * @param {Date} date
 * @returns {Date}
 */
export function atMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Add (or subtract) whole days. Relies on the Date constructor normalising
 * out-of-range day numbers, so month and year roll over correctly.
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Format a Date as "YYYY-MM-DD" from its LOCAL components.
 * @param {Date} date
 * @returns {string}
 */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Parse a "YYYY-MM-DD" string to a Date at LOCAL midnight.
 * @param {string} iso
 * @returns {Date}
 */
export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** @returns {string} Today's date as "YYYY-MM-DD" in local time. */
export function todayISO() {
  return toISODate(new Date());
}

/**
 * Long weekday name for an ISO date string (e.g. "2026-04-24" -> "Friday").
 * @param {string} iso
 * @returns {string}
 */
export function weekdayLongFromISO(iso) {
  return WEEKDAYS_LONG[fromISODate(iso).getDay()];
}

/**
 * Human-friendly display date, British day-month-year (e.g. "Fri 24 Apr 2026").
 * @param {string} iso
 * @returns {string}
 */
export function displayDateFromISO(iso) {
  const d = fromISODate(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Short display date without year (e.g. "24 Apr"). Used for compact range
 * labels such as the current pay-period window.
 * @param {Date} date
 * @returns {string}
 */
export function displayShort(date) {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/**
 * The Monday (local midnight) of the ISO-8601 week containing `date`.
 * getDay() returns 0 for Sunday, so `(getDay() + 6) % 7` gives the number of
 * days since Monday (Mon -> 0, Sun -> 6), which we subtract.
 * @param {Date} date
 * @returns {Date}
 */
export function startOfWeekMonday(date) {
  const base = atMidnight(date);
  const daysSinceMonday = (base.getDay() + 6) % 7;
  return addDays(base, -daysSinceMonday);
}

/**
 * The last Friday of a given month, at local midnight.
 * We take day 0 of the following month (which the Date constructor resolves to
 * the last day of THIS month), then walk back to the most recent Friday.
 * @param {number} year
 * @param {number} monthIndex 0..11
 * @returns {Date}
 */
export function lastFridayOfMonth(year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0);
  const backToFriday = (lastDay.getDay() - FRIDAY + 7) % 7;
  return new Date(year, monthIndex, lastDay.getDate() - backToFriday);
}

/**
 * The pay-period window containing `date`.
 *
 * Rule (confirmed in Phase A): pay day P is the last Friday of the month. A
 * period ENDS on its pay day and BEGINS the day after the previous pay day, so
 * the window is the half-open-then-closed interval (previous pay day, P].
 *
 * If `date` falls on or before this month's pay day, the period ends on it.
 * Otherwise `date` sits in the days after this month's pay day, which belong to
 * NEXT month's period. Previous/next month are derived via day-1 Date
 * construction so year boundaries are handled automatically.
 *
 * @param {Date} date
 * @returns {{ start: Date, end: Date }} both at local midnight; `end` is the pay day
 */
export function payPeriodWindow(date) {
  const ref = atMidnight(date);
  const y = ref.getFullYear();
  const m = ref.getMonth();

  const thisPay = lastFridayOfMonth(y, m);
  const prevMonth = new Date(y, m - 1, 1);
  const nextMonth = new Date(y, m + 1, 1);
  const prevPay = lastFridayOfMonth(prevMonth.getFullYear(), prevMonth.getMonth());
  const nextPay = lastFridayOfMonth(nextMonth.getFullYear(), nextMonth.getMonth());

  if (ref.getTime() <= thisPay.getTime()) {
    return { start: addDays(prevPay, 1), end: thisPay };
  }
  return { start: addDays(thisPay, 1), end: nextPay };
}

/**
 * The most recently CLOSED pay period relative to `date`, that is, the period
 * ending at the latest pay day on or before `date`.
 *
 * This differs from payPeriodWindow, which returns the period CONTAINING the
 * date. The distinction matters for the monthly send: on the pay day itself
 * both agree, but on the following Monday payPeriodWindow would return the
 * period that has just begun (nearly empty), whereas this returns the closed
 * period that is actually due to be sent. It therefore tolerates a send that
 * runs late by anything up to a month.
 *
 * @param {Date} date
 * @returns {{ start: Date, end: Date }} both at local midnight; `end` is the pay day
 */
export function mostRecentClosedPayPeriod(date) {
  const ref = atMidnight(date);
  let end = lastFridayOfMonth(ref.getFullYear(), ref.getMonth());

  // If this month's pay day has not arrived yet, the last closed period ended
  // with the previous month's pay day.
  if (end.getTime() > ref.getTime()) {
    const prevMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    end = lastFridayOfMonth(prevMonth.getFullYear(), prevMonth.getMonth());
  }

  // The period opens the day after the preceding pay day. Deriving the previous
  // month via day-1 Date construction handles the January rollover.
  const monthBeforeEnd = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  const prevPay = lastFridayOfMonth(monthBeforeEnd.getFullYear(), monthBeforeEnd.getMonth());

  return { start: addDays(prevPay, 1), end };
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} WorkRecord
 * @property {string} id
 * @property {string} date     "YYYY-MM-DD"
 * @property {string} clockIn  "HH:MM"
 * @property {string|null} clockOut "HH:MM" or null when in-progress
 */

/**
 * Worked minutes for a single record. Returns null when the record is
 * in-progress (no clock-out) or somehow invalid, so callers can distinguish
 * "no value yet" from a genuine zero.
 * @param {WorkRecord} record
 * @returns {number|null}
 */
export function dailyMinutes(record) {
  if (!record || !record.clockOut) {
    return null;
  }
  const start = parseHHMM(record.clockIn);
  const end = parseHHMM(record.clockOut);
  if (end <= start) {
    return null; // Defensive: validation rejects this on input.
  }
  return end - start;
}

/**
 * Records whose date falls within [startDate, endDate] inclusive.
 * @param {WorkRecord[]} records
 * @param {Date} startDate local midnight
 * @param {Date} endDate   local midnight
 * @returns {WorkRecord[]}
 */
export function recordsInRange(records, startDate, endDate) {
  const lo = startDate.getTime();
  const hi = endDate.getTime();
  return records.filter((r) => {
    const t = fromISODate(r.date).getTime();
    return t >= lo && t <= hi;
  });
}

/**
 * Sum of completed daily minutes across a set of records (nulls count as 0).
 * @param {WorkRecord[]} records
 * @returns {number}
 */
export function sumMinutes(records) {
  return records.reduce((total, r) => total + (dailyMinutes(r) || 0), 0);
}

/**
 * Total worked minutes for the Monday-to-Sunday week containing `refDate`.
 * @param {WorkRecord[]} records
 * @param {Date} refDate
 * @returns {number}
 */
export function weeklyTotalMinutes(records, refDate) {
  const weekStart = startOfWeekMonday(refDate);
  const weekEnd = addDays(weekStart, 6);
  return sumMinutes(recordsInRange(records, weekStart, weekEnd));
}

/**
 * Total worked minutes for the pay period containing `refDate`.
 * @param {WorkRecord[]} records
 * @param {Date} refDate
 * @returns {number}
 */
export function payPeriodTotalMinutes(records, refDate) {
  const { start, end } = payPeriodWindow(refDate);
  return sumMinutes(recordsInRange(records, start, end));
}
