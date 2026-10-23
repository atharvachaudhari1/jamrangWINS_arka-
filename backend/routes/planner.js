const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const TimetableBlock = require('../models/TimetableBlock');
const requireAuth = require('../utils/requireAuth');
const { rankTasks } = require('../ml/priorityModel');
const { historyRates, logShown, logTaskOutcome } = require('../services/recommendationLog');
const {
  eligibleTasks,
  smallerEstimate,
  postponeUntil,
  orderRanked,
  buildToday,
} = require('../services/planner');

const router = express.Router();

async function loadContext(userId, energyLevel) {
  const [user, tasks, blocks, rates] = await Promise.all([
    User.findById(userId),
    Task.find({ userId, completed: false }).lean(),
    TimetableBlock.find({ userId }).lean(),
    historyRates(userId),
  ]);
  const open = eligibleTasks(tasks);
  const ranked = orderRanked(rankTasks(open, { energyLevel, ...rates }), user?.pinnedTaskId);
  return { user, tasks, blocks, ranked, rates };
}

function payloadFor(ctx, energyLevel) {
  return buildToday({
    ranked: ctx.ranked,
    energyLevel,
    blocks: ctx.blocks,
    restingUntil: ctx.user?.restUntil,
    availableStudyMins: ctx.user?.availableStudyMins,
  });
}

router.get('/today', requireAuth, async (req, res) => {
  const energyLevel = parseInt(req.query.energyLevel || '3', 10);
  const ctx = await loadContext(req.userId, energyLevel);
  if (!ctx.user) return res.status(404).json({ error: 'User not found' });
  if (ctx.ranked.length && !(ctx.user.restUntil && ctx.user.restUntil > new Date())) {
    await logShown({ userId: req.userId, energyLevel, ranked: ctx.ranked });
  }
  res.json(payloadFor(ctx, energyLevel));
});

router.post('/action', requireAuth, async (req, res) => {
  const action = String(req.body?.action || '');
  const energyLevel = parseInt(req.body?.energyLevel || '3', 10);
  const allowed = ['do', 'complete', 'smaller', 'change', 'rest', 'ready', 'notnow', 'choose'];
  if (!allowed.includes(action)) {
    return res.status(400).json({ error: 'Choose Do it, Smaller, Change, Rest, or Not now.' });
  }

  const ctx = await loadContext(req.userId, energyLevel);
  if (!ctx.user) return res.status(404).json({ error: 'User not found' });
  const user = ctx.user;

  async function finish(message) {
    const next = await loadContext(req.userId, energyLevel);
    res.json({ ...payloadFor(next, energyLevel), message: message || '' });
  }

  if (action === 'ready') {
    user.restUntil = null;
    await user.save();
    return finish('Welcome back. One small step is enough.');
  }

  if (action === 'rest') {
    user.restUntil = new Date(Date.now() + 20 * 60 * 1000);
    await user.save();
    return finish('Rest is part of the plan.');
  }

  const taskId = req.body?.taskId;
  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({ error: 'Choose a task first.' });
  }
  const task = await Task.findOne({ _id: taskId, userId: req.userId });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (action === 'do') {
    await logTaskOutcome({ userId: req.userId, type: 'started', task, energyLevel });
    return res.json({ ...payloadFor(ctx, energyLevel), started: true, message: 'Starting this step.' });
  }

  if (action === 'complete') {
    task.completed = true;
    task.completedAt = new Date();
    await task.save();
    if (String(user.pinnedTaskId || '') === String(task._id)) user.pinnedTaskId = null;
    await user.save();
    await logTaskOutcome({ userId: req.userId, type: 'completed', task, energyLevel });
    return finish('Marked done. The next suggestion has been updated.');
  }

  if (action === 'choose') {
    user.pinnedTaskId = task._id;
    await user.save();
    return finish(`Showing ${task.title}.`);
  }

  if (action === 'smaller') {
    const parentId = task.parentTaskId || task._id;
    const parent = await Task.findOne({ _id: parentId, userId: req.userId });
    const source = parent || task;
    const existing = await Task.countDocuments({ userId: req.userId, parentTaskId: source._id, completed: false });
    const step = await Task.create({
      userId: req.userId,
      title: `Small step ${existing + 1}: ${source.title}`.slice(0, 500),
      subject: source.subject || '',
      kind: source.kind || 'general',
      priority: source.priority || 'medium',
      dueAt: source.dueAt,
      estimateMins: smallerEstimate(source.estimateMins),
      importance: source.importance || 3,
      dreadScore: Math.max(1, (source.dreadScore || 3) - 1),
      parentTaskId: source._id,
    });
    user.pinnedTaskId = step._id;
    await user.save();
    return finish('A smaller step is ready. The larger task is still there.');
  }

  if (action === 'change' || action === 'notnow') {
    task.postponedUntil = postponeUntil(action);
    await task.save();
    if (String(user.pinnedTaskId || '') === String(task._id)) {
      user.pinnedTaskId = null;
      await user.save();
    }
    await logTaskOutcome({ userId: req.userId, type: 'skipped', task, energyLevel });
    const message = action === 'notnow'
      ? 'Set aside for later. Nothing is counted against you.'
      : 'Another option is ready.';
    return finish(message);
  }

  return res.status(400).json({ error: 'That action is not available.' });
});

module.exports = router;
