const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const TimetableBlock = require('../models/TimetableBlock');
const requireAuth = require('../utils/requireAuth');
const { rankTasks } = require('../ml/priorityModel');
const { historyRates, logShown, logTaskOutcome } = require('../services/recommendationLog');
const {
  clampEnergy,
  eligibleTasks,
  applyFit,
  proposeSmallerStep,
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
  const fitted = applyFit(rankTasks(open, { energyLevel, ...rates }), energyLevel, user?.availableStudyMins);
  const ranked = orderRanked(fitted, user?.pinnedTaskId);
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
  const energyLevel = clampEnergy(req.query.energyLevel || 3);
  const ctx = await loadContext(req.userId, energyLevel);
  if (!ctx.user) return res.status(404).json({ error: 'User not found' });
  if (ctx.ranked.length && !(ctx.user.restUntil && ctx.user.restUntil > new Date())) {
    await logShown({ userId: req.userId, energyLevel, ranked: ctx.ranked });
  }
  res.json(payloadFor(ctx, energyLevel));
});

const ACTIONS = ['do', 'complete', 'smaller', 'change', 'rest', 'ready', 'notnow', 'choose', 'undo'];

router.post('/action', requireAuth, async (req, res) => {
  const action = String(req.body?.action || '');
  const energyLevel = clampEnergy(req.body?.energyLevel || 3);
  if (!ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'Choose Do it, Smaller, Change, Rest, or Not now.' });
  }

  const ctx = await loadContext(req.userId, energyLevel);
  if (!ctx.user) return res.status(404).json({ error: 'User not found' });
  const user = ctx.user;

  async function finish(message, undo = null, extra = {}) {
    const next = await loadContext(req.userId, energyLevel);
    res.json({ ...payloadFor(next, energyLevel), message: message || '', undo, ...extra });
  }

  if (action === 'ready') {
    user.restUntil = null;
    await user.save();
    return finish('Welcome back. One small step is enough.');
  }

  if (action === 'rest') {
    const minutes = Math.max(5, Math.min(120, parseInt(req.body?.minutes, 10) || 20));
    user.restUntil = new Date(Date.now() + minutes * 60 * 1000);
    await user.save();
    return finish(`Rest is part of the plan. Back in about ${minutes} minutes, or sooner if you like.`, { type: 'rest' });
  }

  if (action === 'undo') return undo(req, res, user, finish);

  const taskId = req.body?.taskId;
  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({ error: 'Choose a task first.' });
  }
  const task = await Task.findOne({ _id: taskId, userId: req.userId });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (action === 'do') {
    await logTaskOutcome({ userId: req.userId, type: 'started', task, energyLevel });
    return res.json({ ...payloadFor(ctx, energyLevel), started: true, message: 'Starting this step. It stays open until you mark it done.' });
  }

  if (action === 'complete') {
    task.completed = true;
    task.completedAt = new Date();
    await task.save();
    if (String(user.pinnedTaskId || '') === String(task._id)) user.pinnedTaskId = null;
    await user.save();
    await logTaskOutcome({ userId: req.userId, type: 'completed', task, energyLevel });
    return finish('Marked done. The next suggestion has been updated.', { type: 'complete', taskId: String(task._id) });
  }

  if (action === 'choose') {
    const previousPinned = user.pinnedTaskId ? String(user.pinnedTaskId) : null;
    user.pinnedTaskId = task._id;
    if (task.postponedUntil) {
      task.postponedUntil = null;
      await task.save();
    }
    await user.save();
    return finish(`Showing ${task.title}.`, { type: 'choose', previousPinned });
  }

  if (action === 'smaller') {
    const parent = task.parentTaskId
      ? (await Task.findOne({ _id: task.parentTaskId, userId: req.userId })) || task
      : task;
    const proposal = proposeSmallerStep(parent);
    if (req.body?.preview) {
      return res.json({ proposal, parentId: String(parent._id) });
    }
    const wanted = req.body?.step || proposal;
    const title = String(wanted.title || '').trim();
    const mins = Number(wanted.estimateMins) || proposal.estimateMins;
    if (!title) return res.status(400).json({ error: 'Give the smaller step a name.' });
    if (title.length > 500) return res.status(400).json({ error: 'That step name is too long.' });
    if (mins < 1 || mins > 120) return res.status(400).json({ error: 'A smaller step should take 1 to 120 minutes.' });

    const previousPinned = user.pinnedTaskId ? String(user.pinnedTaskId) : null;
    const existing = await Task.findOne({
      userId: req.userId,
      parentTaskId: parent._id,
      completed: false,
      title: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (existing) {
      user.pinnedTaskId = existing._id;
      await user.save();
      return finish('That step is already on your list, so it is showing now.', { type: 'choose', previousPinned });
    }
    const step = await Task.create({
      userId: req.userId,
      title,
      subject: parent.subject || '',
      kind: parent.kind || 'general',
      priority: parent.priority || 'medium',
      dueAt: parent.dueAt,
      estimateMins: mins,
      importance: parent.importance || 3,
      dreadScore: Math.max(1, (parent.dreadScore || 3) - 1),
      parentTaskId: parent._id,
    });
    user.pinnedTaskId = step._id;
    await user.save();
    return finish('A smaller step is ready. The larger task is still there.', {
      type: 'smaller',
      stepId: String(step._id),
      previousPinned,
    });
  }

  if (action === 'change' || action === 'notnow') {
    const previous = task.postponedUntil ? task.postponedUntil.toISOString() : null;
    const previousPinned = user.pinnedTaskId ? String(user.pinnedTaskId) : null;
    const laterMins = parseInt(req.body?.laterMins, 10);
    if (action === 'change' && Number.isFinite(laterMins)) {
      if (laterMins < 15 || laterMins > 24 * 60) {
        return res.status(400).json({ error: 'Choose a time between 15 minutes and a day from now.' });
      }
      task.postponedUntil = postponeUntil('later', new Date(), task.dueAt, laterMins);
    } else {
      task.postponedUntil = postponeUntil(action, new Date(), task.dueAt);
    }
    await task.save();
    if (String(user.pinnedTaskId || '') === String(task._id)) {
      user.pinnedTaskId = null;
      await user.save();
    }
    await logTaskOutcome({ userId: req.userId, type: 'skipped', task, energyLevel });
    const when = task.postponedUntil.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const message = action === 'notnow'
      ? `Set aside until about ${when}. Nothing is counted against you.`
      : `Moved to about ${when}. Another option is showing now.`;
    return finish(message, { type: action, taskId: String(task._id), previous, previousPinned });
  }

  return res.status(400).json({ error: 'That action is not available.' });
});

async function undo(req, res, user, finish) {
  const info = req.body?.undo || {};
  const validId = (id) => id && mongoose.Types.ObjectId.isValid(id);

  if (info.type === 'rest') {
    user.restUntil = null;
    await user.save();
    return finish('Rest cancelled.');
  }
  if (info.type === 'choose') {
    user.pinnedTaskId = validId(info.previousPinned) ? info.previousPinned : null;
    await user.save();
    return finish('Back to the earlier suggestion.');
  }
  if (info.type === 'complete' && validId(info.taskId)) {
    const task = await Task.findOneAndUpdate(
      { _id: info.taskId, userId: req.userId },
      { completed: false, completedAt: null },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return finish('Reopened. It is back on your list.');
  }
  if ((info.type === 'notnow' || info.type === 'change') && validId(info.taskId)) {
    const previous = info.previous ? new Date(info.previous) : null;
    const task = await Task.findOneAndUpdate(
      { _id: info.taskId, userId: req.userId },
      { postponedUntil: previous && !Number.isNaN(previous.getTime()) ? previous : null },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    user.pinnedTaskId = validId(info.previousPinned) ? info.previousPinned : null;
    await user.save();
    return finish('Brought back.');
  }
  if (info.type === 'smaller' && validId(info.stepId)) {
    await Task.deleteOne({ _id: info.stepId, userId: req.userId, completed: false });
    user.pinnedTaskId = validId(info.previousPinned) ? info.previousPinned : null;
    await user.save();
    return finish('Smaller step removed. The larger task is unchanged.');
  }
  return res.status(400).json({ error: 'There is nothing to undo.' });
}

module.exports = router;
