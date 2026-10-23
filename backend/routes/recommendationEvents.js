const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Task = require('../models/Task');
const { logTaskOutcome } = require('../services/recommendationLog');

const router = express.Router();
const CLIENT_TYPES = new Set(['started', 'skipped']);

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

router.post('/', auth, async (req, res) => {
  const { type, taskId, energyLevel, wasRecommended } = req.body || {};
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

module.exports = router;
