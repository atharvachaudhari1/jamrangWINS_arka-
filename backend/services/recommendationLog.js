const Task = require('../models/Task');
const RecommendationEvent = require('../models/RecommendationEvent');
const { getTaskCategory } = require('../ml/priorityModel');

function snapshotTask(task, now = new Date()) {
  if (!task) return {};
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const deadlineDays = due ? (due.getTime() - now.getTime()) / 86400000 : null;
  return {
    taskId: task._id,
    title: task.title || '',
    category: getTaskCategory(task.title || ''),
    dreadScore: task.dreadScore ?? 3,
    importance: task.importance ?? 1,
    estimateMins: task.estimateMins ?? 30,
    deadlineDays: deadlineDays == null ? null : Math.round(deadlineDays * 10) / 10,
    overdue: due ? due < now : false,
  };
}

function contextFields(energyLevel, now = new Date()) {
  const energy = Number(energyLevel);
  const clamped = Number.isFinite(energy)
    ? Math.max(1, Math.min(5, Math.round(energy)))
    : 3;
  return {
    energyLevel: clamped,
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
  };
}

async function logEvent(userId, fields) {
  try {
    await RecommendationEvent.create({ userId, ...fields });
  } catch (err) {
    console.warn('[recommendation-log] write failed:', err.message);
  }
}

async function historyRates(userId) {
  const [completedTasks, totalTasks] = await Promise.all([
    Task.find({ userId, completed: true }).limit(50).lean(),
    Task.countDocuments({ userId }),
  ]);
  const completionRate = totalTasks > 0 ? completedTasks.length / totalTasks : 0.5;
  const lateCount = completedTasks.filter((ct) => (
    ct.completedAt && ct.dueAt && new Date(ct.completedAt) > new Date(ct.dueAt)
  )).length;
  const procrastinationRate = completedTasks.length > 0
    ? lateCount / completedTasks.length
    : 0.3;
  return { completionRate, procrastinationRate };
}

async function logShown({ userId, energyLevel, ranked }) {
  if (!ranked?.length) return;
  const now = new Date();
  const top = ranked[0];
  const snap = snapshotTask(top.task, now);
  await logEvent(userId, {
    type: 'shown',
    ...contextFields(energyLevel, now),
    ...snap,
    category: top.category || snap.category,
    score: top.score,
    reason: top.reason,
    topTaskId: top.task._id,
    rankedTaskIds: ranked.slice(0, 20).map((row) => row.task._id),
  });
}

async function logTaskOutcome({ userId, type, task, energyLevel, extra = {} }) {
  const now = new Date();
  await logEvent(userId, {
    type,
    ...contextFields(energyLevel, now),
    ...snapshotTask(task, now),
    ...extra,
  });
}

async function logSessionEnded({
  userId,
  energyLevel,
  task,
  plannedMins,
  actualMins,
  distractionCount,
}) {
  const now = new Date();
  await logEvent(userId, {
    type: 'session_ended',
    ...contextFields(energyLevel, now),
    ...snapshotTask(task, now),
    plannedMins: plannedMins ?? null,
    actualMins: actualMins ?? null,
    minutesSpent: actualMins ?? null,
    distractionCount: distractionCount ?? 0,
  });
}

module.exports = {
  snapshotTask,
  contextFields,
  historyRates,
  logShown,
  logTaskOutcome,
  logSessionEnded,
};
