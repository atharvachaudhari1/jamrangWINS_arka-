const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Task = require('../models/Task');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const { chunkTask, parseBrainDump, breakdownTask, validateSteps } = require('../services/aiService');

const KINDS = ['general', 'assignment', 'project', 'reading', 'revision'];
const PRIORITIES = ['low', 'medium', 'high'];

// Shared validation for create and update. Returns { error } or { value }.
function readTaskFields(body, { partial }) {
  const out = {};
  const { title, dueAt, estimateMins, dreadScore, kind, subject, priority, description } = body || {};
  if (title !== undefined || !partial) {
    if (typeof title !== 'string' || !title.trim()) return { error: partial ? 'Task title cannot be empty' : 'Task title is required' };
    if (title.length > 500) return { error: 'Task title must be 500 characters or fewer' };
    out.title = title.trim();
  }
  if (kind !== undefined) {
    if (!KINDS.includes(kind)) return { error: 'Choose a task type.' };
    out.kind = kind;
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return { error: 'Choose a priority.' };
    out.priority = priority;
    out.importance = importanceForPriority(priority);
  }
  if (subject !== undefined) {
    if (String(subject).length > 120) return { error: 'Subject name is too long.' };
    out.subject = String(subject).trim();
  }
  if (description !== undefined) {
    if (String(description).length > 2000) return { error: 'Notes must be 2000 characters or fewer.' };
    out.description = String(description);
  }
  if (dueAt !== undefined) {
    if (dueAt === null || dueAt === '') out.dueAt = null;
    else {
      const parsed = new Date(dueAt);
      if (Number.isNaN(parsed.getTime())) return { error: 'Deadline is not a valid date.' };
      out.dueAt = parsed;
    }
  }
  if (estimateMins !== undefined && estimateMins !== null && estimateMins !== '') {
    const mins = Number(estimateMins);
    if (!Number.isFinite(mins) || mins < 1 || mins > 24 * 60) {
      return { error: 'Estimated time should be between 1 and 1440 minutes.' };
    }
    out.estimateMins = mins;
  }
  if (dreadScore !== undefined) {
    const d = Number(dreadScore);
    if (!Number.isFinite(d) || d < 1 || d > 5) return { error: 'Difficulty should be from 1 to 5.' };
    out.dreadScore = d;
  }
  return { value: out };
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  const query = { userId: req.userId };
  if (req.query.scope === 'academic') query.kind = { $nin: ['general', null] };
  if (req.query.kind && KINDS.includes(req.query.kind)) query.kind = req.query.kind;
  if (req.query.subject) query.subject = String(req.query.subject).slice(0, 120);
  if (req.query.status === 'open') query.completed = false;
  if (req.query.status === 'done') query.completed = true;
  if (req.query.q) {
    const pattern = new RegExp(escapeRegex(String(req.query.q).slice(0, 100)), 'i');
    query.$or = [{ title: pattern }, { description: pattern }, { subject: pattern }];
  }
  const tasks = await Task.find(query).sort({ dueAt: 1 }).lean();
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
        title: `Start with "${top.title}"`,
        description: top.reason || 'This task fits the energy and time you reported.',
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
        title: `High energy: a good time for "${dreadyTask.title}"`,
        description: 'You reported high energy, so a harder task may feel more manageable now.',
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
        title: `Short task: "${quickTask.title}"`,
        description: 'This takes about 15 minutes, if you want something small.',
        taskId: quickTask._id,
        action: 'complete',
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
  const { error, value } = readTaskFields(req.body, { partial: false });
  if (error) return res.status(400).json({ error });

  const doc = await Task.create({
    userId: req.userId,
    dueAt: null,
    dreadScore: 3,
    kind: 'general',
    subject: '',
    priority: 'medium',
    importance: 1,
    ...value,
  });

  req.app.get('io')?.to(`user:${req.userId}`).emit('task:created', doc);
  res.json({ task: doc });
});

// ─── UPDATE TASK ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }

  const { error, value: update } = readTaskFields(req.body, { partial: true });
  if (error) return res.status(400).json({ error });
  if (req.body?.postponedUntil === null) update.postponedUntil = null;

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

router.put('/:id/reopen', auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { completed: false, completedAt: null },
    { new: true }
  );
  if (!task) return res.status(404).json({ error: 'Task not found' });
  req.app.get('io')?.to(`user:${req.userId}`).emit('task:updated', task);
  res.json({ task });
});

// Suggested steps for review. Nothing is saved until the student confirms.
router.post('/:id/breakdown', auth, aiLimiter, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  const task = await Task.findOne({ _id: req.params.id, userId: req.userId }).lean();
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const result = await breakdownTask(task);
  res.json(result);
});

router.put('/:id/subtasks', auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  const steps = validateSteps(req.body?.steps);
  if (!steps && !(Array.isArray(req.body?.steps) && req.body.steps.length === 0)) {
    return res.status(400).json({ error: 'Add at least two steps, each with a name.' });
  }
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { subtasks: (steps || []).map((step) => ({ title: step.title, estimateMins: step.estimateMins, completed: false })) },
    { new: true }
  );
  if (!task) return res.status(404).json({ error: 'Task not found' });
  req.app.get('io')?.to(`user:${req.userId}`).emit('task:updated', task);
  res.json({ task });
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
