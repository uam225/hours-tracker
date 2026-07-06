/**
 * csv.js
 * ----------------------------------------------------------------------------
 * Assembles the export file and triggers a download. The output has the three
 * stacked sections specified in Phase A (daily rows, weekly totals, pay-period
 * totals) so it opens directly in Numbers, Sheets, or Excel.
 *
 * The export also serves as the user's backup, so completeness matters:
 * in-progress records (no clock-out) are still listed, with blank out/hours
 * cells, rather than being dropped.
 */

import {
  dailyMinutes,
  formatMinutesHHMM,
  minutesToDecimal,
  fromISODate,
  toISODate,
  startOfWeekMonday,
  payPeriodWindow,
  weekdayLongFromISO,
  displayDateFromISO,
  todayISO,
} from './calc.js';

/**
 * Quote a CSV field only when required (comma, quote, or newline present),
 * doubling any embedded quotes per RFC 4180. Our values are dates, times, and
 * numbers, but the escaper is applied uniformly so the format stays correct if
 * the data set ever changes.
 * @param {string|number} value
 * @returns {string}
 */
function csvField(value) {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build one CSV row from an array of cells.
 * @param {(string|number)[]} cells
 * @returns {string}
 */
function row(cells) {
  return cells.map(csvField).join(',');
}

/**
 * Group records into buckets keyed by a string, accumulating worked minutes and
 * retaining a representative payload for each bucket.
 * @template T
 * @param {import('./calc.js').WorkRecord[]} records
 * @param {(r: import('./calc.js').WorkRecord) => { key: string, meta: T }} classify
 * @returns {{ key: string, minutes: number, meta: T }[]} sorted by key ascending
 */
function bucketise(records, classify) {
  const buckets = new Map();
  for (const r of records) {
    const minutes = dailyMinutes(r);
    if (minutes === null) {
      continue; // In-progress records contribute nothing to a total.
    }
    const { key, meta } = classify(r);
    const existing = buckets.get(key);
    if (existing) {
      existing.minutes += minutes;
    } else {
      buckets.set(key, { key, minutes, meta });
    }
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Produce the full CSV text for a set of records.
 * @param {import('./calc.js').WorkRecord[]} records
 * @returns {string}
 */
export function buildCSV(records) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const lines = [];

  // Section 1: one row per day.
  lines.push(row(['Daily Hours']));
  lines.push(row(['Date', 'Weekday', 'Clock In', 'Clock Out', 'Hours (HH:MM)', 'Hours (decimal)']));
  for (const r of sorted) {
    const minutes = dailyMinutes(r);
    const complete = minutes !== null;
    lines.push(
      row([
        r.date,
        weekdayLongFromISO(r.date),
        r.clockIn,
        r.clockOut || '',
        complete ? formatMinutesHHMM(minutes) : '',
        complete ? minutesToDecimal(minutes) : '',
      ]),
    );
  }

  // Section 2: Monday-to-Sunday weekly totals.
  lines.push(row([]));
  lines.push(row(['Weekly Totals']));
  lines.push(row(['Week Starting (Mon)', 'Total (HH:MM)', 'Total (decimal)']));
  const weekly = bucketise(sorted, (r) => {
    const weekStart = startOfWeekMonday(fromISODate(r.date));
    return { key: toISODate(weekStart), meta: weekStart };
  });
  for (const w of weekly) {
    lines.push(row([w.key, formatMinutesHHMM(w.minutes), minutesToDecimal(w.minutes)]));
  }

  // Section 3: pay-period totals, keyed by pay day.
  lines.push(row([]));
  lines.push(row(['Pay Period Totals']));
  lines.push(row(['Pay Day', 'Period Start', 'Period End', 'Total (HH:MM)', 'Total (decimal)']));
  const periods = bucketise(sorted, (r) => {
    const window = payPeriodWindow(fromISODate(r.date));
    return { key: toISODate(window.end), meta: window };
  });
  for (const p of periods) {
    lines.push(
      row([
        toISODate(p.meta.end),
        toISODate(p.meta.start),
        toISODate(p.meta.end),
        formatMinutesHHMM(p.minutes),
        minutesToDecimal(p.minutes),
      ]),
    );
  }

  // RFC 4180 uses CRLF; Numbers, Sheets, and Excel all accept it.
  return lines.join('\r\n');
}

/**
 * Build the CSV and hand it to the browser as a download. On iOS this surfaces
 * the share sheet, from which the file can be saved to Files or opened in
 * Numbers. Throws if there is nothing to export or the download cannot start.
 * @param {import('./calc.js').WorkRecord[]} records
 */
export function downloadCSV(records) {
  if (!records || records.length === 0) {
    throw new Error('There are no entries to export yet.');
  }

  const text = buildCSV(records);
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hours-export-${todayISO()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // Release the object URL on the next tick, after the click has been handled.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// Re-exported so the UI can show a friendly date in the export confirmation
// without importing calc directly for this one purpose.
export { displayDateFromISO };
