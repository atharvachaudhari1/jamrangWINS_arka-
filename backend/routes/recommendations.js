const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Task = require('../models/Task');
const DistractionEvent = require('../models/DistractionEvent');

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

// GET /api/recommendations/mindfulness
// Returns a mindfulness suggestion based on recent distraction patterns
router.get('/mindfulness', auth, async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentDistractions = await DistractionEvent.find({
      userId: req.userId,
      recordedAt: { $gte: oneHourAgo },
    }).lean();

    const avgTabSwitches = recentDistractions.length > 0
      ? recentDistractions.reduce((sum, d) => sum + (d.tabSwitchCount || 0), 0) / recentDistractions.length
      : 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayCompleted, todayTotal] = await Promise.all([
      Task.countDocuments({ userId: req.userId, completed: true, completedAt: { $gte: todayStart } }),
      Task.countDocuments({ userId: req.userId, createdAt: { $gte: todayStart } }),
    ]);

    const completionRate = todayTotal > 0 ? todayCompleted / todayTotal : 0.5;
    const hour = new Date().getHours();
    const energyLevel = parseInt(req.query.energyLevel || '3', 10);

    const suggestions = [];

    if (avgTabSwitches > 3) {
      suggestions.push({
        type: 'grounding',
        title: 'Grounding Exercise',
        description: `You've switched tabs ${Math.round(avgTabSwitches)} times recently. A 5-minute grounding exercise can reset your focus.`,
        priority: 0.9,
      });
    }

    if (hour >= 13 && hour <= 16 && energyLevel <= 2) {
      suggestions.push({
        type: 'meditation',
        title: 'Afternoon Reset Meditation',
        description: 'Your energy is low during the afternoon slump. A short meditation can restore focus.',
        priority: 0.8,
      });
    }

    if (completionRate < 0.3 && todayTotal > 2) {
      suggestions.push({
        type: 'breathing',
        title: 'Box Breathing',
        description: 'It\'s been a tough session for completing tasks. Two minutes of box breathing can help you reset.',
        priority: 0.7,
      });
    }

    if (!suggestions.length && hour >= 8 && hour <= 10) {
      suggestions.push({
        type: 'breathing',
        title: 'Morning Mindfulness Check-in',
        description: 'Start your day with three deep breaths to set a calm, focused intention.',
        priority: 0.5,
      });
    }

    suggestions.sort((a, b) => b.priority - a.priority);

    res.json({
      suggested: suggestions.length > 0,
      top: suggestions[0] || null,
      all: suggestions,
      stats: { avgTabSwitches: Math.round(avgTabSwitches * 10) / 10, completionRate, hour },
    });
  } catch (err) {
    console.error('[recommendations] mindfulness error:', err.message);
    res.status(500).json({ error: 'Failed to generate recommendation' });
  }
});

// GET /api/recommendations/patterns
// Returns personalized behavioral insights from task + session history
router.get('/patterns', auth, async (req, res) => {
  try {
    const completedTasks = await Task.find({
      userId: req.userId,
      completed: true,
    }).sort({ completedAt: -1 }).limit(100).lean();

    if (completedTasks.length < 5) {
      return res.json({ insights: [], message: 'Complete more tasks to unlock personalized insights.' });
    }

    const { getTaskCategory } = require('../ml/priorityModel');

    // Group by category
    const byCategory = {};
    for (const t of completedTasks) {
      const cat = getTaskCategory(t.title);
      if (!byCategory[cat]) byCategory[cat] = { count: 0, lateMins: 0, lateCount: 0 };
      byCategory[cat].count++;
      if (t.dueAt && t.completedAt && new Date(t.completedAt) > new Date(t.dueAt)) {
        byCategory[cat].lateCount++;
      }
    }

    const insights = [];

    // Find most completed category
    const sortedCats = Object.entries(byCategory).sort((a, b) => b[1].count - a[1].count);
    if (sortedCats.length > 0) {
      const [topCat, topData] = sortedCats[0];
      insights.push({
        type: 'strength',
        title: `You excel at ${topCat} tasks`,
        description: `You've completed ${topData.count} ${topCat} tasks — your strongest category.`,
      });
    }

    // Find most procrastinated category
    const procrastinatedCat = Object.entries(byCategory)
      .filter(([, d]) => d.count >= 3)
      .sort((a, b) => (b[1].lateCount / b[1].count) - (a[1].lateCount / a[1].count))[0];

    if (procrastinatedCat && procrastinatedCat[1].lateCount / procrastinatedCat[1].count > 0.4) {
      insights.push({
        type: 'procrastination',
        title: `You often delay ${procrastinatedCat[0]} tasks`,
        description: `${Math.round((procrastinatedCat[1].lateCount / procrastinatedCat[1].count) * 100)}% of your ${procrastinatedCat[0]} tasks are completed late. Try scheduling them in the morning.`,
      });
    }

    // Completion streak insight
    const recentTasks = completedTasks.slice(0, 10);
    const streak = recentTasks.filter((t) => {
      if (!t.dueAt) return true;
      return new Date(t.completedAt) <= new Date(t.dueAt);
    }).length;

    if (streak >= 7) {
      insights.push({
        type: 'streak',
        title: 'On-time streak!',
        description: `${streak} of your last 10 tasks completed on time. You're on a roll!`,
      });
    }

    res.json({ insights, totalAnalyzed: completedTasks.length });
  } catch (err) {
    console.error('[recommendations] patterns error:', err.message);
    res.status(500).json({ error: 'Failed to generate patterns' });
  }
});

module.exports = router;
