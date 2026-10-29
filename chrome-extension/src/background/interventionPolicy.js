import { allowedFromMax, armLevel, chooseArm, summarize } from './bandit.js';

const MINUTE = 60 * 1000;

const KINDS = { 1: 'ambient', 2: 'prompt', 3: 'shrink' };

function asContext(state) {
  if (typeof state === 'string') {
    return { name: state, audible: false, nudgesEnabled: true, quietHours: null };
  }
  return {
    name: state?.state,
    audible: !!state?.audible,
    nudgesEnabled: state?.nudgesEnabled !== false,
    quietHours: state?.quietHours || null,
  };
}

function minutesOfDay(value) {
  if (typeof value !== 'string' || !value.includes(':')) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function inQuietHours(quiet, now) {
  if (!quiet) return false;
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start == null || end == null || start === end) return false;
  const date = new Date(now);
  const current = date.getHours() * 60 + date.getMinutes();
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function lastNudge(history) {
  return history.length ? history[history.length - 1] : null;
}

function ladderMax(rows, name, now) {
  const same = [...rows].reverse().find((row) => row.state === name);
  let level = 1;
  if (same && same.action === 'ignored' && now - same.at >= 3 * MINUTE) {
    level = Math.min(3, (same.level || 1) + 1);
  }
  return level;
}

function shortcutLevel(store, state) {
  const ranking = summarize(store)[state] || [];
  const updates = ranking.reduce((sum, arm) => sum + arm.samples, 0);
  if (updates < 8) return 1;
  const ambient = ranking.find((arm) => arm.arm === 'ambient');
  const ambientMean = ambient ? ambient.mean : 0.5;
  const better = ranking
    .filter((arm) => arm.arm !== 'ambient' && arm.samples >= 4 && arm.mean >= ambientMean + 0.2)
    .sort((a, b) => b.mean - a.mean)[0];
  if (!better) return 1;
  const level = armLevel(better.arm);
  if (level >= 3 && updates < 8) return 1;
  return level;
}

export function decideIntervention(state, history = [], now = Date.now(), learning = null) {
  const ctx = asContext(state);
  if (!ctx.name || ctx.name === 'ok' || ctx.name === 'uncertain') return null;
  if (!ctx.nudgesEnabled) return null;
  if (ctx.audible) return null;
  if (inQuietHours(ctx.quietHours, now)) return null;

  const rows = Array.isArray(history) ? history : [];
  const recentDismissals = rows.filter((row) => row.action === 'dismissed' && now - row.at <= 60 * MINUTE);
  if (recentDismissals.length >= 2) {
    const latest = recentDismissals[recentDismissals.length - 1];
    if (now - latest.at < 45 * MINUTE) return null;
  }

  const previous = lastNudge(rows);
  if (previous) {
    const ignored = previous.action === 'ignored';
    const ladderComplete = (previous.level || 1) >= 3;
    const cooldown = ignored ? (ladderComplete ? 5 * MINUTE : MINUTE) : 2 * MINUTE;
    if (now - previous.at < cooldown) return null;
  }

  if (ctx.name === 'depleted') return { level: 1, kind: 'rest' };

  const maxFromLadder = ladderMax(rows, ctx.name, now);
  const enabled = learning?.learningEnabled === true && learning?.store;
  if (!enabled) return { level: maxFromLadder, kind: KINDS[maxFromLadder] };

  let maxLevel = maxFromLadder;
  const learned = shortcutLevel(learning.store, ctx.name);
  if (learned > maxLevel) maxLevel = learned;
  const kind = chooseArm(ctx.name, now, allowedFromMax(maxLevel), learning.store, learning.rng);
  return { level: armLevel(kind), kind };
}
