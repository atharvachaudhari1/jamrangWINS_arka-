const User = require('../models/User');
const Task = require('../models/Task');
const DistractionEvent = require('../models/DistractionEvent');
const EnergyCheckIn = require('../models/EnergyCheckIn');
const MindfulnessSession = require('../models/MindfulnessSession');
const core = require('./mindfulnessCoachCore');

async function fetchMlSuggestions(signals) {
  const base = (process.env.ML_PRIORITY_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('ML_PRIORITY_URL is not set');
  const axios = require('axios');
  const { data } = await axios.post(`${base}/mindfulness-suggest`, {
    avg_distraction_count: signals.avgTabSwitches,
    completion_rate: signals.completionRate,
    energy_level: signals.energyLevel,
    hour: signals.hour,
    stress_score: signals.stressScore,
  }, { timeout: 2000 });
  return data;
}

async function gatherSignals(userId, { energyLevel, now = new Date() } = {}) {
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [user, recentDistractions, todayCompleted, todayTotal, overdueCount, latestCheckIn, latestDistractionEnergy, recentMindful, windowEvents] = await Promise.all([
    User.findById(userId).select('rhythmEnabled').lean(),
    DistractionEvent.find({ userId, recordedAt: { $gte: oneHourAgo } }).lean(),
    Task.countDocuments({ userId, completed: true, completedAt: { $gte: todayStart } }),
    Task.countDocuments({ userId, createdAt: { $gte: todayStart } }),
    Task.countDocuments({ userId, completed: false, dueAt: { $ne: null, $lt: now } }),
    EnergyCheckIn.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    DistractionEvent.findOne({ userId, energyLevel: { $ne: null } }).sort({ recordedAt: -1 }).lean(),
    MindfulnessSession.find({ userId, endedAt: { $ne: null } }).sort({ startedAt: -1 }).limit(40).lean(),
    DistractionEvent.find({
      userId,
      recordedAt: { $gte: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000) },
    }).lean(),
  ]);

  const avgTabSwitches = recentDistractions.length > 0
    ? recentDistractions.reduce((sum, d) => sum + (d.tabSwitchCount || 0), 0) / recentDistractions.length
    : 0;

  let resolvedEnergy = core.clampEnergy(energyLevel, NaN);
  if (!Number.isFinite(resolvedEnergy)) {
    if (user?.rhythmEnabled && latestCheckIn?.level) resolvedEnergy = latestCheckIn.level;
    else if (latestDistractionEnergy?.energyLevel) resolvedEnergy = latestDistractionEnergy.energyLevel;
    else resolvedEnergy = 3;
  }

  const completionRate = todayTotal > 0 ? todayCompleted / todayTotal : 0.5;
  const stressScore = Math.min(1, overdueCount / 5);
  const history = core.attachSwitchDeltas(recentMindful, windowEvents);

  return {
    avgTabSwitches,
    completionRate,
    todayTotal,
    todayCompleted,
    energyLevel: resolvedEnergy,
    hour: now.getHours(),
    overdueCount,
    stressScore,
    history,
    stats: {
      avgTabSwitches: Math.round(avgTabSwitches * 10) / 10,
      completionRate,
      hour: now.getHours(),
    },
  };
}

async function getMindfulnessRecommendation(userId, opts = {}) {
  const signals = await gatherSignals(userId, opts);
  return core.recommendFromSignals(signals, { fetchMl: opts.fetchMl || fetchMlSuggestions });
}

module.exports = {
  ...core,
  fetchMlSuggestions,
  gatherSignals,
  getMindfulnessRecommendation,
};
