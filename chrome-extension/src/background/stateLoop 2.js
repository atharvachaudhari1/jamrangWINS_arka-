import { getSnapshot } from './signals.js';
import { detectState } from './detectState.js';
import { onOutcomeTick } from './outcomeTracker.js';
import { getApiUrl, getToken } from '../utils/storage.js';
import { updateDailySignalHistory, SIGNAL_HISTORY_KEY } from './signalHistory.js';
import { enqueueSignalSummaries } from './uploader.js';

const ALARM = 'doorway-state';
const STATE_KEY = 'doorway_state';
const PENDING_KEY = 'doorway_state_pending';
const BASELINE_KEY = 'doorway_baseline';
const DEADLINE_KEY = 'doorway_deadlineNear';
const DEADLINE_CHECKED_KEY = 'doorway_deadlineCheckedAt';
const DEADLINE_TTL_MS = 30 * 60 * 1000;
const STRESS_MAX_AGE_MS = 2 * 60 * 60 * 1000;

async function refreshDeadline(now) {
  const cache = await chrome.storage.local.get([DEADLINE_KEY, DEADLINE_CHECKED_KEY]);
  if (now - (cache[DEADLINE_CHECKED_KEY] || 0) < DEADLINE_TTL_MS) return cache[DEADLINE_KEY] === true;
  const [token, apiUrl] = await Promise.all([getToken(), getApiUrl()]);
  if (!token) return cache[DEADLINE_KEY] === true;
  try {
    const response = await fetch(`${apiUrl}/subjects`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return cache[DEADLINE_KEY] === true;
    const { subjects = [] } = await response.json();
    const near = subjects.some(({ examAt }) => {
      const remaining = new Date(examAt).getTime() - now;
      return Number.isFinite(remaining) && remaining >= 0 && remaining <= 7 * 24 * 60 * 60 * 1000;
    });
    await chrome.storage.local.set({ [DEADLINE_KEY]: near, [DEADLINE_CHECKED_KEY]: now });
    return near;
  } catch {
    return cache[DEADLINE_KEY] === true;
  }
}

function dayKey(now) {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function baselineFrom(stored) {
  const days = Array.isArray(stored?.days) ? stored.days : [];
  if (days.length < 3) return null;
  return { switchesPerMin: median(days.map((day) => day.median || 0)) };
}

async function recordBaseline(stored, switchesPerMin, now) {
  const days = Array.isArray(stored?.days) ? stored.days.map((day) => ({ ...day, samples: [...(day.samples || [])] })) : [];
  const key = dayKey(now);
  let day = days.find((item) => item.date === key);
  if (!day) {
    day = { date: key, samples: [] };
    days.push(day);
  }
  day.samples.push(switchesPerMin);
  day.median = median(day.samples);
  const trimmed = days.slice(-7);
  await chrome.storage.local.set({ [BASELINE_KEY]: { days: trimmed } });
}

function energyFrom(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function tick() {
  const now = Date.now();
  const snapshot = await getSnapshot();
  const deadlineNear = await refreshDeadline(now);
  const local = await chrome.storage.local.get([
    'bbEnergy',
    'doorway_stressLevel',
    'doorway_stressAt',
    'doorway_readingMode',
    BASELINE_KEY,
  ]);
  const session = await chrome.storage.session.get([STATE_KEY, PENDING_KEY]);
  const detected = detectState(snapshot, {
    energyLevel: energyFrom(local.bbEnergy),
    baseline: baselineFrom(local[BASELINE_KEY]),
    stressHigh: local.doorway_stressLevel >= 4 && now - (local.doorway_stressAt || 0) <= STRESS_MAX_AGE_MS,
    readingMode: local.doorway_readingMode === true,
    deadlineNear,
  });
  await recordBaseline(local[BASELINE_KEY], snapshot.switchesPerMin || 0, now);
  const signalHistory = await chrome.storage.local.get(SIGNAL_HISTORY_KEY);
  const updatedSignals = updateDailySignalHistory(signalHistory[SIGNAL_HISTORY_KEY], snapshot, detected.state, now);
  await chrome.storage.local.set({ [SIGNAL_HISTORY_KEY]: updatedSignals });
  await enqueueSignalSummaries(updatedSignals, now);

  const previous = session[STATE_KEY] || null;
  const pending = session[PENDING_KEY] || null;
  let published = previous;

  if (detected.state === 'ok') {
    published = { state: 'ok', confidence: detected.confidence, reasons: detected.reasons, at: now };
  } else if (pending?.state === detected.state) {
    published = { state: detected.state, confidence: detected.confidence, reasons: detected.reasons, at: now };
  } else if (!previous || previous.state === 'ok') {
    published = { state: 'ok', confidence: 1, reasons: [], at: now };
  } else {
    published = { ...previous, at: now };
  }

  await chrome.storage.session.set({
    [STATE_KEY]: published,
    [PENDING_KEY]: detected.state === 'ok' ? null : { state: detected.state },
  });
  await onOutcomeTick(snapshot, now);
}

export function startStateLoop() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  tick().catch(() => {});
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) tick().catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'doorway:getState') {
      chrome.storage.session.get(STATE_KEY).then((data) => sendResponse(data[STATE_KEY] || null));
      return true;
    }
  });
}
