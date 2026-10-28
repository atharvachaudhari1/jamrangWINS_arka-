const DEFAULTS = {
  windowMins: 10,
  baseThreshold: 3,
  lowEnergyThreshold: 2,
  raisedThreshold: 5,
  baseCooldownMins: 30,
  maxPerSession: 2,
  minFocusSecs: 120,
  staleShownMins: 10,
  historyLimit: 10,
};

// Must match BREATHING_PLANNED_SECS in frontend BreathingCircle.jsx
const NUDGE_BREATHING_SECS = 64;

const PATCH_OUTCOMES = ['accepted', 'dismissed', 'completed', 'abandoned'];
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const ALLOWED_TRANSITIONS = {
  shown: ['accepted', 'dismissed'],
  accepted: ['completed', 'abandoned'],
};

function resolveConfig(env = {}) {
  if (env.NUDGE_DEMO_MODE === 'true') {
    return {
      ...DEFAULTS,
      baseThreshold: 2,
      lowEnergyThreshold: 2,
      windowMins: 5,
      minFocusSecs: 0,
      baseCooldownMins: 1,
      maxPerSession: 5,
    };
  }
  return { ...DEFAULTS };
}

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function isResolvedOutcome(outcome) {
  return outcome && outcome !== 'shown';
}

function countInWindow(distractionTimes, now, windowMins) {
  const windowMs = windowMins * 60 * 1000;
  return (distractionTimes || []).filter((t) => t <= now && (now - t) <= windowMs).length;
}

function cooldownMsFor(history, config) {
  let mins = config.baseCooldownMins;
  const resolved = (history || []).filter((h) => isResolvedOutcome(h.outcome));
  if (resolved.length >= 2 && resolved[0].outcome === 'dismissed' && resolved[1].outcome === 'dismissed') {
    mins *= 2;
  }
  return mins * 60 * 1000;
}

function pickThreshold(energyLevel, history, config) {
  const resolved = (history || []).filter((h) => isResolvedOutcome(h.outcome)).slice(0, 3);
  const dismissed = resolved.filter((h) => h.outcome === 'dismissed').length;
  if (resolved.length > 0 && dismissed >= 2) return config.raisedThreshold;
  if (energyLevel != null && energyLevel <= 2) return config.lowEnergyThreshold;
  return config.baseThreshold;
}

function evaluateNudge(input = {}) {
  const now = input.now;
  const config = { ...DEFAULTS, ...(input.config || {}) };
  const history = input.history || [];
  const distractionTimes = input.distractionTimes || [];
  const focusElapsedSecs = Number(input.focusElapsedSecs) || 0;
  const nudgesThisSession = Number(input.nudgesThisSession) || 0;
  const inWindow = countInWindow(distractionTimes, now, config.windowMins);

  const base = {
    nudge: false,
    threshold: config.baseThreshold,
    windowMins: config.windowMins,
    countInWindow: inWindow,
    cooldownRemainingSecs: 0,
    message: '',
  };

  if (focusElapsedSecs < config.minFocusSecs) {
    return { ...base, reason: 'too_early' };
  }

  if (nudgesThisSession >= config.maxPerSession) {
    return { ...base, reason: 'session_cap' };
  }

  const latest = history[0];
  if (latest) {
    const created = toEpochMs(latest.createdAt);
    if (created != null) {
      const wait = cooldownMsFor(history, config);
      const elapsed = now - created;
      if (elapsed < wait) {
        return {
          ...base,
          reason: 'cooldown',
          cooldownRemainingSecs: Math.ceil((wait - elapsed) / 1000),
        };
      }
    }
  }

  const threshold = pickThreshold(input.energyLevel, history, config);
  base.threshold = threshold;

  if (inWindow < threshold) {
    return { ...base, reason: 'below_threshold' };
  }

  const timesWord = inWindow === 1 ? 'time' : 'times';
  const minsWord = config.windowMins === 1 ? 'minute' : 'minutes';
  return {
    ...base,
    nudge: true,
    reason: 'ok',
    message: `You've left this tab ${inWindow} ${timesWord} in the last ${config.windowMins} ${minsWord}. Want a 1-minute reset?`,
  };
}

function parseDistractionTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const t = Date.parse(value);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function validateNudgeCheckBody(body = {}, now) {
  const timesRaw = body.distractionTimes;
  if (!Array.isArray(timesRaw)) {
    return { error: { status: 400, error: 'distractionTimes must be an array of at most 20 timestamps.' } };
  }
  if (timesRaw.length > 20) {
    return { error: { status: 400, error: 'distractionTimes must be an array of at most 20 timestamps.' } };
  }
  const parsedTimes = [];
  for (const item of timesRaw) {
    const t = parseDistractionTime(item);
    if (t == null) {
      return { error: { status: 400, error: 'distractionTimes must be an array of at most 20 timestamps.' } };
    }
    parsedTimes.push(t);
  }

  const dropBefore = now - 30 * 60 * 1000;
  const dropAfter = now + 60 * 1000;
  const distractionTimes = parsedTimes.filter((t) => t >= dropBefore && t <= dropAfter);

  const focusElapsedSecs = body.focusElapsedSecs;
  if (typeof focusElapsedSecs !== 'number' || !Number.isFinite(focusElapsedSecs) || focusElapsedSecs < 0 || focusElapsedSecs > 86400) {
    return { error: { status: 400, error: 'focusElapsedSecs must be a number from 0 to 86400.' } };
  }

  const nudgesThisSession = body.nudgesThisSession;
  if (!Number.isInteger(nudgesThisSession) || nudgesThisSession < 0 || nudgesThisSession > 20) {
    return { error: { status: 400, error: 'nudgesThisSession must be an integer from 0 to 20.' } };
  }

  let energyLevel;
  if (body.energyLevel != null && body.energyLevel !== '') {
    if (!Number.isInteger(body.energyLevel) || body.energyLevel < 1 || body.energyLevel > 5) {
      return { error: { status: 400, error: 'energyLevel must be from 1 to 5.' } };
    }
    energyLevel = body.energyLevel;
  }

  return {
    value: {
      distractionTimes,
      focusElapsedSecs,
      nudgesThisSession,
      energyLevel,
    },
  };
}

function validateNudgePatchBody(body = {}) {
  if (!PATCH_OUTCOMES.includes(body.outcome)) {
    return { error: { status: 400, error: 'outcome must be accepted, dismissed, completed, or abandoned.' } };
  }
  const value = { outcome: body.outcome };
  if (body.mindfulnessSessionId != null && body.mindfulnessSessionId !== '') {
    if (typeof body.mindfulnessSessionId !== 'string' || !OBJECT_ID_RE.test(body.mindfulnessSessionId)) {
      return { error: { status: 400, error: 'mindfulnessSessionId is not a valid id.' } };
    }
    value.mindfulnessSessionId = body.mindfulnessSessionId;
  }
  return { value };
}

function nudgeOwnerError(doc, userId) {
  if (!doc || String(doc.userId) !== String(userId)) {
    return { status: 404, error: 'Nudge not found.' };
  }
  return null;
}

function nudgeTransitionError(current, next) {
  const from = current && current.outcome ? current.outcome : current;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(next)) {
    return { status: 409, error: 'This nudge cannot move to that state.' };
  }
  return null;
}

function summarizeNudgeEvents(events, days) {
  const list = events || [];
  const shown = list.length;
  const accepted = list.filter((e) => e.outcome === 'accepted').length;
  const completed = list.filter((e) => e.outcome === 'completed').length;
  const dismissed = list.filter((e) => e.outcome === 'dismissed').length;
  const abandoned = list.filter((e) => e.outcome === 'abandoned').length;
  const acceptedFamily = accepted + completed + abandoned;
  return {
    days,
    shown,
    accepted,
    completed,
    dismissed,
    abandoned,
    acceptanceRate: shown === 0 ? null : acceptedFamily / shown,
    completionRate: acceptedFamily === 0 ? null : completed / acceptedFamily,
  };
}

module.exports = {
  DEFAULTS,
  NUDGE_BREATHING_SECS,
  resolveConfig,
  evaluateNudge,
  validateNudgeCheckBody,
  validateNudgePatchBody,
  nudgeOwnerError,
  nudgeTransitionError,
  summarizeNudgeEvents,
};
