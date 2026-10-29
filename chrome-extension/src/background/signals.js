import { clearUploadedInsights } from './uploader.js';

const STORE_KEY = 'doorway_signals';
const WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS = 300;
const IDLE_SECONDS = 60;

const CATEGORY_RULES = [
  ['passive', ['youtube.com', 'netflix.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'reddit.com', 'tiktok.com', 'twitch.tv', 'primevideo.com']],
  ['comms', ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'slack.com', 'discord.com', 'web.whatsapp.com', 'teams.microsoft.com', 'telegram.org']],
  ['work', ['docs.google.com', 'drive.google.com', 'github.com', 'overleaf.com', 'notion.so', 'classroom.google.com', 'moodle', 'nptel.ac.in', 'localhost']]
];

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function categorize(host) {
  if (!host) return 'other';
  for (const [cat, list] of CATEGORY_RULES) {
    if (list.some((d) => host === d || host.endsWith('.' + d) || host.includes(d))) return cat;
  }
  return 'other';
}

function entropy(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return -counts.reduce((sum, c) => {
    const p = c / total;
    return sum + p * Math.log2(p);
  }, 0);
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeSnapshot(events, now, ctx = {}) {
  const recent = events.filter((e) => now - e.t <= WINDOW_MS);
  const switches = recent.filter((e) => e.type === 'switch');
  const spanMin = Math.max(Math.min(WINDOW_MS, now - (recent[0]?.t ?? now)) / 60000, 1);

  const hostCounts = {};
  const catMs = { passive: 0, comms: 0, work: 0, other: 0 };
  const dwells = [];
  switches.forEach((e, i) => {
    hostCounts[e.host] = (hostCounts[e.host] || 0) + 1;
    const next = switches[i + 1]?.t ?? now;
    const dwell = next - e.t;
    dwells.push(dwell);
    catMs[e.cat] += dwell;
  });

  const counts = Object.values(hostCounts);
  const sorted = [...counts].sort((a, b) => b - a);
  const top2Share = switches.length ? (sorted[0] + (sorted[1] || 0)) / switches.length : 0;
  const revisitLoop = switches.length >= 6 && counts.length <= 3;

  const lastIdle = [...events].reverse().find((e) => e.type === 'idle' || e.type === 'active');
  const focusedIdleMs =
    lastIdle && lastIdle.type === 'idle' ? Math.max(0, now - (lastIdle.t - IDLE_SECONDS * 1000)) : 0;

  return {
    at: now,
    windowMin: Math.round(spanMin * 10) / 10,
    switchCount: switches.length,
    switchesPerMin: Math.round((switches.length / spanMin) * 100) / 100,
    distinctHosts: counts.length,
    switchEntropy: Math.round(entropy(counts) * 100) / 100,
    top2Share: Math.round(top2Share * 100) / 100,
    revisitLoop,
    medianDwellMs: Math.round(median(dwells)),
    switchTimes: switches.map((event) => event.t),
    categoryMs: catMs,
    focusedIdleMs,
    current: ctx.current || null
  };
}

let queue = Promise.resolve();

function locked(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function loadEvents() {
  const data = await chrome.storage.session.get(STORE_KEY);
  return data[STORE_KEY] || [];
}

async function pushEvent(event) {
  return locked(async () => {
    const events = await loadEvents();
    if (event.type === 'switch') {
      const lastSwitch = [...events].reverse().find((e) => e.type === 'switch');
      if (lastSwitch && lastSwitch.host === event.host) return;
    }
    events.push(event);
    const cutoff = event.t - WINDOW_MS * 2;
    const trimmed = events.filter((e) => e.t >= cutoff).slice(-MAX_EVENTS);
    await chrome.storage.session.set({ [STORE_KEY]: trimmed });
  });
}

async function recordTab(tab) {
  if (!tab || !tab.url) return;
  const host = hostOf(tab.url);
  if (!host) return;
  await pushEvent({ t: Date.now(), type: 'switch', host, cat: categorize(host) });
}

async function currentContext() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return { current: null };
  const host = hostOf(tab.url);
  return {
    current: { host, cat: categorize(host), audible: !!tab.audible }
  };
}

export async function getSnapshot() {
  const events = await locked(loadEvents);
  const ctx = await currentContext();
  return computeSnapshot(events, Date.now(), ctx);
}

export async function clearSignals() {
  await Promise.all([
    locked(() => chrome.storage.session.remove(STORE_KEY)),
    chrome.storage.local.remove('doorway_signalHistory'),
    clearUploadedInsights(),
  ]);
}

export function startSignals() {
  chrome.idle.setDetectionInterval(IDLE_SECONDS);

  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      recordTab(await chrome.tabs.get(tabId));
    } catch {}
  });

  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === 'complete' && tab.active) recordTab(tab);
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    recordTab(tab);
  });

  chrome.idle.onStateChanged.addListener((state) => {
    const type = state === 'active' ? 'active' : 'idle';
    pushEvent({ t: Date.now(), type });
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'doorway:getSignals') {
      getSnapshot().then(sendResponse);
      return true;
    }
    if (msg?.type === 'doorway:clearSignals') {
      clearSignals().then(() => sendResponse({ ok: true }));
      return true;
    }
  });
}
