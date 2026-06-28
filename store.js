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

/**
 * Validate the fields a user is allowed to supply. Throws on the first problem
 * with a message intended for direct display.
 * @param {string} date
 * @param {string} clockIn
 * @param {string|null} clockOut
 */
function validateInput(date, clockIn, clockOut) {
  if (!isValidISODate(date)) {
    throw new Error('That date is not valid.');
  }
  if (!isValidHHMM(clockIn)) {
    throw new Error('Enter a clock-in time.');
  }
  if (clockOut !== null) {
    if (!isValidHHMM(clockOut)) {
      throw new Error('That clock-out time is not valid.');
    }
    if (parseHHMM(clockOut) <= parseHHMM(clockIn)) {
      throw new Error('Clock-out must be later than clock-in. This app does not support overnight shifts.');
    }
  }
}

/** @returns {string} A collision-resistant id, preferring the platform UUID. */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create or update the record for a date. The date is the unique key, so this
 * upserts: an existing record for the same date is replaced in place (its id is
 * preserved), which structurally prevents duplicate entries for one day.
 * @param {{ date: string, clockIn: string, clockOut: string|null }} input
 * @returns {import('./calc.js').WorkRecord} the saved record
 */
export function upsertRecord({ date, clockIn, clockOut }) {
  const normalisedOut = clockOut ? clockOut : null;
  validateInput(date, clockIn, normalisedOut);

  const records = loadRecords();
  const index = records.findIndex((r) => r.date === date);

  if (index >= 0) {
    const updated = { ...records[index], clockIn, clockOut: normalisedOut };
    records[index] = updated;
    saveRecords(records);
    return updated;
  }

  const created = { id: generateId(), date, clockIn, clockOut: normalisedOut };
  records.push(created);
  saveRecords(records);
  return created;
}

/**
 * Delete the record for a date. A no-op if none exists.
 * @param {string} date "YYYY-MM-DD"
 */
export function deleteRecord(date) {
  const records = loadRecords().filter((r) => r.date !== date);
  saveRecords(records);
}

/**
 * Ask the browser to mark this origin's storage as persistent so iOS is less
 * likely to evict it under storage pressure. Best-effort: support is partial
 * and the request can be silently denied, so the result is informational only.
 * @returns {Promise<boolean>} whether persistence is now granted
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) {
        return true;
      }
      return await navigator.storage.persist();
    }
  } catch (err) {
    console.error('Persistent-storage request failed:', err);
  }
  return false;
}
