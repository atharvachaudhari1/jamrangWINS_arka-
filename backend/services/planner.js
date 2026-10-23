const SHAME = /dread|delay|procrastinat|avoid|fail|behind|lazy|should have|streak/i;

const ENERGY_COPY = {
  low: 'You reported low energy, so a shorter step is a better fit.',
  medium: 'You reported medium energy, so this can take a steady block of time.',
  high: 'You reported high energy, so a longer task is a reasonable next step.',
};

function energyBand(level) {
  const n = Number(level) || 3;
  if (n <= 2) return 'low';
  if (n >= 4) return 'high';
  return 'medium';
}

function isPostponed(task, now = new Date()) {
  if (!task?.postponedUntil) return false;
  return new Date(task.postponedUntil) > now;
}

function eligibleTasks(tasks, now = new Date()) {
  return (tasks || []).filter((task) => !task.completed && !isPostponed(task, now));
}

function importanceForPriority(priority) {
  if (priority === 'high') return 5;
  if (priority === 'low') return 1;
  return 3;
}

function explainTask(task, energyLevel, rankReason) {
  if (!task) return '';
  const bits = [ENERGY_COPY[energyBand(energyLevel)]];
  if (task.subject) bits.push(`Subject: ${task.subject}.`);
  if (task.dueAt) {
    const hours = (new Date(task.dueAt) - new Date()) / 36e5;
    if (hours < 0) bits.push('The deadline has passed. It can still be one small step.');
    else if (hours < 24) bits.push('The deadline is within a day.');
    else bits.push(`Deadline ${new Date(task.dueAt).toLocaleDateString()}.`);
  }
  if (task.estimateMins) bits.push(`About ${task.estimateMins} minutes.`);
  const available = Number(task.availableStudyMins);
  if (available && task.estimateMins && task.estimateMins > available) {
    bits.push(`This is longer than the ${available} minutes you set aside, so a smaller step is available.`);
  }
  if (rankReason && !SHAME.test(rankReason)) bits.push(rankReason);
  return bits.join(' ');
}

function smallerEstimate(mins) {
  const n = Number(mins) || 30;
  return Math.max(10, Math.min(20, Math.round(n / 2)));
}

function postponeUntil(action, now = new Date()) {
  const next = new Date(now);
  if (action === 'notnow') {
    next.setHours(next.getHours() + 3);
    return next;
  }
  if (action === 'change') {
    next.setMinutes(next.getMinutes() + 45);
    return next;
  }
  return null;
}

function suggestStudySlot(blocks, estimateMins = 25, now = new Date()) {
  const day = now.getDay();
  const todayKey = now.toDateString();
  const todayBlocks = (blocks || [])
    .filter((block) => {
      if (block.date) return new Date(block.date).toDateString() === todayKey;
      return block.dayOfWeek === day;
    })
    .map((block) => ({
      start: Number(block.startMinutes),
      end: Number(block.endMinutes),
    }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .sort((a, b) => a.start - b.start);

  const cursor = now.getHours() * 60 + now.getMinutes();
  const dayEnd = 21 * 60;
  const need = Math.max(15, Number(estimateMins) || 25);
  let from = Math.max(cursor, 8 * 60);

  for (const block of todayBlocks) {
    if (block.end <= from) continue;
    if (block.start - from >= need) {
      return {
        startMinutes: from,
        endMinutes: from + need,
        reason: 'This sits in open time before your next confirmed class.',
      };
    }
    from = Math.max(from, block.end);
  }

  if (dayEnd - from >= need) {
    return {
      startMinutes: from,
      endMinutes: from + need,
      reason: todayBlocks.length
        ? 'This sits in open time after your confirmed classes.'
        : 'No classes are saved for today, so this uses the free time you have left.',
    };
  }
  return null;
}

function rhythmWindows(checkins) {
  const byHour = {};
  for (const checkin of checkins || []) {
    const hour = new Date(checkin.createdAt).getHours();
    if (!byHour[hour]) byHour[hour] = [];
    byHour[hour].push(Number(checkin.level) || 3);
  }
  const windows = Object.entries(byHour)
    .map(([hour, levels]) => {
      const avg = levels.reduce((sum, level) => sum + level, 0) / levels.length;
      return {
        hour: Number(hour),
        count: levels.length,
        averageLevel: Math.round(avg * 10) / 10,
        band: energyBand(avg),
      };
    })
    .sort((a, b) => a.hour - b.hour);

  return {
    windows,
    suggested: windows.filter((window) => window.averageLevel >= 3),
    enough: (checkins || []).length >= 3,
  };
}

function orderRanked(ranked, pinnedTaskId) {
  if (!pinnedTaskId) return ranked;
  const pin = String(pinnedTaskId);
  const chosen = ranked.find((row) => String(row.task._id) === pin);
  if (!chosen) return ranked;
  return [chosen, ...ranked.filter((row) => row !== chosen)];
}

function presentTask(task) {
  if (!task) return null;
  return {
    _id: task._id,
    title: task.title,
    subject: task.subject || '',
    kind: task.kind || 'general',
    dueAt: task.dueAt || null,
    estimateMins: task.estimateMins || null,
    priority: task.priority || 'medium',
    importance: task.importance,
    parentTaskId: task.parentTaskId || null,
    meta: task.meta || null,
  };
}

function buildToday({ ranked = [], energyLevel = 3, blocks = [], restingUntil = null, availableStudyMins = null, now = new Date() }) {
  if (restingUntil && new Date(restingUntil) > now) {
    return {
      resting: true,
      restUntil: restingUntil,
      task: null,
      alternative: null,
      options: [],
      reason: 'Rest is part of the plan. Come back whenever you are ready.',
      alternativeReason: '',
      suggestedSlot: null,
    };
  }

  const withTime = ranked.map((row) => ({
    ...row,
    task: { ...row.task, availableStudyMins },
  }));
  const top = withTime[0];
  const alt = withTime[1];
  const task = top?.task || null;

  return {
    resting: false,
    restUntil: null,
    task: presentTask(task),
    alternative: presentTask(alt?.task),
    options: withTime.slice(0, 8).map((row) => presentTask(row.task)),
    reason: task ? explainTask(task, energyLevel, top.reason) : '',
    alternativeReason: alt ? explainTask(alt.task, energyLevel, alt.reason) : '',
    suggestedSlot: task ? suggestStudySlot(blocks, task.estimateMins, now) : null,
  };
}

module.exports = {
  energyBand,
  eligibleTasks,
  importanceForPriority,
  explainTask,
  smallerEstimate,
  postponeUntil,
  suggestStudySlot,
  rhythmWindows,
  orderRanked,
  buildToday,
};
