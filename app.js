/**
 * app.js
 * ----------------------------------------------------------------------------
 * The controller. It owns the DOM: reading user actions, calling the store and
 * calc modules, and re-rendering. It contains no persistence logic and no date
 * maths of its own, so the testable core (calc.js) stays free of UI concerns.
 *
 * Rendering strategy: the today card and history list are rebuilt on every
 * change. Their inner buttons are therefore transient, so click handling for
 * them is DELEGATED from a stable ancestor (document.body) via data-action
 * attributes. This keeps event wiring correct across re-renders without
 * re-binding listeners each time. The few permanent controls (add, export, and
 * the modal buttons) are bound directly, once.
 *
 * Injection note: every dynamic value rendered here is a date, a time, or a
 * number drawn from validated storage. There are no free-text fields in the
 * data model, so template strings are safe; list rows still use textContent as
 * defence in depth.
 */

import {
  getAllSorted,
  getRecord,
  upsertRecord,
  deleteRecord,
  requestPersistentStorage,
  isStorageAvailable,
} from './store.js';

import {
  todayISO,
  nowHHMM,
  parseHHMM,
  dailyMinutes,
  formatMinutesHHMM,
  minutesToDecimal,
  fromISODate,
  displayDateFromISO,
  displayShort,
  payPeriodWindow,
  startOfWeekMonday,
  weeklyTotalMinutes,
  payPeriodTotalMinutes,
} from './calc.js';

import { downloadCSV } from './csv.js';

/* -------------------------------------------------------------------------- */
/* Element references                                                         */
/* -------------------------------------------------------------------------- */

const el = {};

function cacheElements() {
  const ids = [
    'message',
    'today-card',
    'stat-today-hhmm', 'stat-today-dec',
    'stat-week-hhmm', 'stat-week-dec', 'week-range',
    'stat-period-hhmm', 'stat-period-dec', 'period-range',
    'btn-add', 'btn-export',
    'history-list', 'history-empty',
    'form-modal', 'form-title', 'field-date', 'field-in', 'field-out',
    'form-error', 'form-mode', 'btn-save', 'btn-cancel',
  ];
  for (const id of ids) {
    el[id] = document.getElementById(id);
  }
}

/* -------------------------------------------------------------------------- */
/* Messaging                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} text
 * @param {'info'|'error'} kind
 */
function showMessage(text, kind) {
  el.message.textContent = text;
  el.message.className = `message message-${kind}`;
  el.message.hidden = false;
}

function clearMessage() {
  el.message.hidden = true;
  el.message.textContent = '';
}

function setFormError(text) {
  el['form-error'].textContent = text;
  el['form-error'].hidden = !text;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function render() {
  const today = todayISO();
  const all = getAllSorted();
  renderTodayCard(today, getRecord(today));
  renderTotals(all, today);
  renderHistory(all);
}

/**
 * The today card has three states: not started, in progress, and complete.
 * Once a day is complete the action becomes Edit rather than Clock in, so the
 * day cannot be overwritten by an accidental tap.
 * @param {string} today
 * @param {import('./calc.js').WorkRecord|null} rec
 */
function renderTodayCard(today, rec) {
  const heading = `<p class="card-label">Today &middot; ${displayDateFromISO(today)}</p>`;
  let body;

  if (!rec) {
    body = `
      <p class="card-hint">Not clocked in.</p>
      <button class="btn btn-primary btn-block" data-action="clock-in">Clock in</button>`;
  } else if (!rec.clockOut) {
    body = `
      <p class="card-status">Clocked in at <strong>${rec.clockIn}</strong></p>
      <button class="btn btn-primary btn-block" data-action="clock-out">Clock out</button>
      <button class="btn btn-link" data-action="edit" data-date="${today}">Edit times</button>`;
  } else {
    const mins = dailyMinutes(rec);
    body = `
      <p class="card-total">${formatMinutesHHMM(mins)}<span class="card-total-dec">${minutesToDecimal(mins)} h</span></p>
      <p class="card-status">${rec.clockIn} to ${rec.clockOut}</p>
      <button class="btn btn-secondary btn-block" data-action="edit" data-date="${today}">Edit today</button>`;
  }

  el['today-card'].innerHTML = heading + body;
}

/**
 * @param {import('./calc.js').WorkRecord[]} all
 * @param {string} today
 */
function renderTotals(all, today) {
  const todayDate = fromISODate(today);
  const todayRec = all.find((r) => r.date === today);

  // Today: show a dash while in progress so a clocked-in-but-not-out day is not
  // misread as zero hours.
  if (todayRec && !todayRec.clockOut) {
    el['stat-today-hhmm'].textContent = '--:--';
    el['stat-today-dec'].textContent = 'in progress';
  } else {
    const mins = dailyMinutes(todayRec) || 0;
    el['stat-today-hhmm'].textContent = formatMinutesHHMM(mins);
    el['stat-today-dec'].textContent = `${minutesToDecimal(mins)} h`;
  }

  const weekMins = weeklyTotalMinutes(all, todayDate);
  el['stat-week-hhmm'].textContent = formatMinutesHHMM(weekMins);
  el['stat-week-dec'].textContent = `${minutesToDecimal(weekMins)} h`;

  const periodMins = payPeriodTotalMinutes(all, todayDate);
  el['stat-period-hhmm'].textContent = formatMinutesHHMM(periodMins);
  el['stat-period-dec'].textContent = `${minutesToDecimal(periodMins)} h`;

  const weekStart = startOfWeekMonday(todayDate);
  el['week-range'].textContent = `from ${displayShort(weekStart)}`;

  const period = payPeriodWindow(todayDate);
  el['period-range'].textContent = `${displayShort(period.start)} to ${displayShort(period.end)}`;
}

/**
 * History, most recent first. Built with createElement/textContent.
 * @param {import('./calc.js').WorkRecord[]} all
 */
function renderHistory(all) {
  const list = el['history-list'];
  list.replaceChildren();

  if (all.length === 0) {
    el['history-empty'].hidden = false;
    return;
  }
  el['history-empty'].hidden = true;

  const newestFirst = [...all].reverse();
  for (const rec of newestFirst) {
    const mins = dailyMinutes(rec);
    const inProgress = mins === null;

    const li = document.createElement('li');
    li.className = 'entry';

    const main = document.createElement('div');
    main.className = 'entry-main';

    const date = document.createElement('span');
    date.className = 'entry-date';
    date.textContent = displayDateFromISO(rec.date);

    const times = document.createElement('span');
    times.className = 'entry-times';
    times.textContent = inProgress ? `${rec.clockIn} - in progress` : `${rec.clockIn} - ${rec.clockOut}`;

    main.append(date, times);

    const side = document.createElement('div');
    side.className = 'entry-side';

    const hours = document.createElement('span');
    hours.className = 'entry-hours';
    hours.textContent = inProgress ? 'in progress' : `${formatMinutesHHMM(mins)} (${minutesToDecimal(mins)} h)`;

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-small';
    editBtn.textContent = 'Edit';
    editBtn.dataset.action = 'edit';
    editBtn.dataset.date = rec.date;
    editBtn.setAttribute('aria-label', `Edit entry for ${displayDateFromISO(rec.date)}`);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-small btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.dataset.action = 'delete';
    delBtn.dataset.date = rec.date;
    delBtn.setAttribute('aria-label', `Delete entry for ${displayDateFromISO(rec.date)}`);

    actions.append(editBtn, delBtn);
    side.append(hours, actions);
    li.append(main, side);
    list.append(li);
  }
}
