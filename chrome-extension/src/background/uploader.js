import { getApiUrl, getToken } from '../utils/storage.js';

const QUEUE_KEY = 'doorway_uploadQueue';
const SYNC_KEY = 'doorway_syncInsights';
const UPLOADED_SIGNALS_KEY = 'doorway_uploadedSignalDates';
const MAX_QUEUE = 100;
const CAP_MS = 30 * 60 * 1000;

function pick(record) {
  return {
    state: record.state,
    level: record.level,
    kind: record.kind,
    action: record.action,
    outcome: record.outcome,
    secondsToAction: record.secondsToAction ?? null,
    confidence: record.confidence ?? null,
  };
}

async function readQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
}

export async function clearUploadQueue() {
  await chrome.storage.local.set({ [QUEUE_KEY]: [] });
}

export async function enqueueNudge(record) {
  const data = await chrome.storage.local.get(SYNC_KEY);
  if (data[SYNC_KEY] !== true) return;
  if (!record?.action || !record?.outcome) return;
  const queue = await readQueue();
  if (queue.some((item) => item.at === record.at && item.body?.nudge?.outcome === record.outcome)) return;
  queue.push({
    at: record.at,
    attempts: 0,
    nextAt: Date.now(),
    body: {
      eventType: 'nudge',
      at: record.at,
      nudge: pick(record),
    },
  });
  await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-MAX_QUEUE) });
}

function todayKey(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function enqueueSignalSummaries(rows, now = Date.now()) {
  const settings = await chrome.storage.local.get(SYNC_KEY);
  if (settings[SYNC_KEY] !== true) return;
  const queue = await readQueue();
  const uploaded = await chrome.storage.local.get(UPLOADED_SIGNALS_KEY);
  const uploadedDates = new Set(Array.isArray(uploaded[UPLOADED_SIGNALS_KEY]) ? uploaded[UPLOADED_SIGNALS_KEY] : []);
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.date || row.date >= todayKey(now)) continue;
    if (uploadedDates.has(row.date)) continue;
    if (queue.some((item) => item.body?.eventType === 'signalSummary' && item.body?.signals?.date === row.date)) continue;
    const signals = {
      date: row.date,
      observedMinutes: row.observedMinutes || 0,
      idleMinutes: row.idleMinutes || 0,
      switches: row.switches || 0,
      frozenMinutes: row.frozenMinutes || 0,
      thrashingMinutes: row.thrashingMinutes || 0,
      avoidanceMinutes: row.avoidanceMinutes || 0,
      depletedMinutes: row.depletedMinutes || 0,
    };
    queue.push({ at: new Date(`${row.date}T00:00:00`).getTime(), attempts: 0, nextAt: Date.now(), body: { eventType: 'signalSummary', signals } });
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-MAX_QUEUE) });
}

export async function clearUploadedInsights() {
  await chrome.storage.local.remove(UPLOADED_SIGNALS_KEY);
  const token = await getToken();
  if (!token) return;
  const apiUrl = await getApiUrl();
  try {
    await fetch(`${apiUrl}/recommendation-events/insights`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return;
  }
}

export async function flushUploads(now = Date.now()) {
  const settings = await chrome.storage.local.get(SYNC_KEY);
  if (settings[SYNC_KEY] !== true) {
    await clearUploadQueue();
    return;
  }
  const token = await getToken();
  const apiUrl = await getApiUrl();
  const queue = await readQueue();
  if (!queue.length) return;
  if (!token) return;
  const keep = [];
  const uploaded = await chrome.storage.local.get(UPLOADED_SIGNALS_KEY);
  const uploadedDates = new Set(Array.isArray(uploaded[UPLOADED_SIGNALS_KEY]) ? uploaded[UPLOADED_SIGNALS_KEY] : []);
  for (const item of queue) {
    if (item.nextAt > now) {
      keep.push(item);
      continue;
    }
    try {
      const response = await fetch(`${apiUrl}/recommendation-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(item.body),
      });
      if (!response.ok) throw new Error('upload failed');
      if (item.body?.eventType === 'signalSummary' && item.body.signals?.date) uploadedDates.add(item.body.signals.date);
    } catch {
      const attempts = (item.attempts || 0) + 1;
      const delay = Math.min(CAP_MS, 60 * 1000 * (2 ** (attempts - 1)));
      keep.push({ ...item, attempts, nextAt: now + delay });
    }
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: keep.slice(-MAX_QUEUE), [UPLOADED_SIGNALS_KEY]: [...uploadedDates].slice(-30) });
}

export async function syncLocalHistory() {
  const settings = await chrome.storage.local.get(SYNC_KEY);
  if (settings[SYNC_KEY] !== true) return;
  const data = await chrome.storage.local.get('doorway_nudgeHistory');
  const rows = Array.isArray(data.doorway_nudgeHistory) ? data.doorway_nudgeHistory : [];
  for (const row of rows) {
    if (row?.outcome && row?.action) await enqueueNudge(row);
  }
  const signals = await chrome.storage.local.get('doorway_signalHistory');
  await enqueueSignalSummaries(signals.doorway_signalHistory, Date.now());
  await flushUploads();
}
