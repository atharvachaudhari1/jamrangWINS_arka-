const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Task = require('../models/Task');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const { chunkTask, parseBrainDump } = require('../services/aiService');

// Rate limit AI-powered endpoints: 20 requests per hour per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again later' },
});


const { rankTasks } = require('../ml/priorityModel');
const { eligibleTasks, importanceForPriority } = require('../services/planner');
const { historyRates, logShown, logTaskOutcome } = require('../services/recommendationLog');

// ─── AUTH MIDDLEWARE ────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  if (!token) return res.status(401).end();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).end();
  }
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─── LIST TASKS ─────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  let tasks = await Task.find({ userId: req.userId }).sort({ dueAt: 1 }).lean();
  if (req.query.scope === 'academic') {
    tasks = tasks.filter((task) => task.kind && task.kind !== 'general');
  }
  const energyLevel = parseInt(req.query.energyLevel, 10);
  if (!Number.isFinite(energyLevel)) {
    return res.json({ tasks });
  }

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const rates = await historyRates(req.userId);
  const ranked = rankTasks(open, { energyLevel, ...rates });
  res.json({ tasks: [...ranked.map((row) => row.task), ...done] });
});

// ─── WHAT NEXT ──────────────────────────────────────────────────────
router.get('/what-next', auth, async (req, res) => {
  const energyLevel = parseInt(req.query.energyLevel || '3', 10);

  const tasks = eligibleTasks(await Task.find({ userId: req.userId, completed: false }).lean());
  if (!tasks.length) return res.json({ task: null });

  const rates = await historyRates(req.userId);
  const ranked = rankTasks(tasks, { energyLevel, ...rates });
  await logShown({ userId: req.userId, energyLevel, ranked });
  const top = ranked[0];

  res.json({ task: top.task, reason: top.reason, category: top.category });
});

// ─── AI SUGGESTIONS ─────────────────────────────────────────────────
router.get('/ai/suggestions', auth, async (req, res) => {
  try {
    const tasks = await Task.find({
      userId: req.userId,
      completed: false,
    }).sort({ dueAt: 1 });

    if (tasks.length === 0) {
      return res.json({ suggestions: [] });
    }

    const suggestions = [];
    const energyLevel = parseInt(req.query.energyLevel || '3', 10);
    const rates = await historyRates(req.userId);
    const rankedRows = rankTasks(tasks, { energyLevel, ...rates });
    await logShown({ userId: req.userId, energyLevel, ranked: rankedRows });

    const ranked = rankedRows.map((row) => ({
      taskId: row.task._id,
      title: row.task.title,
      priority: row.priority,
      score: row.score,
      reason: row.reason,
      category: row.category,
    }));

    if (ranked.length > 0) {
      const top = ranked[0];
      suggestions.push({
        id: 'priority_' + Date.now(),
        type: 'priority',
        title: `🎯 Start with "${top.title}"`,
        description: top.reason || 'This task fits your current situation and should be your top priority.',
        taskId: top.taskId,
        action: 'prioritize',
        category: top.category,
      });
    }

    // Energy-aware nudge: high-dread tasks at high energy
    if (energyLevel >= 4) {
      const dreadyTask = tasks.filter((t) => (t.dreadScore || 3) >= 4).sort((a, b) => (b.dreadScore || 3) - (a.dreadScore || 3))[0];
      if (dreadyTask && dreadyTask._id.toString() !== (ranked[0]?.taskId?.toString())) {
        suggestions.push({
          id: 'energy_' + Date.now(),
          type: 'nudge',
          title: `💪 High energy: tackle "${dreadyTask.title}"`,
          description: 'Your energy is high — perfect time to face this challenging task before it drains you.',
          taskId: dreadyTask._id,
          action: 'prioritize',
          category: 'high-dread',
        });
      }
    }

    const quickTask = tasks.find((t) => (t.estimateMins || 30) <= 15);
    if (quickTask) {
      suggestions.push({
        id: 'quick_' + Date.now(),
        type: 'quick-win',
        title: `⚡ Quick win: "${quickTask.title}"`,
        description: 'Finish this in ~15 minutes to build momentum.',
        taskId: quickTask._id,
        action: 'complete',
      });
    }

    // Procrastination alert
    if (rates.procrastinationRate > 0.5 && ranked.length > 0) {
      suggestions.push({
        id: 'proc_' + Date.now(),
        type: 'nudge',
        title: '⏰ Pattern detected',
        description: `You complete ${Math.round(rates.procrastinationRate * 100)}% of tasks late. Try the 2-minute rule: if it takes less than 2 minutes, do it now.`,
        action: 'none',
      });
    }

    res.json({ suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// ─── BRAIN DUMP ──────────────────────────────────────────────────────
router.post('/brain-dump', auth, aiLimiter, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'No text provided' });
    if (text.length > 5000) return res.status(400).json({ error: 'Brain dump text must be 5000 characters or fewer' });

    const suggestions = await parseBrainDump(text);

    if (!suggestions.length) {
      return res.status(422).json({ error: 'No actionable tasks found' });
    }

    const tasks = [];

    for (const item of suggestions) {
      const task = await Task.create({
        userId: req.userId,
        title: item.title,
        dueAt: item.dueAt ? new Date(item.dueAt) : null,
        estimateMins: item.estimateMins ?? 30,
        dreadScore: item.dreadScore ?? 3,
        importance: item.importance ?? 3,
      });

      tasks.push(task);
    }

    req.app.get('io')?.to(`user:${req.userId}`).emit('tasks:refetch');
    res.json({ tasks, source: process.env.OPENAI_API_KEY ? 'openai' : 'fallback' });

  } catch (err) {
    console.error("BRAIN DUMP ERROR:", err);
    res.status(500).json({ error: "Failed to process brain dump" });
  }
});

// ─── GET TASK ───────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }

  const t = await Task.findOne({ _id: req.params.id, userId: req.userId });
  if (!t) return res.status(404).json({ error: 'Task not found' });
  res.json({ task: t });
});

// ─── CREATE TASK ────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { title, dueAt, estimateMins, dreadScore, kind, subject, priority } = req.body;
  const kinds = ['general', 'assignment', 'project', 'reading', 'revision'];
  const priorities = ['low', 'medium', 'high'];

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  if (title.length > 500) {
    return res.status(400).json({ error: 'Task title must be 500 characters or fewer' });
  }
  if (kind && !kinds.includes(kind)) return res.status(400).json({ error: 'Choose a task type.' });
  if (priority && !priorities.includes(priority)) return res.status(400).json({ error: 'Choose a priority.' });
  if (subject && String(subject).length > 120) return res.status(400).json({ error: 'Subject name is too long.' });

  let parsedDue = null;
  if (dueAt) {
    parsedDue = new Date(dueAt);
    if (Number.isNaN(parsedDue.getTime())) return res.status(400).json({ error: 'Deadline is not a valid date.' });
  }
  const mins = estimateMins == null || estimateMins === '' ? undefined : Number(estimateMins);
  if (mins != null && (!Number.isFinite(mins) || mins < 1 || mins > 24 * 60)) {
    return res.status(400).json({ error: 'Estimated time should be between 1 and 1440 minutes.' });
  }

  const doc = await Task.create({
    userId: req.userId,
    title: title.trim(),
    dueAt: parsedDue,
    estimateMins: mins,
    dreadScore: dreadScore || 3,
    kind: kind || 'general',
    subject: subject ? String(subject).trim() : '',
    priority: priority || 'medium',
    importance: priority ? importanceForPriority(priority) : 1,
  });

  req.app.get('io')?.to(`user:${req.userId}`).emit('task:created', doc);
  res.json({ task: doc });
});

// ─── UPDATE TASK ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }

  const { title, dueAt, estimateMins, dreadScore, kind, subject, priority } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Task title cannot be empty' });
    }
    if (title.length > 500) {
      return res.status(400).json({ error: 'Task title must be 500 characters or fewer' });
    }
  }

  const update = {};
  if (title !== undefined) update.title = title.trim();
  if (dueAt !== undefined) update.dueAt = dueAt ? new Date(dueAt) : null;
  if (estimateMins !== undefined) update.estimateMins = estimateMins;
  if (dreadScore !== undefined) update.dreadScore = dreadScore;
  if (kind !== undefined) update.kind = kind;
  if (subject !== undefined) update.subject = String(subject).trim().slice(0, 120);
  if (priority !== undefined) {
    update.priority = priority;
    update.importance = importanceForPriority(priority);
  }

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    update,
    { new: true }
  );

  if (!task) return res.status(404).json({ error: 'Task not found' });

  req.app.get('io')?.to(`user:${req.userId}`).emit('task:updated', task);
  res.json({ task });
});

// ─── COMPLETE TASK ──────────────────────────────────────────────────
router.put('/:id/complete', auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { completed: true, completedAt: new Date() },
    { new: true }
  );

  if (!task) return res.status(404).json({ error: 'Task not found' });

  await logTaskOutcome({
    userId: req.userId,
    type: 'completed',
    task,
    energyLevel: req.body?.energyLevel,
  });

  req.app.get('io')?.to(`user:${req.userId}`).emit('task:updated', task);
  res.json({ ok: true });
});

router.delete('/:id', auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true });
});


router.post('/:id/auto-chunk', auth, aiLimiter, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }

    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ error: 'not found' });

    const steps = await chunkTask(task.title);

    task.subtasks = steps.map(s => ({
      title: s,
      completed: false,
    }));

    await task.save();

    req.app.get('io')?.to(`user:${req.userId}`).emit('task:updated', task);
    res.json({ task });

  } catch (err) {
    console.error("AI CHUNK ERROR:", err);
    res.status(500).json({ error: "AI failed" });
  }
});

module.exports = router;
