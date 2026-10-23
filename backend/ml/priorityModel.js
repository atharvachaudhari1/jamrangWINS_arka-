// Categories reflect how an ADHD brain experiences a task, not just its topic.
const CATEGORY_KEYWORDS = {
  // Short, low-friction tasks — great for building momentum when dysregulated
  quick_win:            ['reply', 'confirm', 'check', 'pay', 'click', 'send', 'approve', 'remind', 'ping', 'rsvp', 'update', 'upload', 'download', 'print', 'sign'],
  // Requires sustained attention — only realistic during genuine focus windows
  deep_focus:           ['write', 'code', 'design', 'build', 'develop', 'program', 'draft', 'create', 'brainstorm', 'sketch', 'compose', 'architect', 'plan', 'analyze', 'debug'],
  // Benefits from a structured environment or body-doubling to sustain attention
  body_double_friendly: ['read', 'study', 'learn', 'research', 'watch', 'listen', 'understand', 'explore', 'review', 'course', 'practice', 'revise'],
  // Multi-step bureaucratic tasks ADHD people classically avoid initiating
  high_initiation:      ['form', 'tax', 'invoice', 'register', 'submit', 'file', 'report', 'document', 'apply', 'renew', 'insurance', 'appointment', 'book', 'schedule', 'fill'],
  // Movement tasks that regulate the ADHD nervous system
  physical_reset:       ['clean', 'exercise', 'walk', 'gym', 'organize', 'move', 'stretch', 'tidy', 'workout', 'run', 'setup', 'install', 'fix', 'repair', 'buy', 'pick', 'drop'],
  // Tasks with another person — external accountability helps ADHD follow-through
  social_accountability:['meet', 'call', 'discuss', 'present', 'interview', 'talk', 'chat', 'feedback', 'collaborate', 'pair', 'zoom', 'standup', 'sync'],
  // Repetitive low-stimulation tasks — tedious but necessary
  routine:              ['email', 'respond', 'follow', 'log', 'track', 'enter', 'copy', 'sort', 'label', 'tag', 'backup', 'archive', 'record'],
};

// Energy level → category preference (0–1 match score).
// Low energy (1–2): quick wins and movement to regulate; avoid high-initiation.
// Medium energy (3): routine and social tasks with external structure.
// High energy (4–5): deep focus and high-initiation tasks — rare windows, use them.
const ENERGY_CATEGORY_MATCH = {
  1: { quick_win: 1.0, physical_reset: 0.8, routine: 0.5, body_double_friendly: 0.4, social_accountability: 0.3, deep_focus: 0.1, high_initiation: 0.1 },
  2: { quick_win: 0.9, physical_reset: 0.8, routine: 0.6, body_double_friendly: 0.5, social_accountability: 0.4, deep_focus: 0.2, high_initiation: 0.2 },
  3: { quick_win: 0.7, physical_reset: 0.6, routine: 0.8, body_double_friendly: 0.8, social_accountability: 0.8, deep_focus: 0.5, high_initiation: 0.4 },
  4: { quick_win: 0.5, physical_reset: 0.5, routine: 0.6, body_double_friendly: 0.8, social_accountability: 0.7, deep_focus: 0.9, high_initiation: 0.8 },
  5: { quick_win: 0.4, physical_reset: 0.4, routine: 0.5, body_double_friendly: 0.7, social_accountability: 0.7, deep_focus: 1.0, high_initiation: 1.0 },
};

function getTaskCategory(title = '') {
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'high_initiation';
}

function getCategoryEnergyMatch(title, energyLevel) {
  const cat = getTaskCategory(title);
  const level = Math.round(Math.max(1, Math.min(5, energyLevel || 3)));
  const prefs = ENERGY_CATEGORY_MATCH[level] || ENERGY_CATEGORY_MATCH[3];
  return prefs[cat] || 0.5;
}

function getTimeOfDayFit() {
  const hour = new Date().getHours();
  if (hour >= 9 && hour <= 11) return 0.9;   // morning peak
  if (hour >= 14 && hour <= 16) return 0.4;  // afternoon slump
  if (hour >= 20) return 0.3;                // evening
  return 0.65;
}

function predictPriority(f) {
  const {
    deadline_days = 30,
    estimated_time = 30,
    urgency_self = 1,
    completion_rate = 0.5,
    historical_procrastination_rate = 0.3,
    energy_level,
    dread_score,
    title,
  } = f;

  const urgency = Math.exp(-Math.max(0, deadline_days) / 10);
  const effort = Math.min(1, (estimated_time || 30) / 120);

  let categoryMatch = 0.5;
  if (energy_level && title) {
    categoryMatch = getCategoryEnergyMatch(title, energy_level);
  }

  let dreadEnergyFit = 0.5;
  if (dread_score != null && energy_level) {
    const dreadNorm = dread_score / 5;
    const energyNorm = energy_level / 5;
    dreadEnergyFit = 1.0 - Math.abs(dreadNorm - energyNorm) * 0.8;
  }

  const timeOfDayFit = getTimeOfDayFit();
  const effortBonus = energy_level <= 2 ? (1 - effort) : 0.5;

  const category = getTaskCategory(title || '');
  // High-initiation tasks get a strong boost at peak energy — that's the only realistic window
  const highInitiationBoost = (category === 'high_initiation' && energy_level >= 4) ? 0.15 : 0;

  const score =
    urgency * 0.30 +
    (Math.min(5, urgency_self) / 5) * 0.20 +
    categoryMatch * 0.15 +
    dreadEnergyFit * 0.15 +
    effortBonus * 0.10 +
    timeOfDayFit * 0.10 +
    highInitiationBoost;

  const clampedScore = Math.max(0, Math.min(1, score));

  let priority = 'Medium';
  if (clampedScore > 0.65) priority = 'High';
  else if (clampedScore < 0.35) priority = 'Low';

  let reason = 'Steady task — good to keep moving';
  if (urgency > 0.7) reason = 'Deadline is approaching — time to act';
  else if (category === 'high_initiation' && energy_level >= 4) reason = 'High-energy window — ideal time for tasks you usually avoid';
  else if (category === 'quick_win' && energy_level <= 2) reason = 'Low energy right now — this quick win can help build momentum';
  else if (categoryMatch > 0.8) reason = 'This task type fits your current energy well';
  else if (dreadEnergyFit > 0.75) reason = 'Your energy is right for how difficult this feels';
  else if (urgency_self >= 4) reason = 'You marked this as high importance';
  else if (historical_procrastination_rate > 0.5) reason = 'You tend to delay this type — tackling it now while energy is good';

  return {
    score: clampedScore,
    priority,
    reason,
    category,
  };
}

function rankTasks(tasks, {
  energyLevel = 3,
  completionRate = 0.5,
  procrastinationRate = 0.3,
} = {}) {
  const ranked = (tasks || []).map((task) => {
    const deadlineDays = task.dueAt
      ? (new Date(task.dueAt) - new Date()) / (1000 * 60 * 60 * 24)
      : 30;
    const result = predictPriority({
      completion_rate: completionRate,
      deadline_days: Math.max(deadlineDays, 0),
      estimated_time: task.estimateMins || 30,
      urgency_self: task.importance || 1,
      historical_procrastination_rate: procrastinationRate,
      energy_level: energyLevel,
      dread_score: task.dreadScore || 3,
      title: task.title,
    });
    return { task, ...result };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

module.exports = { predictPriority, getTaskCategory, getCategoryEnergyMatch, rankTasks };
