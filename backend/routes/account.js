const express = require('express');
const requireAuth = require('../utils/requireAuth');
const User = require('../models/User');
const Task = require('../models/Task');
const TimetableBlock = require('../models/TimetableBlock');
const EnergyCheckIn = require('../models/EnergyCheckIn');
const Subject = require('../models/Subject');
const Subscription = require('../models/Subscription');
const Session = require('../models/Session');
const RecommendationEvent = require('../models/RecommendationEvent');
const Habit = require('../models/Habit');
const DistractionEvent = require('../models/DistractionEvent');
const BlockingRule = require('../models/BlockingRule');

const router = express.Router();

const OWNED = {
  tasks: Task,
  timetable: TimetableBlock,
  energyCheckins: EnergyCheckIn,
  subjects: Subject,
  focusSessions: Session,
  recommendationHistory: RecommendationEvent,
  habits: Habit,
  distractionEvents: DistractionEvent,
  blockingRules: BlockingRule,
};

const STRIP = '-__v -userId';

// Everything Doorway stores for this student, without OAuth tokens or push keys.
router.get('/export', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const integrations = {};
  for (const [name, value] of Object.entries(user.integrations || {})) {
    integrations[name] = {
      connected: Boolean(value?.accessToken || value?.refreshToken),
      connectedAt: value?.connectedAt || null,
      lastSyncedAt: value?.lastSyncedAt || null,
    };
  }
  const data = {};
  for (const [key, Model] of Object.entries(OWNED)) {
    data[key] = await Model.find({ userId: req.userId }).select(STRIP).lean();
  }
  res.set('Content-Disposition', 'attachment; filename="doorway-export.json"');
  res.set('Cache-Control', 'no-store');
  res.json({
    exportedAt: new Date().toISOString(),
    profile: {
      name: user.name,
      email: user.email,
      availableStudyMins: user.availableStudyMins,
      rhythmEnabled: user.rhythmEnabled,
      preferredTheme: user.preferredTheme,
      publicProfile: user.publicProfile || {},
      createdAt: user.createdAt,
    },
    integrations,
    ...data,
  });
});

router.delete('/', requireAuth, async (req, res) => {
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm that your account and data should be removed.' });
  }
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const removed = {};
  for (const [key, Model] of Object.entries({ ...OWNED, pushSubscriptions: Subscription })) {
    const result = await Model.deleteMany({ userId: req.userId });
    removed[key] = result.deletedCount || 0;
  }
  await User.deleteOne({ _id: req.userId });
  res.json({
    ok: true,
    removed,
    note: 'Connected services keep their own permission until you remove Doorway from your Google or Slack account settings.',
  });
});

module.exports = router;
