// JumpyBrain Background Service Worker
// Manages timer state and declarativeNetRequest blocking rules

import { startSignals } from './signals.js';
import { startStateLoop } from './stateLoop.js';
import { startNudger } from './nudger.js';
import { noteTaskAction, startOutcomeTracker } from './outcomeTracker.js';
import { startGoogleAuth } from '../utils/googleAuth.js';
import { seedPersona, summarize } from './bandit.js';
import { syncLocalHistory } from './uploader.js';

async function injectExistingPages() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(tabs.map(async (tab) => {
    if (!tab.id) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
    } catch {
      // Some browser pages (for example, the Chrome Web Store) reject injection.
    }
  }));
}

chrome.runtime.onInstalled.addListener(() => injectExistingPages().catch(() => {}));
chrome.runtime.onStartup.addListener(() => injectExistingPages().catch(() => {}));

startSignals();
startStateLoop();
startNudger();
startOutcomeTracker();
startGoogleAuth();

const TIMER_ALARM = 'bb-timer';
const SYNC_ALARM  = 'bb-blocking-sync';

// Rule ID ranges: 1–9999 blocked sites, 10001–19999 whitelist (higher priority wins)
const BLOCK_ID_OFFSET     = 1;
const WHITELIST_ID_OFFSET = 10001;

const DEFAULT_STATE = {
  active: false,
  isWork: true,
  workMins: 25,
  breakMins: 5,
  mode: 'pomodoro',
  endsAt: null,
  pausedRemaining: null,
  sessionCount: 0,
  distractionCount: 0,
};

// ── Timer state helpers ──────────────────────────────────────────────────────

async function getState() {
  const { timerState } = await chrome.storage.local.get('timerState');
  return timerState || DEFAULT_STATE;
}

async function saveState(state) {
  await chrome.storage.local.set({ timerState: state });
}

function computeRemaining(state) {
  if (state.active && state.endsAt) return Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  if (state.pausedRemaining != null) return Math.round(state.pausedRemaining / 1000);
  return (state.isWork ? state.workMins : state.breakMins) * 60;
}

// ── Blocking helpers ─────────────────────────────────────────────────────────

function isScheduleActive(schedule) {
  if (!schedule?.enabled) return false;
  const now  = new Date();
  const day  = now.getDay();
  if (!Array.isArray(schedule.days) || !schedule.days.includes(day)) return false;
  const [sh, sm] = (schedule.startTime || '09:00').split(':').map(Number);
  const [eh, em] = (schedule.endTime   || '17:00').split(':').map(Number);
  const nowMins  = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
}

async function applyBlockingRules(blockedSites, whitelist) {
  const existing     = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  const addRules     = [];

  (blockedSites || []).filter((s) => s.enabled !== false).slice(0, 500).forEach((site, i) => {
    const domain = (site.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    addRules.push({
      id: BLOCK_ID_OFFSET + i,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { extensionPath: `/blocked.html?site=${encodeURIComponent(domain)}` },
      },
      condition: {
        urlFilter: `||${domain}`,
        resourceTypes: ['main_frame'],
      },
    });
  });

  (whitelist || []).filter((s) => s.enabled !== false).slice(0, 500).forEach((site, i) => {
    const domain = (site.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    addRules.push({
      id: WHITELIST_ID_OFFSET + i,
      priority: 2,
      action: { type: 'allow' },
      condition: {
        urlFilter: `||${domain}`,
        resourceTypes: ['main_frame'],
      },
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function clearBlockingRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (!existing.length) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: [],
  });
}

async function evaluateAndApplyRules(rules) {
  if (!rules) {
    const stored = await chrome.storage.local.get('blockingRules');
    rules = stored.blockingRules;
  }

  if (!rules?.isEnabled) {
    await clearBlockingRules();
    return;
  }

  // Check snooze — temporarily suppresses blocking
  const { blockingSnoozeUntil } = await chrome.storage.local.get('blockingSnoozeUntil');
  if (blockingSnoozeUntil && Date.now() < blockingSnoozeUntil) {
    await clearBlockingRules();
    return;
  }

  // Check account-level pause (set from the JumpyBrain app's Focus Shield page, synced via the API)
  if (rules.pausedUntil && Date.now() < new Date(rules.pausedUntil).getTime()) {
    await clearBlockingRules();
    return;
  }

  const timerState   = await getState();
  const sessionBlock = timerState.active && timerState.isWork;
  const scheduleBlock = isScheduleActive(rules.schedule);

  if (sessionBlock || scheduleBlock) {
    await applyBlockingRules(rules.blockedSites, rules.whitelist);
  } else {
    await clearBlockingRules();
  }
}

async function syncAndApplyRules() {
  const { authToken, apiUrl } = await chrome.storage.local.get(['authToken', 'apiUrl']);
  if (!authToken || !apiUrl) return;

  try {
    const res = await fetch(`${apiUrl}/blocking`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return;
    const { rules } = await res.json();
    await chrome.storage.local.set({ blockingRules: rules });
    await evaluateAndApplyRules(rules);
  } catch {}
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const { timerState } = await chrome.storage.local.get('timerState');
  if (!timerState) await chrome.storage.local.set({ timerState: DEFAULT_STATE });

  // Periodic rule sync every 5 minutes
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  await syncAndApplyRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncAndApplyRules();
});

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'doorway:debugBandit') {
    chrome.storage.local.get('doorway_bandit').then((data) => sendResponse(summarize(data.doorway_bandit || {})));
    return true;
  }
  if (msg?.type === 'doorway:seedBandit') {
    const store = seedPersona();
    chrome.storage.local.set({ doorway_bandit: store }).then(() => sendResponse(summarize(store)));
    return true;
  }
  if (msg?.type === 'doorway:syncInsights') {
    syncLocalHistory().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (typeof msg?.type === 'string' && msg.type.startsWith('doorway:')) return;
  handleMessage(msg).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true;
});

// ── External auth sync (from the JumpyBrain web app) ───────────────────────────
// Only origins listed in manifest.json's "externally_connectable.matches" ever
// reach this listener — Chrome enforces that before delivery. We re-derive the
// same list here and re-check sender.origin as defense-in-depth, so the two
// never drift out of sync and a stray origin can't silently start working.

function trustedAuthOrigins() {
  const matches = chrome.runtime.getManifest().externally_connectable?.matches || [];
  return new Set(matches.map((m) => m.replace(/\/\*$/, '')));
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!trustedAuthOrigins().has(sender.origin)) {
    sendResponse({ error: 'Untrusted origin' });
    return;
  }

  if (msg?.type === 'SET_AUTH') {
    const { authToken, apiUrl, appUrl, user } = msg.payload || {};
    if (!authToken || !apiUrl) {
      sendResponse({ error: 'Missing authToken or apiUrl' });
      return;
    }
    chrome.storage.local.set({ authToken, apiUrl, appUrl, user: user || null })
      .then(() => syncLocalHistory())
      .then(syncAndApplyRules)
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === 'CLEAR_AUTH') {
    chrome.storage.local.remove(['authToken', 'apiUrl', 'user'])
      .then(clearBlockingRules)
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  sendResponse({ error: 'Unknown message type' });
});

async function handleMessage({ type, payload }) {
  switch (type) {

    case 'GET_TIMER': {
      const state = await getState();
      return { ...state, remainingSeconds: computeRemaining(state) };
    }

    case 'START_TIMER': {
      const base = await getState();
      const next = { ...base, ...payload, active: true, pausedRemaining: null };
      next.endsAt = Date.now() + (next.isWork ? next.workMins : next.breakMins) * 60 * 1000;
      await saveState(next);
      await chrome.alarms.clear(TIMER_ALARM);
      chrome.alarms.create(TIMER_ALARM, { when: next.endsAt });

      // Enable blocking when a work session starts
      if (next.isWork) {
        await evaluateAndApplyRules();
        await noteTaskAction();
      }

      return { ok: true };
    }

    case 'PAUSE_TIMER': {
      const state = await getState();
      if (!state.active) return { ok: true };
      const updated = { ...state, active: false, pausedRemaining: Math.max(0, state.endsAt - Date.now()), endsAt: null };
      await saveState(updated);
      await chrome.alarms.clear(TIMER_ALARM);

      // Re-evaluate — schedule may still keep blocking active
      await evaluateAndApplyRules();
      return { ok: true };
    }

    case 'RESUME_TIMER': {
      const state = await getState();
      if (state.active || state.pausedRemaining == null) return { ok: true };
      const endsAt  = Date.now() + state.pausedRemaining;
      const updated = { ...state, active: true, endsAt, pausedRemaining: null };
      await saveState(updated);
      chrome.alarms.create(TIMER_ALARM, { when: endsAt });

      if (updated.isWork) await evaluateAndApplyRules();
      return { ok: true };
    }

    case 'RESET_TIMER': {
      const state = await getState();
      const reset  = { ...state, active: false, isWork: true, endsAt: null, pausedRemaining: null, distractionCount: 0 };
      await saveState(reset);
      await chrome.alarms.clear(TIMER_ALARM);

      await evaluateAndApplyRules();
      return { ok: true };
    }

    case 'INCREMENT_DISTRACTION': {
      const state = await getState();
      await saveState({ ...state, distractionCount: (state.distractionCount || 0) + 1 });
      return { ok: true };
    }

    case 'SET_CONFIG': {
      const state = await getState();
      await saveState({ ...state, ...payload });
      return { ok: true };
    }

    case 'GET_BLOCKING_STATE': {
      const [timerState, stored] = await Promise.all([
        getState(),
        chrome.storage.local.get(['blockingRules', 'blockingSnoozeUntil']),
      ]);
      const rules    = stored.blockingRules || null;
      const snoozed  = stored.blockingSnoozeUntil && Date.now() < stored.blockingSnoozeUntil;
      const existing = await chrome.declarativeNetRequest.getDynamicRules();

      return {
        rulesEnabled:   rules?.isEnabled ?? false,
        activeRules:    existing.length,
        blockedCount:   (rules?.blockedSites || []).length,
        whitelistCount: (rules?.whitelist || []).length,
        sessionActive:  timerState.active && timerState.isWork,
        scheduleActive: isScheduleActive(rules?.schedule),
        snoozed,
        snoozeUntil:    stored.blockingSnoozeUntil || null,
      };
    }

    case 'SYNC_BLOCKING_RULES': {
      await syncAndApplyRules();
      return { ok: true };
    }

    case 'SNOOZE_BLOCKING': {
      const mins = payload?.minutes ?? 5;
      const until = Date.now() + mins * 60 * 1000;
      await chrome.storage.local.set({ blockingSnoozeUntil: until });
      await clearBlockingRules();
      // Wake up after snooze to re-evaluate
      chrome.alarms.create('bb-blocking-snooze', { when: until });
      return { ok: true };
    }

    case 'UNSNOOZE_BLOCKING': {
      await chrome.storage.local.remove('blockingSnoozeUntil');
      await evaluateAndApplyRules();
      return { ok: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Alarm handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await syncAndApplyRules();
    return;
  }

  if (alarm.name === 'bb-blocking-snooze') {
    await chrome.storage.local.remove('blockingSnoozeUntil');
    await evaluateAndApplyRules();
    return;
  }

  if (alarm.name !== TIMER_ALARM) return;

  const state   = await getState();
  const wasWork = state.isWork;

  const updated = {
    ...state,
    active: false,
    isWork: !wasWork,
    endsAt: null,
    sessionCount: wasWork ? (state.sessionCount || 0) + 1 : state.sessionCount,
    distractionCount: wasWork ? 0 : state.distractionCount,
  };
  await saveState(updated);

  // Re-evaluate rules now that session ended (schedule may still block)
  await evaluateAndApplyRules();

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: wasWork ? 'Doorway — Session Complete!' : 'Doorway — Break Over!',
    message: wasWork
      ? `Great work! Take a ${state.breakMins}-minute break. 🎉`
      : 'Break is over. Ready to focus again? 💪',
    priority: 2,
  });

  if (wasWork) {
    noteTaskAction().catch(() => {});
    logSessionToBackend(state).catch(() => {});
  }
});

async function logSessionToBackend(state) {
  const { authToken, apiUrl, bbEnergy } = await chrome.storage.local.get(['authToken', 'apiUrl', 'bbEnergy']);
  if (!authToken || !apiUrl) return;

  await fetch(`${apiUrl}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      type: state.mode || 'pomodoro',
      durationMins: state.workMins,
      distractionCount: state.distractionCount || 0,
      energyLevel: bbEnergy || undefined,
      taskId: state.taskId || undefined,
    }),
  });
}
