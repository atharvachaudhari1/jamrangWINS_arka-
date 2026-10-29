import { enqueueNudge, flushUploads } from './uploader.js';
import { updateArm } from './bandit.js';

export const WINDOW_MS = 10 * 60 * 1000;
const PENDING_KEY = 'doorway_pendingOutcome';
const HISTORY_KEY = 'doorway_nudgeHistory';
const WORK_IDLE_MS = 2 * 60 * 1000;

export function beginOutcome(nudge) {
  return {
    nudgeId: String(nudge.at),
    state: nudge.state,
    level: nudge.level,
    kind: nudge.kind,
    confidence: nudge.confidence ?? null,
    sentAt: nudge.at,
    action: null,
    taskActionAt: null,
    restAccepted: false,
    workTicks: 0,
  };
}

function finished(pending, outcome, secondsToAction) {
  return {
    at: pending.sentAt,
    state: pending.state,
    level: pending.level,
    kind: pending.kind,
    action: pending.action,
    outcome,
    secondsToAction,
    confidence: pending.confidence ?? null,
  };
}

export function stepOutcome(pending, event, now) {
  if (!pending) return { pending: null, record: null };
  const next = { ...pending };
  if (event.type === 'response') {
    next.action = event.action;
    if (event.kind) next.kind = event.kind;
    if (event.action === 'accepted' && next.kind === 'rest') next.restAccepted = true;
    else if (event.action === 'accepted') next.taskActionAt = next.taskActionAt ?? now;
  } else if (event.type === 'task') {
    if (now - next.sentAt <= WINDOW_MS) next.taskActionAt = next.taskActionAt ?? now;
  } else if (event.type === 'tick') {
    const quietWork = event.category === 'work' && (event.focusedIdleMs || 0) < WORK_IDLE_MS;
    next.workTicks = quietWork ? next.workTicks + 1 : 0;
    if (next.workTicks >= 3 && now - next.sentAt <= WINDOW_MS) next.taskActionAt = next.taskActionAt ?? now;
    if (next.restAccepted && event.restUntil != null && event.restUntil <= now) {
      return { pending: null, record: finished(next, 'rested', null) };
    }
  }
  if (next.taskActionAt != null && next.taskActionAt - next.sentAt <= WINDOW_MS) {
    return {
      pending: null,
      record: finished(next, 'acted', Math.round((next.taskActionAt - next.sentAt) / 1000)),
    };
  }
  const expired = event.type === 'close' || now - next.sentAt >= WINDOW_MS;
  if (!expired) return { pending: next, record: null };
  if (next.action === 'dismissed') return { pending: null, record: finished(next, 'dismissed', null) };
  if (next.action === 'ignored') return { pending: null, record: finished(next, 'ignored', null) };
  return { pending: null, record: finished(next, 'no_change', null) };
}

async function readPending() {
  const data = await chrome.storage.session.get(PENDING_KEY);
  return data[PENDING_KEY] || null;
}

async function commit(record) {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const rows = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  const index = rows.findIndex((row) => row.at === record.at && row.outcome == null);
  if (index >= 0) rows[index] = { ...rows[index], ...record };
  else rows.push(record);
  await chrome.storage.local.set({ [HISTORY_KEY]: rows.slice(-100) });
  if (record.state !== 'depleted' && record.kind !== 'rest' && record.kind) {
    const saved = await chrome.storage.local.get('doorway_bandit');
    const store = updateArm(record.state, record.at, record.kind, record.outcome, record.secondsToAction, saved.doorway_bandit || {});
    await chrome.storage.local.set({ doorway_bandit: store });
  }
  await enqueueNudge(record);
}

async function saveStep(step) {
  if (!step) return;
  if (step.record) {
    await chrome.storage.session.remove(PENDING_KEY);
    await commit(step.record);
    return;
  }
  if (step.pending) await chrome.storage.session.set({ [PENDING_KEY]: step.pending });
  else await chrome.storage.session.remove(PENDING_KEY);
}

export async function openTracking(nudge, now = Date.now()) {
  const current = await readPending();
  if (current) await saveStep(stepOutcome(current, { type: 'close' }, now));
  await chrome.storage.session.set({ [PENDING_KEY]: beginOutcome(nudge) });
}

export async function noteResponse(pending, action, kind, now = Date.now()) {
  const current = pending || await readPending();
  if (!current) return;
  await saveStep(stepOutcome(current, { type: 'response', action, kind }, now));
}

export async function noteTaskAction(now = Date.now()) {
  const current = await readPending();
  if (!current) return;
  await saveStep(stepOutcome(current, { type: 'task' }, now));
}

export async function onOutcomeTick(snapshot, now = Date.now()) {
  try {
    const [current, local] = await Promise.all([
      readPending(),
      chrome.storage.local.get('doorway_restUntil'),
    ]);
    if (current) {
      await saveStep(stepOutcome(current, {
        type: 'tick',
        category: snapshot?.current?.cat || null,
        focusedIdleMs: snapshot?.focusedIdleMs || 0,
        restUntil: local.doorway_restUntil ?? null,
      }, now));
    }
    await flushUploads(now);
  } catch {
    return;
  }
}

export function startOutcomeTracker() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'doorway:taskAction') noteTaskAction().catch(() => {});
  });
}
