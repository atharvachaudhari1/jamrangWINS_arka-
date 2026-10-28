const express = require('express');
const mongoose = require('mongoose');
const requireAuth = require('../utils/requireAuth');
const DistractionEvent = require('../models/DistractionEvent');
const MindfulnessSession = require('../models/MindfulnessSession');
const NudgeEvent = require('../models/NudgeEvent');
const {
  clampEnergy,
  computeSessionStats,
  applySessionEnd,
  sessionOwnerError,
  sessionDeleteError,
  parseTzOffsetMins,
  validateStartBody,
  validatePatchBody,
} = require('../services/mindfulnessCoachCore');
const {
  NUDGE_BREATHING_SECS,
  resolveConfig,
  evaluateNudge,
  validateNudgeCheckBody,
  validateNudgePatchBody,
  nudgeOwnerError,
  nudgeTransitionError,
  summarizeNudgeEvents,
} = require('../services/nudgePolicyCore');
const { getMindfulnessRecommendation } = require('../services/mindfulnessCoach');

const router = express.Router();

function isId(value) {
  return mongoose.isValidObjectId(value);
}

async function recentDistractionAvg(userId) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const events = await DistractionEvent.find({ userId, recordedAt: { $gte: oneHourAgo } }).lean();
  if (!events.length) return 0;
  return events.reduce((sum, d) => sum + (d.tabSwitchCount || 0), 0) / events.length;
}

router.post('/sessions', requireAuth, async (req, res) => {
  const parsed = validateStartBody(req.body || {});
  if (parsed.error) return res.status(parsed.error.status).json({ error: parsed.error.error });

  const { type, plannedSecs, energyBefore, triggeredBy } = parsed.value;
  let { distractionBefore } = parsed.value;
  if (distractionBefore == null) {
    distractionBefore = await recentDistractionAvg(req.userId);
  }

  const session = await MindfulnessSession.create({
    userId: req.userId,
    type,
    plannedSecs,
    energyBefore,
    distractionBefore,
    triggeredBy,
  });

  res.status(201).json({ session });
});

router.patch('/sessions/:id', requireAuth, async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid session id.' });

  const session = await MindfulnessSession.findById(req.params.id);
  const ownership = sessionOwnerError(session, req.userId);
  if (ownership) return res.status(ownership.status).json({ error: ownership.error });

  const parsed = validatePatchBody(req.body || {}, session);
  if (parsed.error) return res.status(parsed.error.status).json({ error: parsed.error.error });

  const result = applySessionEnd(session, req.userId, parsed.value);
  if (result.error) return res.status(result.error.status).json({ error: result.error.error });

  if (Object.keys(result.updates).length) {
    session.set(result.updates);
    await session.save();
  }

  res.json({ session, idempotent: result.idempotent });
});

router.delete('/sessions/:id', requireAuth, async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid session id.' });

  const session = await MindfulnessSession.findById(req.params.id);
  const blocked = sessionDeleteError(session, req.userId);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  await MindfulnessSession.deleteOne({ _id: session._id, userId: req.userId });
  res.json({ ok: true });
});

router.get('/sessions', requireAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const sessions = await MindfulnessSession.find({ userId: req.userId })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();
  res.json({ sessions });
});

// GET /stats?tzOffsetMins=  — pass new Date().getTimezoneOffset() from the client
// (IST is -330). Missing offset is treated as 0 (UTC calendar days).
router.get('/stats', requireAuth, async (req, res) => {
  const tz = parseTzOffsetMins(req.query.tzOffsetMins);
  if (tz.error) return res.status(tz.error.status).json({ error: tz.error.error });

  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const sessions = await MindfulnessSession.find({
    userId: req.userId,
    startedAt: { $gte: since },
  }).sort({ startedAt: -1 }).lean();

  res.json(computeSessionStats(sessions, { now: new Date(), tzOffsetMins: tz.value }));
});

router.get('/recommendation', requireAuth, async (req, res) => {
  const energyLevel = req.query.energyLevel != null ? clampEnergy(req.query.energyLevel) : undefined;
  const result = await getMindfulnessRecommendation(req.userId, { energyLevel });
  res.json(result);
});

router.post('/nudges/check', requireAuth, async (req, res) => {
  const now = Date.now();
  const parsed = validateNudgeCheckBody(req.body || {}, now);
  if (parsed.error) return res.status(parsed.error.status).json({ error: parsed.error.error });

  const config = resolveConfig(process.env);
  const since = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const history = await NudgeEvent.find({
    userId: req.userId,
    createdAt: { $gte: since },
  }).sort({ createdAt: -1 }).limit(config.historyLimit).lean();

  const decision = evaluateNudge({
    now,
    distractionTimes: parsed.value.distractionTimes,
    focusElapsedSecs: parsed.value.focusElapsedSecs,
    nudgesThisSession: parsed.value.nudgesThisSession,
    energyLevel: parsed.value.energyLevel,
    history,
    config,
  });

  if (!decision.nudge) {
    return res.json({ nudge: false, reason: decision.reason });
  }

  const event = await NudgeEvent.create({
    userId: req.userId,
    outcome: 'shown',
    countInWindow: decision.countInWindow,
    threshold: decision.threshold,
    focusElapsedSecs: parsed.value.focusElapsedSecs,
    energyLevel: parsed.value.energyLevel,
  });

  res.status(201).json({
    nudge: true,
    nudgeId: event._id,
    practice: {
      type: 'breathing',
      title: '1-minute box breathing',
      plannedSecs: NUDGE_BREATHING_SECS,
    },
    message: decision.message,
    reason: decision.reason,
  });
});

router.get('/nudges/summary', requireAuth, async (req, res) => {
  let days = 7;
  if (req.query.days != null && req.query.days !== '') {
    const n = Number(req.query.days);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      return res.status(400).json({ error: 'days must be an integer from 1 to 120.' });
    }
    days = n;
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await NudgeEvent.find({
    userId: req.userId,
    createdAt: { $gte: since },
  }).lean();

  res.json(summarizeNudgeEvents(events, days));
});

router.patch('/nudges/:id', requireAuth, async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid nudge id.' });

  const nudge = await NudgeEvent.findById(req.params.id);
  const ownership = nudgeOwnerError(nudge, req.userId);
  if (ownership) return res.status(ownership.status).json({ error: ownership.error });

  const parsed = validateNudgePatchBody(req.body || {});
  if (parsed.error) return res.status(parsed.error.status).json({ error: parsed.error.error });

  const blocked = nudgeTransitionError(nudge, parsed.value.outcome);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  if (parsed.value.mindfulnessSessionId) {
    const session = await MindfulnessSession.findById(parsed.value.mindfulnessSessionId);
    const sessionOwn = sessionOwnerError(session, req.userId);
    if (sessionOwn) return res.status(sessionOwn.status).json({ error: sessionOwn.error });
    nudge.mindfulnessSessionId = session._id;
  }

  nudge.outcome = parsed.value.outcome;
  nudge.resolvedAt = new Date();
  await nudge.save();
  res.json({ nudge });
});

module.exports = router;
