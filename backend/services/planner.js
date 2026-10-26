const SHAME = /dread|delay|procrastinat|avoid|fail|behind|lazy|should have|streak/i;

const ENERGY_COPY = {
  low: 'You reported low energy, so a shorter step is a better fit.',
  medium: 'You reported medium energy, so this can take a steady block of time.',
  high: 'You reported high energy, so a longer task is a reasonable next step.',
};

// The Low / Medium / High shortcuts map onto the existing 1–5 scale.
const BAND_LEVEL = { low: 2, medium: 3, high: 5 };

function energyBand(level) {
  const n = Number(level) || 3;
  if (n <= 2) return 'low';
  if (n >= 4) return 'high';
  return 'medium';
}

function levelForBand(band) {
  return BAND_LEVEL[band] || 3;
}

function clampEnergy(level) {
  const n = parseInt(level, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, n));
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

// How well a task fits the reported energy and the time the student set aside.
// Deadlines raise a task, but only enough to compete, not to win every time.
function fitScore(task, energyLevel, availableMins, now = new Date()) {
  const band = energyBand(energyLevel);
  const mins = Number(task.estimateMins) || 30;
  let fit = 0;
  if (band === 'low') {
    if (mins <= 20) fit += 0.25;
    else if (mins > 45) fit -= 0.2;
  } else if (band === 'high' && mins >= 30) {
    fit += 0.1;
  }
  const available = Number(availableMins);
  if (available && mins > available) fit -= 0.3;
  if (task.dueAt) {
    const hours = (new Date(task.dueAt) - now) / 36e5;
    if (hours < 0) fit += 0.1;
    else if (hours < 24) fit += 0.2;
    else if (hours < 72) fit += 0.1;
  }
  if (task.priority === 'high') fit += 0.05;
  return fit;
}

function applyFit(ranked, energyLevel, availableMins, now = new Date()) {
  return (ranked || [])
    .map((row) => ({ ...row, fit: fitScore(row.task, energyLevel, availableMins, now) }))
    .sort((a, b) => (b.score + b.fit) - (a.score + a.fit));
}

function explainTask(task, energyLevel, rankReason) {
  if (!task) return '';
  const band = energyBand(energyLevel);
  const bits = [band === 'low' && Number(task.estimateMins) > 45
    ? 'You reported low energy and this is a longer task, so Smaller can turn it into a short first step.'
    : ENERGY_COPY[band]];
  if (task.pinned) bits.unshift('You picked this task.');
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
  if (rankReason && !SHAME.test(rankReason)) bits.push(/[.!?]$/.test(rankReason.trim()) ? rankReason.trim() : `${rankReason.trim()}.`);
  return bits.join(' ');
}

function smallerEstimate(mins) {
  const n = Number(mins) || 30;
  return Math.max(10, Math.min(20, Math.round(n / 2)));
}

const STEP_BY_KIND = {
  reading: (title) => `Read the first section of ${title}`,
  assignment: (title) => `Write a rough outline for ${title}`,
  project: (title) => `List the very next action for ${title}`,
  revision: (title) => `Review one page of notes for ${title}`,
};

// A genuinely smaller step: the first unfinished breakdown step if there is one,
// otherwise a concrete opening move for the task type.
function proposeSmallerStep(task) {
  const open = (task.subtasks || []).find((step) => step && !step.completed && step.title);
  const title = open
    ? open.title
    : (STEP_BY_KIND[task.kind] || ((t) => `Make a first small start on ${t}`))(task.title);
  return {
    title: String(title).slice(0, 500),
    estimateMins: smallerEstimate(task.estimateMins),
  };
}

// "Not now" hides a task for this opportunity. It never moves past the deadline.
function postponeUntil(action, now = new Date(), dueAt = null, laterMins = null) {
  const next = new Date(now);
  if (action === 'notnow') next.setHours(next.getHours() + 3);
  else if (action === 'change') next.setMinutes(next.getMinutes() + 45);
  else if (action === 'later' && Number(laterMins) > 0) next.setMinutes(next.getMinutes() + Number(laterMins));
  else return null;
  if (dueAt) {
    const due = new Date(dueAt);
    const latest = new Date(due.getTime() - 60 * 60 * 1000);
    if (due > now && latest < next) {
      return latest > now ? latest : new Date(now.getTime() + 15 * 60 * 1000);
    }
  }
  return next;
}

function blocksForDay(blocks, now = new Date()) {
  const day = now.getDay();
  const todayKey = now.toDateString();
  return (blocks || [])
    .filter((block) => {
      if (block.date) return new Date(block.date).toDateString() === todayKey;
      return block.dayOfWeek === day;
    })
    .map((block) => ({
      title: block.title,
      start: Number(block.startMinutes),
      end: Number(block.endMinutes),
      source: block.source || 'manual',
    }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .sort((a, b) => a.start - b.start);
}

function currentClass(blocks, now = new Date()) {
  const cursor = now.getHours() * 60 + now.getMinutes();
  return blocksForDay(blocks, now).find((block) => block.start <= cursor && cursor < block.end) || null;
}

// Free time between classes today, from now (or 8am) until 9pm.
function freeSlots(blocks, now = new Date(), { dayStart = 8 * 60, dayEnd = 21 * 60, minLength = 15 } = {}) {
  const cursor = now.getHours() * 60 + now.getMinutes();
  let from = Math.max(cursor, dayStart);
  const slots = [];
  for (const block of blocksForDay(blocks, now)) {
    if (block.end <= from) continue;
    if (block.start - from >= minLength) slots.push({ startMinutes: from, endMinutes: block.start });
    from = Math.max(from, block.end);
  }
  if (dayEnd - from >= minLength) slots.push({ startMinutes: from, endMinutes: dayEnd });
  return slots;
}

function suggestStudySlot(blocks, estimateMins = 25, now = new Date()) {
  const need = Math.max(15, Number(estimateMins) || 25);
  const todayBlocks = blocksForDay(blocks, now);
  const slot = freeSlots(blocks, now).find((s) => s.endMinutes - s.startMinutes >= need);
  if (!slot) return null;
  const before = todayBlocks.some((block) => block.start >= slot.startMinutes + need);
  return {
    startMinutes: slot.startMinutes,
    endMinutes: slot.startMinutes + need,
    reason: !todayBlocks.length
      ? 'No classes are saved for today, so this uses the free time you have left.'
      : before
        ? 'This sits in open time before your next confirmed class.'
        : 'This sits in open time after your confirmed classes.',
  };
}

function overlaps(a, b) {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

// Classes that clash with each other. Dated events only clash on the same date.
function findConflicts(blocks) {
  const conflicts = [];
  const list = blocks || [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const sameDay = a.date && b.date
        ? new Date(a.date).toDateString() === new Date(b.date).toDateString()
        : a.dayOfWeek === b.dayOfWeek;
      if (sameDay && overlaps(a, b)) conflicts.push([a, b]);
    }
  }
  return conflicts;
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
  return [{ ...chosen, task: { ...chosen.task, pinned: true } }, ...ranked.filter((row) => row !== chosen)];
}

function presentTask(task) {
  if (!task) return null;
  return {
    _id: task._id,
    title: task.title,
    description: task.description || '',
    subject: task.subject || '',
    kind: task.kind || 'general',
    dueAt: task.dueAt || null,
    estimateMins: task.estimateMins || null,
    priority: task.priority || 'medium',
    importance: task.importance,
    parentTaskId: task.parentTaskId || null,
    subtasks: (task.subtasks || []).map((step) => ({ title: step.title, completed: !!step.completed })),
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
      inClass: null,
    };
  }

  const withTime = ranked.map((row) => ({
    ...row,
    task: { ...row.task, availableStudyMins },
  }));
  const top = withTime[0];
  const task = top?.task || null;
  // The alternative is the shortest other option, so it is a real lighter choice.
  const others = withTime.slice(1);
  const alt = others.length
    ? others.reduce((best, row) => ((row.task.estimateMins || 30) < (best.task.estimateMins || 30) ? row : best), others[0])
    : null;
  const inClass = currentClass(blocks, now);
  const slot = task ? suggestStudySlot(blocks, task.estimateMins, now) : null;

  let reason = task ? explainTask(task, energyLevel, top.reason) : '';
  if (task && inClass) {
    reason += ` You have ${inClass.title} right now, so this is for after it ends.`;
  }
  if (task && !slot) {
    reason += ' There is no free block left today that fits it, so a smaller step or tomorrow may suit better.';
  }

  return {
    resting: false,
    restUntil: null,
    task: presentTask(task),
    alternative: presentTask(alt?.task),
    options: withTime.slice(0, 8).map((row) => presentTask(row.task)),
    reason: reason.trim(),
    alternativeReason: alt ? explainTask(alt.task, energyLevel, alt.reason) : '',
    suggestedSlot: slot,
    inClass: inClass ? { title: inClass.title, endMinutes: inClass.end } : null,
  };
}

module.exports = {
  energyBand,
  levelForBand,
  clampEnergy,
  isPostponed,
  eligibleTasks,
  importanceForPriority,
  fitScore,
  applyFit,
  explainTask,
  smallerEstimate,
  proposeSmallerStep,
  postponeUntil,
  blocksForDay,
  currentClass,
  freeSlots,
  suggestStudySlot,
  findConflicts,
  rhythmWindows,
  orderRanked,
  presentTask,
  buildToday,
};
