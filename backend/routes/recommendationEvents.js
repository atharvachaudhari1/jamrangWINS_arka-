const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Task = require('../models/Task');
const RecommendationEvent = require('../models/RecommendationEvent');
const { logTaskOutcome } = require('../services/recommendationLog');

const router = express.Router();
const CLIENT_TYPES = new Set(['started', 'skipped']);
const NUDGE_STATES = new Set(['thrashing', 'frozen', 'avoidance', 'depleted']);
const NUDGE_KINDS = new Set(['ambient', 'prompt', 'shrink', 'rest']);
const NUDGE_ACTIONS = new Set(['accepted', 'dismissed', 'ignored']);
const NUDGE_OUTCOMES = new Set(['acted', 'rested', 'dismissed', 'ignored', 'no_change']);
const FORBIDDEN_KEY = /^(url|urls|hostname|hostnames|host|href|pagetitle|pagecontent)$/i;

function containsForbidden(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsForbidden);
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEY.test(key) || containsForbidden(child));
}

function nudgeError(nudge) {
  if (!nudge || typeof nudge !== 'object' || Array.isArray(nudge)) return 'nudge is required';
  if (!NUDGE_STATES.has(nudge.state)) return 'state is not a nudge state';
  if (![1, 2, 3].includes(nudge.level)) return 'level must be 1, 2, or 3';
  if (!NUDGE_KINDS.has(nudge.kind)) return 'kind is not valid';
  if (!NUDGE_ACTIONS.has(nudge.action)) return 'action is not valid';
  if (!NUDGE_OUTCOMES.has(nudge.outcome)) return 'outcome is not valid';
  if (nudge.secondsToAction != null && (!Number.isFinite(Number(nudge.secondsToAction)) || Number(nudge.secondsToAction) < 0)) {
    return 'secondsToAction must be a positive number or null';
  }
  if (nudge.confidence != null && (!Number.isFinite(Number(nudge.confidence)) || Number(nudge.confidence) < 0 || Number(nudge.confidence) > 1)) {
    return 'confidence must be between 0 and 1';
  }
  return null;
}

function nudgeDocument(nudge, at) {
  const seconds = nudge.secondsToAction == null ? null : Math.round(Number(nudge.secondsToAction));
  const confidence = nudge.confidence == null ? null : Number(nudge.confidence);
  return {
    state: nudge.state,
    level: nudge.level,
    kind: nudge.kind,
    action: nudge.action,
    outcome: nudge.outcome,
    secondsToAction: seconds,
    confidence,
    createdAt: Number.isFinite(Number(at)) ? new Date(Number(at)) : undefined,
  };
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).end();
  }
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const ARM_WORDS = {
  ambient: 'a quiet tint helps most',
  prompt: 'a short prompt helps most',
  shrink: 'one small step helps most',
  cowork: 'quiet company helps most',
};

function learningLines(rows) {
  const lines = ['thrashing', 'frozen', 'avoidance'].flatMap((state) => {
    const matching = rows.filter((row) => row.state === state && row.kind);
    if (matching.length < 5) return [];
    const byKind = {};
    matching.forEach((row) => {
      if (!byKind[row.kind]) byKind[row.kind] = { acted: 0, count: 0 };
      byKind[row.kind].count += 1;
      if (row.outcome === 'acted') byKind[row.kind].acted += 1;
    });
    const top = Object.entries(byKind).sort((a, b) => (b[1].acted / b[1].count) - (a[1].acted / a[1].count))[0];
    const phrase = ARM_WORDS[top[0]];
    return phrase ? [`When you're ${state}, ${phrase}`] : [];
  });
  return lines.length ? lines : ['Still learning'];
}

router.get('/insights', auth, async (req, res) => {
  const now = Date.now();
  const since = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
  const events = await RecommendationEvent.find({
    userId: req.userId,
    eventType: 'nudge',
    createdAt: { $gte: since },
  }).sort({ createdAt: -1 }).limit(100).lean();
  const signalEvents = await RecommendationEvent.find({
    userId: req.userId,
    eventType: 'signalSummary',
    createdAt: { $gte: twoWeeksAgo },
  }).lean();
  const rows = events.map((event) => ({
    at: new Date(event.createdAt).getTime(),
    state: event.nudge?.state,
    kind: event.nudge?.kind,
    action: event.nudge?.action,
    outcome: event.nudge?.outcome,
    secondsToAction: event.nudge?.secondsToAction,
  }));
  const shown = rows.length;
  const currentSignals = signalEvents.filter((event) => new Date(`${event.signals.date}T00:00:00`).getTime() >= now - 7 * 24 * 60 * 60 * 1000);
  const previousSignals = signalEvents.filter((event) => !currentSignals.includes(event));
  const signalTotals = (items) => items.reduce((total, event) => {
    const signal = event.signals || {};
    total.days += 1;
    total.observedMinutes += signal.observedMinutes || 0;
    total.idleMinutes += signal.idleMinutes || 0;
    total.switches += signal.switches || 0;
    total.stuckMinutes += (signal.frozenMinutes || 0) + (signal.thrashingMinutes || 0) + (signal.avoidanceMinutes || 0) + (signal.depletedMinutes || 0);
    return total;
  }, { days: 0, observedMinutes: 0, idleMinutes: 0, switches: 0, stuckMinutes: 0 });
  const counts = {};
  rows.forEach((row) => {
    if (!row.state) return;
    counts[row.state] = (counts[row.state] || 0) + 1;
  });
  const ambient = rows.filter((row) => row.kind === 'ambient');
  const prompts = rows.filter((row) => row.kind === 'prompt');
  let line = 'Not enough data yet';
  if (ambient.length >= 5 && prompts.length >= 5) {
    const ambientRate = ambient.filter((row) => row.outcome === 'acted').length / ambient.length;
    const promptRate = prompts.filter((row) => row.outcome === 'acted').length / prompts.length;
    line = promptRate > ambientRate ? 'Prompts help you more than ambient tints' : 'These look similar so far';
  }
  res.json({
    shown,
    signalSummary: { current: signalTotals(currentSignals), previous: signalTotals(previousSignals) },
    startedCount: rows.filter((row) => row.outcome === 'acted').length,
    acceptedPct: percent(rows.filter((row) => row.action === 'accepted').length, shown),
    dismissedPct: percent(rows.filter((row) => row.action === 'dismissed').length, shown),
    ignoredPct: percent(rows.filter((row) => row.action === 'ignored').length, shown),
    medianSecondsToAction: median(rows.map((row) => row.secondsToAction).filter((value) => typeof value === 'number')),
    topState: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    restCompleted: rows.filter((row) => row.outcome === 'rested').length,
    line,
    learning: learningLines(rows),
  });
});

router.post('/', auth, async (req, res) => {
  const body = req.body || {};
  if (containsForbidden(body)) {
    return res.status(400).json({ error: 'That field is not stored' });
  }
  const eventType = body.eventType || 'recommendation';
  if (eventType === 'signalSummary') {
    const signal = body.signals;
    const numericFields = ['observedMinutes', 'idleMinutes', 'switches', 'frozenMinutes', 'thrashingMinutes', 'avoidanceMinutes', 'depletedMinutes'];
    if (!signal || !/^\d{4}-\d{2}-\d{2}$/.test(signal.date || '')
      || numericFields.some((key) => !Number.isInteger(signal[key]) || signal[key] < 0 || signal[key] > (key === 'switches' ? 10000 : 1440))) {
      return res.status(400).json({ error: 'A valid daily signal summary is required' });
    }
    const createdAt = new Date(`${signal.date}T00:00:00`);
    await RecommendationEvent.findOneAndUpdate(
      { userId: req.userId, eventType: 'signalSummary', 'signals.date': signal.date },
      { $set: { userId: req.userId, eventType: 'signalSummary', signals: Object.fromEntries(numericFields.map((key) => [key, signal[key]]).concat([['date', signal.date]])), createdAt } },
      { upsert: true, new: true, runValidators: true },
    );
    return res.json({ ok: true });
  }
  if (eventType === 'nudge') {
    const error = nudgeError(body.nudge);
    if (error) return res.status(400).json({ error });
    const nudge = nudgeDocument(body.nudge, body.at);
    const createdAt = nudge.createdAt;
    delete nudge.createdAt;
    if (createdAt) {
      const existing = await RecommendationEvent.findOne({
        userId: req.userId,
        eventType: 'nudge',
        createdAt,
        'nudge.state': nudge.state,
        'nudge.outcome': nudge.outcome,
      }).lean();
      if (existing) return res.json({ ok: true });
    }
    await RecommendationEvent.create({
      userId: req.userId,
      eventType: 'nudge',
      nudge,
      ...(createdAt ? { createdAt } : {}),
    });
    return res.json({ ok: true });
  }
  if (eventType !== 'recommendation') {
    return res.status(400).json({ error: 'eventType must be recommendation or nudge' });
  }
  const { type, taskId, energyLevel, wasRecommended } = body;
  if (!CLIENT_TYPES.has(type)) {
    return res.status(400).json({ error: 'type must be started or skipped' });
  }
  if (!mongoose.isValidObjectId(taskId)) {
    return res.status(400).json({ error: 'Valid taskId is required' });
  }

  const task = await Task.findOne({ _id: taskId, userId: req.userId }).lean();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await logTaskOutcome({
    userId: req.userId,
    type,
    task,
    energyLevel,
    extra: { wasRecommended: wasRecommended !== false },
  });

  res.json({ ok: true });
});

router.delete('/insights', auth, async (req, res) => {
  await RecommendationEvent.deleteMany({ userId: req.userId, eventType: { $in: ['nudge', 'signalSummary'] } });
  res.json({ ok: true });
});

module.exports = router;
