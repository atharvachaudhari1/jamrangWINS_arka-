const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Task = require('../models/Task');
const { getMindfulnessRecommendation, toLegacyRecommendation, clampEnergy } = require('../services/mindfulnessCoach');

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
// Same response shape as before; ranking now lives in the mindfulness coach.
router.get('/mindfulness', auth, async (req, res) => {
  try {
    const energyLevel = clampEnergy(req.query.energyLevel || '3');
    const result = await getMindfulnessRecommendation(req.userId, { energyLevel });
    res.json(toLegacyRecommendation(result));
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
