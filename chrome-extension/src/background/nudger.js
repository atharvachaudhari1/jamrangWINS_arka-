import { getSnapshot, categorize, hostOf } from './signals.js';
import { decideIntervention } from './interventionPolicy.js';
import { getToken, getApiUrl } from '../utils/storage.js';
import { noteResponse, openTracking } from './outcomeTracker.js';

const HISTORY_KEY = 'doorway_nudgeHistory';
const PENDING_KEY = 'doorway_nudgePending';
const REST_KEY = 'doorway_restUntil';
const IGNORE_ALARM = 'doorway-nudge-ignore';
const REST_ALARM = 'doorway-rest-end';
const GENERIC_CHIPS = [
  { label: 'Start a 2-minute timer', action: 'timer' },
  { label: 'Write one line for 2 minutes', action: 'timer' },
];

async function history() {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
}

async function writeHistory(entries) {
  await chrome.storage.local.set({ [HISTORY_KEY]: entries.slice(-100) });
}

async function settings() {
  const data = await chrome.storage.local.get([
    'doorway_nudgesEnabled',
    'doorway_quietHours',
    'bbEnergy',
    REST_KEY,
    'doorway_bandit',
    'doorway_learningEnabled',
  ]);
  return data;
}

function appOrigin(apiUrl) {
  try {
    const url = new URL(apiUrl || 'http://localhost:4000/api');
    if (url.hostname === 'localhost' && url.port === '4000') url.port = '5173';
    return url.origin;
  } catch {
    return 'http://localhost:5173';
  }
}

async function authed(path, options = {}) {
  const [token, apiUrl] = await Promise.all([getToken(), getApiUrl()]);
  if (!token) return null;
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error('request failed');
  return response.json();
}

async function recommendation() {
  const stored = await chrome.storage.local.get('bbEnergy');
  const energy = Number(stored.bbEnergy);
  const level = Number.isFinite(energy) ? energy : 3;
  try {
    const data = await authed(`/tasks/what-next?energyLevel=${level}`);
    if (!data?.task?.title) return null;
    let smaller = null;
    try {
      const preview = await authed('/planner/action', {
        method: 'POST',
        body: JSON.stringify({ action: 'smaller', taskId: data.task._id, preview: true }),
      });
      smaller = preview?.proposal || preview?.steps?.[0] || null;
    } catch {
      smaller = null;
    }
    return { taskId: data.task._id, title: data.task.title, smaller };
  } catch {
    return null;
  }
}

async function payloadFor(decision) {
  if (decision.kind === 'ambient') return {};
  if (decision.kind === 'rest') {
    return { text: 'This looks like a rest moment.' };
  }
  if (decision.kind === 'cowork') {
    return { text: 'Want company while you start? A quiet 10 minutes.' };
  }
  const rec = await recommendation();
  if (decision.kind === 'shrink') {
    const step = rec?.smaller || null;
    return {
      step: step?.title || rec?.title || 'Write one line',
      choice: step && rec?.taskId
        ? { action: 'smaller', taskId: rec.taskId, step }
        : rec?.taskId
          ? { action: 'task', taskId: rec.taskId }
          : { action: 'timer' },
    };
  }
  const chips = [];
  if (rec?.taskId) chips.push({ label: `Start: ${rec.title}`, action: 'task', taskId: rec.taskId });
  if (rec?.smaller?.title && rec.taskId) {
    chips.push({ label: `Start smaller: ${rec.smaller.title}`, action: 'smaller', taskId: rec.taskId, step: rec.smaller });
  }
  if (!chips.length) chips.push(...GENERIC_CHIPS);
  return { text: "What's the tiniest first step?", chips: chips.slice(0, 3) };
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function consider(published) {
  if (!published || published.state === 'ok' || published.state === 'uncertain') return;
  const [snap, local, rows, pendingWrap] = await Promise.all([
    getSnapshot(),
    settings(),
    history(),
    chrome.storage.session.get(PENDING_KEY),
  ]);
  const pending = pendingWrap[PENDING_KEY];
  const view = pending
    ? rows.concat([{ at: pending.at, state: pending.state, level: pending.level, action: 'ignored' }])
    : rows;
  const decision = decideIntervention({
    state: published.state,
    audible: !!snap.current?.audible,
    nudgesEnabled: local.doorway_nudgesEnabled !== false,
    quietHours: local.doorway_quietHours || null,
  }, view, Date.now(), {
    store: local.doorway_bandit || {},
    learningEnabled: local.doorway_learningEnabled !== false,
  });
  if (!decision) return;
  const tab = await activeTab();
  if (!tab?.id) return;
  const payload = await payloadFor(decision);
  const at = Date.now();
  await chrome.storage.session.set({
    [PENDING_KEY]: { at, state: published.state, level: decision.level, kind: decision.kind },
  });
  chrome.alarms.create(IGNORE_ALARM, { when: at + 3 * 60 * 1000 });
  await sendToTab(tab.id, {
    type: 'doorway:nudge',
    level: decision.level,
    kind: decision.kind,
    state: published.state,
    payload,
  });
  await openTracking({
    at,
    state: published.state,
    level: decision.level,
    kind: decision.kind,
    confidence: published.confidence ?? null,
  });
}

async function record(action, msg) {
  const pendingWrap = await chrome.storage.session.get(PENDING_KEY);
  const pending = pendingWrap[PENDING_KEY];
  const rows = await history();
  const at = pending?.at || Date.now();
  rows.push({
    at,
    state: msg.state || pending?.state,
    level: msg.level || pending?.level,
    kind: msg.kind || pending?.kind,
    action,
  });
  await writeHistory(rows);
  await chrome.storage.session.remove(PENDING_KEY);
  await chrome.alarms.clear(IGNORE_ALARM);
  await noteResponse(null, action, msg.kind || pending?.kind);
}

async function softBlockOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    const host = hostOf(tab.url || '');
    if (!tab.id || categorize(host) !== 'passive') return;
    await sendToTab(tab.id, { type: 'doorway:softBlock' });
  }));
}

async function beginRest() {
  const until = Date.now() + 5 * 60 * 1000;
  await chrome.storage.local.set({ doorway_restUntil: until });
  chrome.alarms.create(REST_ALARM, { when: until });
  const apiUrl = await getApiUrl();
  await chrome.tabs.create({ url: `${appOrigin(apiUrl)}/mindful` });
  await softBlockOpenTabs();
}

async function startFromNudge(choice = {}) {
  const minutes = 2;
  let taskId = null;
  if (choice.action === 'task' && choice.taskId) {
    taskId = choice.taskId;
  } else if (choice.action === 'smaller' && choice.taskId && choice.step?.title) {
    const energy = await chrome.storage.local.get('bbEnergy');
    const result = await authed('/planner/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'smaller', taskId: choice.taskId, step: choice.step, energyLevel: energy.bbEnergy || 3 }),
    });
    taskId = result?.stepId || result?.task?._id || choice.taskId;
  } else if (choice.action !== 'timer') {
    throw new Error('This start option is unavailable.');
  }

  if (taskId) {
    const energy = await chrome.storage.local.get('bbEnergy');
    const result = await authed('/planner/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'do', taskId, energyLevel: energy.bbEnergy || 3 }),
    });
    if (!result?.started) throw new Error('Doorway could not start that task.');
  }

  const [{ appUrl }, apiUrl] = await Promise.all([
    chrome.storage.local.get('appUrl'),
    getApiUrl(),
  ]);
  const url = new URL('/focus', appUrl || appOrigin(apiUrl));
  url.searchParams.set('autostart', '1');
  url.searchParams.set('minutes', String(minutes));
  if (taskId) url.searchParams.set('taskId', taskId);
  await chrome.tabs.create({ url: url.toString(), active: true });
}

async function readyMessage() {
  const tab = await activeTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, {
    type: 'doorway:nudge',
    level: 1,
    kind: 'ready',
    state: 'ok',
    payload: { text: 'Ready when you are.' },
  });
}

export function startNudger() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes.doorway_state?.newValue) return;
    consider(changes.doorway_state.newValue).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'doorway:startFromNudge') {
      startFromNudge(msg.choice)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (msg?.type === 'doorway:nudgeResponse') {
      record(msg.action === 'accepted' ? 'accepted' : 'dismissed', msg)
        .then(async () => {
          if (msg.action === 'accepted' && msg.kind === 'rest') await beginRest();
          sendResponse({ ok: true });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === IGNORE_ALARM) {
      chrome.storage.session.get(PENDING_KEY).then(async (data) => {
        const pending = data[PENDING_KEY];
        if (!pending) return;
        const rows = await history();
        rows.push({ at: pending.at, state: pending.state, level: pending.level, kind: pending.kind, action: 'ignored' });
        await writeHistory(rows);
        await chrome.storage.session.remove(PENDING_KEY);
        await noteResponse(null, 'ignored', pending.kind);
      }).catch(() => {});
    }
    if (alarm.name === REST_ALARM) {
      readyMessage().catch(() => {});
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    chrome.storage.local.get(REST_KEY).then((data) => {
      if (data[REST_KEY] && data[REST_KEY] > Date.now()) softBlockOpenTabs();
    });
  });

  chrome.tabs.onUpdated.addListener((_id, info, tab) => {
    if (info.status !== 'complete') return;
    chrome.storage.local.get(REST_KEY).then((data) => {
      if (!data[REST_KEY] || data[REST_KEY] <= Date.now()) return;
      const host = hostOf(tab.url || '');
      if (categorize(host) === 'passive') sendToTab(tab.id, { type: 'doorway:softBlock' });
    });
  });
}
