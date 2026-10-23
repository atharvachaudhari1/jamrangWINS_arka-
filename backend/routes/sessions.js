const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Session = require('../models/Session');
const DistractionEvent = require('../models/DistractionEvent');
const Task = require('../models/Task');
const { logSessionEnded } = require('../services/recommendationLog');
const jwt = require('jsonwebtoken');

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

// POST /api/sessions — log a completed focus session
router.post('/', auth, async (req, res) => {
  const { type, subject, durationMins, distractionCount, energyLevel, taskId } = req.body;

  const session = await Session.create({
    userId: req.userId,
    type,
    subject,
    durationMins,
    completedAt: new Date(),
  });

  let task = null;
  if (taskId && mongoose.isValidObjectId(taskId)) {
    task = await Task.findOne({ _id: taskId, userId: req.userId }).lean();
  }
  await logSessionEnded({
    userId: req.userId,
    energyLevel,
    task,
    plannedMins: durationMins,
    actualMins: durationMins,
    distractionCount,
  });

  // Persist distraction data if provided
  if (distractionCount != null && distractionCount > 0) {
    const now = new Date();
    await DistractionEvent.create({
      userId: req.userId,
      sessionId: session._id,
      tabSwitchCount: distractionCount,
      sessionType: type || 'pomodoro',
      sessionDurationMins: durationMins,
      energyLevel: energyLevel || null,
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    });
  }

  res.json({ session });
});

// GET /api/sessions — list recent sessions
router.get('/', auth, async (req, res) => {
  const sessions = await Session.find({ userId: req.userId }).sort({ completedAt: -1 }).limit(50);
  res.json({ sessions });
});

// GET /api/sessions/distraction-stats — distraction stats for ML
router.get('/distraction-stats', auth, async (req, res) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await DistractionEvent.find({
    userId: req.userId,
    recordedAt: { $gte: oneDayAgo },
  }).lean();

  const avgTabSwitches = events.length > 0
    ? events.reduce((s, e) => s + (e.tabSwitchCount || 0), 0) / events.length
    : 0;

  res.json({ avgTabSwitches, sessionCount: events.length, events: events.slice(0, 10) });
});

module.exports = router;
