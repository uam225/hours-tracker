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

