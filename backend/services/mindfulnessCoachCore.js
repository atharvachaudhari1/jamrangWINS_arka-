const ML_TYPES = ['grounding', 'meditation', 'breathing'];
const SESSION_TYPES = ['meditation', 'grounding', 'sleep', 'breathing'];
const TRIGGERS = ['manual', 'recommendation', 'nudge'];
const TZ_OFFSET_MIN = -840;
const TZ_OFFSET_MAX = 840;

function clampEnergy(value, fallback = 3) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, n));
}

function dayKey(date, tzOffsetMins = 0) {
  const shifted = new Date(new Date(date).getTime() - tzOffsetMins * 60000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(isoDay, delta) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function computeStreakDays(dayKeys, todayKey) {
  const set = new Set(dayKeys);
  let cursor = todayKey;
  if (!set.has(cursor)) {
    cursor = addDays(todayKey, -1);
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function computeSessionStats(sessions, { now = new Date(), tzOffsetMins = 0 } = {}) {
  const completed = (sessions || []).filter((s) => s.completed);
  const totalSecs = completed.reduce((sum, s) => sum + (Number(s.completedSecs) || 0), 0);
  const todayKey = dayKey(now, tzOffsetMins);
  const last7Days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = addDays(todayKey, -i);
    const minutes = completed
      .filter((s) => dayKey(s.endedAt || s.startedAt, tzOffsetMins) === key)
      .reduce((sum, s) => sum + (Number(s.completedSecs) || 0), 0) / 60;
    last7Days.push({ date: key, minutes: Math.round(minutes * 10) / 10 });
  }
  const perType = { meditation: 0, grounding: 0, sleep: 0, breathing: 0 };
  for (const s of completed) {
    if (perType[s.type] != null) perType[s.type] += 1;
  }
  const streakDays = computeStreakDays(
    completed.map((s) => dayKey(s.endedAt || s.startedAt, tzOffsetMins)),
    todayKey,
  );
  return {
    totalMinutes: Math.round((totalSecs / 60) * 10) / 10,
    count: completed.length,
    streakDays,
    last7Days,
    perType,
  };
}

function sessionOwnerError(session, userId) {
  if (!session || String(session.userId) !== String(userId)) {
    return { status: 404, error: 'Session not found.' };
  }
  return null;
}

function sessionDeleteError(session, userId) {
  const ownership = sessionOwnerError(session, userId);
  if (ownership) return ownership;
  if (session.endedAt) return { status: 409, error: 'Session already ended.' };
  return null;
}

function parseTzOffsetMins(raw) {
  if (raw == null || raw === '') return { value: 0 };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < TZ_OFFSET_MIN || n > TZ_OFFSET_MAX) {
    return { error: { status: 400, error: 'tzOffsetMins must be an integer from -840 to 840.' } };
  }
  return { value: n };
}

function isIntInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validateStartBody(body = {}) {
  if (!SESSION_TYPES.includes(body.type)) {
    return { error: { status: 400, error: 'Choose meditation, grounding, sleep, or breathing.' } };
  }
  if (typeof body.plannedSecs !== 'number' || !Number.isFinite(body.plannedSecs) || body.plannedSecs < 1 || body.plannedSecs > 10800) {
    return { error: { status: 400, error: 'plannedSecs must be between 1 and 10800.' } };
  }
  let energyBefore;
  if (body.energyBefore != null) {
    if (!isIntInRange(body.energyBefore, 1, 5)) {
      return { error: { status: 400, error: 'energyBefore must be from 1 to 5.' } };
    }
    energyBefore = body.energyBefore;
  }
  let distractionBefore;
  if (body.distractionBefore != null) {
    if (typeof body.distractionBefore !== 'number' || !Number.isFinite(body.distractionBefore) || body.distractionBefore < 0 || body.distractionBefore > 200) {
      return { error: { status: 400, error: 'distractionBefore must be a number from 0 to 200.' } };
    }
    distractionBefore = body.distractionBefore;
  }
  let triggeredBy = 'manual';
  if (body.triggeredBy != null && body.triggeredBy !== '') {
    if (!TRIGGERS.includes(body.triggeredBy)) {
      return { error: { status: 400, error: 'triggeredBy must be manual, recommendation, or nudge.' } };
    }
    triggeredBy = body.triggeredBy;
  }
  return {
    value: {
      type: body.type,
      plannedSecs: body.plannedSecs,
      energyBefore,
      distractionBefore,
      triggeredBy,
    },
  };
}

function validatePatchBody(body = {}, session = {}) {
  const value = {};
  if (body.completedSecs != null) {
    if (typeof body.completedSecs !== 'number' || !Number.isFinite(body.completedSecs) || body.completedSecs < 0) {
      return { error: { status: 400, error: 'completedSecs must be 0 or more.' } };
    }
    const cap = (Number(session.plannedSecs) || 0) * 2;
    if (body.completedSecs > cap) {
      return { error: { status: 400, error: 'completedSecs is longer than expected for this session.' } };
    }
    value.completedSecs = body.completedSecs;
  }
  if (body.completed != null) {
    if (typeof body.completed !== 'boolean') {
      return { error: { status: 400, error: 'completed must be true or false.' } };
    }
    value.completed = body.completed;
  }
  if (body.energyAfter != null) {
    if (!isIntInRange(body.energyAfter, 1, 5)) {
      return { error: { status: 400, error: 'energyAfter must be from 1 to 5.' } };
    }
    value.energyAfter = body.energyAfter;
  }
  if (body.endedAt != null && body.endedAt !== '') {
    const endedAt = new Date(body.endedAt);
    if (Number.isNaN(endedAt.getTime())) {
      return { error: { status: 400, error: 'endedAt is not a valid date.' } };
    }
    const now = Date.now();
    if (endedAt.getTime() > now) {
      return { error: { status: 400, error: 'endedAt cannot be in the future.' } };
    }
    if (session.startedAt && endedAt.getTime() < new Date(session.startedAt).getTime()) {
      return { error: { status: 400, error: 'endedAt cannot be before the session started.' } };
    }
    value.endedAt = endedAt;
  }
  return { value };
}

function applySessionEnd(session, userId, patch = {}) {
  const ownership = sessionOwnerError(session, userId);
  if (ownership) return { error: ownership };
  if (session.endedAt) {
    const updates = {};
    if (session.energyAfter == null && patch.energyAfter != null) {
      updates.energyAfter = patch.energyAfter;
    }
    return { updates, idempotent: true };
  }
  const completedSecs = Number.isFinite(Number(patch.completedSecs))
    ? Math.max(0, Number(patch.completedSecs))
    : (session.completedSecs || 0);
  const updates = {
    endedAt: patch.endedAt ? new Date(patch.endedAt) : new Date(),
    completedSecs,
    completed: patch.completed === true || (session.plannedSecs > 0 && completedSecs >= session.plannedSecs * 0.8),
  };
  if (patch.energyAfter != null) updates.energyAfter = patch.energyAfter;
  return { updates, idempotent: false };
}

function buildRuleSuggestions({
  avgTabSwitches = 0,
  hour = 12,
  energyLevel = 3,
  completionRate = 0.5,
  todayTotal = 0,
  overdueCount = 0,
} = {}) {
  const suggestions = [];
  const reasons = [];

  if (avgTabSwitches > 3) {
    suggestions.push({
      type: 'grounding',
      title: 'Grounding Exercise',
      description: `You've switched tabs ${Math.round(avgTabSwitches)} times recently. A 5-minute grounding exercise can reset your focus.`,
      priority: 0.9,
    });
    reasons.push('Tab switching has been a bit higher in the last hour — a grounding reset can help you land again.');
  }

  if (hour >= 13 && hour <= 16 && energyLevel <= 2) {
    suggestions.push({
      type: 'meditation',
      title: 'Afternoon Reset Meditation',
      description: 'Your energy is low during the afternoon slump. A short meditation can restore focus.',
      priority: 0.8,
    });
    reasons.push('Energy looks low in the afternoon window, so a short meditation is a kind next step.');
  }

  if (completionRate < 0.3 && todayTotal > 2) {
    suggestions.push({
      type: 'breathing',
      title: 'Box Breathing',
      description: "It's been a tough session for completing tasks. Two minutes of box breathing can help you reset.",
      priority: 0.7,
    });
    reasons.push('Today’s list has been slow to finish — box breathing is a small, no-pressure reset.');
  }

  if (overdueCount >= 3 && !suggestions.some((s) => s.type === 'meditation')) {
    suggestions.push({
      type: 'meditation',
      title: 'Gentle Reset Meditation',
      description: 'A few open tasks are waiting. A short meditation can make the next one feel smaller.',
      priority: 0.65,
    });
    reasons.push('A few tasks are past their due time — a brief pause can make the next step feel lighter.');
  }

  if (!suggestions.length && hour >= 8 && hour <= 10) {
    suggestions.push({
      type: 'breathing',
      title: 'Morning Mindfulness Check-in',
      description: 'Start your day with three deep breaths to set a calm, focused intention.',
      priority: 0.5,
    });
    reasons.push('Morning is a good moment for a tiny breathing check-in.');
  }

  suggestions.sort((a, b) => b.priority - a.priority);
  return { suggestions, reasons };
}

function mapMlSuggestions(ml) {
  const raw = [];
  if (ml && ml.top_suggestion) raw.push(ml.top_suggestion);
  if (ml && Array.isArray(ml.all_suggestions)) {
    for (const item of ml.all_suggestions) raw.push(item);
  }
  const seen = new Set();
  const suggestions = [];
  for (const item of raw) {
    if (!item || !ML_TYPES.includes(item.type) || seen.has(item.type + item.title)) continue;
    seen.add(item.type + item.title);
    suggestions.push({
      type: item.type,
      title: item.title,
      description: item.description,
      priority: Number(item.priority) || 0,
    });
  }
  suggestions.sort((a, b) => b.priority - a.priority);
  return suggestions;
}

function typeScoresFromHistory(history = []) {
  const byType = {};
  for (const s of history) {
    if (!s || !s.type || !s.endedAt) continue;
    if (!byType[s.type]) {
      byType[s.type] = { deltas: [], abandon: 0, total: 0, switchDeltas: [] };
    }
    const bucket = byType[s.type];
    bucket.total += 1;
    if (s.energyBefore != null && s.energyAfter != null) {
      bucket.deltas.push(s.energyAfter - s.energyBefore);
    }
    const planned = Number(s.plannedSecs) || 0;
    const done = Number(s.completedSecs) || 0;
    if (planned > 0 && done / planned < 0.5) bucket.abandon += 1;
    if (s.tabSwitchesBefore != null && s.tabSwitchesAfter != null) {
      bucket.switchDeltas.push(s.tabSwitchesAfter - s.tabSwitchesBefore);
    }
  }
  const scores = {};
  for (const [type, data] of Object.entries(byType)) {
    let boost = 0;
    if (data.deltas.length) {
      const avg = data.deltas.reduce((a, b) => a + b, 0) / data.deltas.length;
      boost += avg * 0.15;
    }
    if (data.switchDeltas.length) {
      const avg = data.switchDeltas.reduce((a, b) => a + b, 0) / data.switchDeltas.length;
      if (avg < 0) boost += 0.12;
      else if (avg > 0) boost -= 0.08;
    }
    const abandonRate = data.total ? data.abandon / data.total : 0;
    boost -= abandonRate * 0.2;
    scores[type] = boost;
  }
  return scores;
}

function personalizeSuggestions(suggestions = [], history = []) {
  const scores = typeScoresFromHistory(history);
  const hasSignal = Object.values(scores).some((v) => v !== 0);
  if (!hasSignal) {
    return { suggestions: [...suggestions].sort((a, b) => b.priority - a.priority), personalized: false };
  }
  const ranked = suggestions.map((s) => ({
    ...s,
    priority: Math.max(0, Math.min(1, (s.priority || 0) + (scores[s.type] || 0))),
  })).sort((a, b) => b.priority - a.priority);
  return { suggestions: ranked, personalized: true };
}

function reasonsFromSuggestions(suggestions, source) {
  if (!suggestions.length) return ['No strong signal right now — pick whichever practice feels kindest.'];
  const top = suggestions[0];
  if (source === 'ml-service') {
    return [`Suggested from your recent focus pattern: ${top.title.toLowerCase()}.`];
  }
  return [];
}

async function recommendFromSignals(signals, { fetchMl } = {}) {
  let suggestions = [];
  let source = 'rules';
  let reasons = [];

  try {
    if (typeof fetchMl !== 'function') throw new Error('no ml client');
    const ml = await fetchMl(signals);
    suggestions = mapMlSuggestions(ml);
    if (!suggestions.length) throw new Error('empty ml suggestions');
    source = 'ml-service';
    reasons = reasonsFromSuggestions(suggestions, source);
  } catch {
    const built = buildRuleSuggestions(signals);
    suggestions = built.suggestions;
    reasons = built.reasons.length ? built.reasons : reasonsFromSuggestions(suggestions, 'rules');
    source = 'rules';
  }

  const { suggestions: ranked, personalized } = personalizeSuggestions(suggestions, signals.history || []);
  return {
    top: ranked[0] || null,
    alternatives: ranked.slice(1),
    reasons,
    source,
    personalized,
    stats: signals.stats || {
      avgTabSwitches: signals.avgTabSwitches,
      completionRate: signals.completionRate,
      hour: signals.hour,
    },
  };
}

function toLegacyRecommendation(result) {
  const all = [];
  if (result.top) all.push(result.top);
  for (const item of result.alternatives || []) all.push(item);
  return {
    suggested: !!result.top,
    top: result.top || null,
    all,
    stats: result.stats || {},
  };
}

function attachSwitchDeltas(sessions, events) {
  return sessions.map((s) => {
    const start = new Date(s.startedAt).getTime();
    const end = new Date(s.endedAt || s.startedAt).getTime();
    const before = events.filter((e) => {
      const t = new Date(e.recordedAt).getTime();
      return t >= start - 30 * 60 * 1000 && t < start;
    });
    const after = events.filter((e) => {
      const t = new Date(e.recordedAt).getTime();
      return t > end && t <= end + 30 * 60 * 1000;
    });
    const avg = (list) => (list.length
      ? list.reduce((sum, e) => sum + (e.tabSwitchCount || 0), 0) / list.length
      : null);
    return {
      ...s,
      tabSwitchesBefore: avg(before),
      tabSwitchesAfter: avg(after),
    };
  });
}

module.exports = {
  clampEnergy,
  dayKey,
  addDays,
  computeStreakDays,
  computeSessionStats,
  sessionOwnerError,
  applySessionEnd,
  buildRuleSuggestions,
  mapMlSuggestions,
  typeScoresFromHistory,
  personalizeSuggestions,
  reasonsFromSuggestions,
  recommendFromSignals,
  toLegacyRecommendation,
  attachSwitchDeltas,
  sessionDeleteError,
  parseTzOffsetMins,
  validateStartBody,
  validatePatchBody,
  SESSION_TYPES,
  TRIGGERS,
};
