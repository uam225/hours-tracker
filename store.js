/**
 * store.js
 * ----------------------------------------------------------------------------
 * The single source of truth: a thin, validated wrapper over localStorage.
 *
 * The entire record set is held under one key as a JSON array. At this data
 * volume (one small record per day) loading and saving the whole array is
 * trivially cheap, and a single key keeps reads and writes atomic, which avoids
 * the partial-write inconsistencies a multi-key scheme could introduce.
 *
 * Every public function either returns a usable value or throws an Error with a
 * message written for the end user. The UI layer is responsible for surfacing
 * those messages; this layer never touches the DOM.
 */

import { isValidISODate, isValidHHMM, parseHHMM } from './calc.js';

// Versioned key. If the schema ever changes, a new suffix lets old data be
// migrated rather than silently misread.
const STORAGE_KEY = 'hoursTracker.records.v1';

/**
 * Whether localStorage can actually be written. Some browsers expose the API
 * but throw on write (older private-browsing modes, disabled storage).
 * @returns {boolean}
 */
export function isStorageAvailable() {
  try {
    const probe = '__hours_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * A record is structurally valid only if every field is present and correctly
 * shaped. Anything else is discarded on load rather than allowed to poison the
 * aggregates downstream.
 * @param {unknown} r
 * @returns {boolean}
 */
function isValidRecordShape(r) {
  return (
    !!r &&
    typeof r === 'object' &&
    typeof r.id === 'string' &&
    typeof r.date === 'string' &&
    isValidISODate(r.date) &&
    typeof r.clockIn === 'string' &&
    isValidHHMM(r.clockIn) &&
    (r.clockOut === null || (typeof r.clockOut === 'string' && isValidHHMM(r.clockOut)))
  );
}

/**
 * Load all records. On any read or parse failure we log and return an empty
 * array WITHOUT overwriting storage, so that corrupt-but-recoverable data is
 * not destroyed by the act of reading it.
 * @returns {import('./calc.js').WorkRecord[]}
 */
export function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error('Stored hours data was not an array; ignoring it.');
      return [];
    }
    return parsed.filter(isValidRecordShape);
  } catch (err) {
    console.error('Could not read stored hours data:', err);
    return [];
  }
}

/**
 * Persist the full record set.
 * @param {import('./calc.js').WorkRecord[]} records
 * @throws {Error} when the device refuses the write (quota or disabled storage)
 */
function saveRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Could not save hours data:', err);
    throw new Error('Could not save. Your device storage may be full or disabled.');
  }
}

/** @returns {import('./calc.js').WorkRecord[]} records sorted by date ascending */
export function getAllSorted() {
  return loadRecords().sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The record for a given date, or null.
 * @param {string} date "YYYY-MM-DD"
 * @returns {import('./calc.js').WorkRecord|null}
 */
export function getRecord(date) {
  return loadRecords().find((r) => r.date === date) || null;
}

