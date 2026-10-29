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

router.post('/seed-test-data', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.rhythmEnabled = true;
    await user.save();

    // 1. Subjects
    const subjectNames = [
      'Computer Science',
      'Calculus & Linear Algebra',
      'Human-Computer Interaction',
      'Data Structures & Algorithms',
    ];
    for (const name of subjectNames) {
      await Subject.findOneAndUpdate(
        { userId, name },
        { userId, name },
        { upsert: true, new: true }
      );
    }

    // 2. Dates generator
    const now = new Date();
    const pastDays = (d, h = 14) => {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      dt.setHours(h, Math.floor(Math.random() * 40), 0, 0);
      return dt;
    };
    const futureDays = (d, h = 17) => {
      const dt = new Date(now);
      dt.setDate(dt.getDate() + d);
      dt.setHours(h, 0, 0, 0);
      return dt;
    };

    // 3. Completed and pending tasks
    const completedSeeds = [
      { title: 'Read chapter 3 of Operating Systems', subject: 'Computer Science', estimateMins: 35, dreadScore: 2, completed: true, completedAt: pastDays(0, 11) },
      { title: 'Submit Calculus problem set 2', subject: 'Calculus & Linear Algebra', estimateMins: 45, dreadScore: 4, completed: true, completedAt: pastDays(0, 15) },
      { title: 'Draft wireframes for UX project sprint', subject: 'Human-Computer Interaction', estimateMins: 50, dreadScore: 1, completed: true, completedAt: pastDays(1, 14) },
      { title: 'Implement Binary Search Tree unit tests', subject: 'Data Structures & Algorithms', estimateMins: 40, dreadScore: 3, completed: true, completedAt: pastDays(2, 16) },
      { title: 'Revise lecture 5 linear regression notes', subject: 'Calculus & Linear Algebra', estimateMins: 30, dreadScore: 2, completed: true, completedAt: pastDays(3, 10) },
      { title: 'Review peer code pull requests', subject: 'Computer Science', estimateMins: 25, dreadScore: 1, completed: true, completedAt: pastDays(4, 15) },
      { title: 'Prepare quiz review flashcards', subject: 'Data Structures & Algorithms', estimateMins: 20, dreadScore: 2, completed: true, completedAt: pastDays(5, 12) },
      { title: 'Read research paper on spatial computing', subject: 'Human-Computer Interaction', estimateMins: 45, dreadScore: 3, completed: true, completedAt: pastDays(6, 17) },
    ];

    const pendingSeeds = [
      { title: 'Implement Priority Queue and Graph Search algorithms', subject: 'Data Structures & Algorithms', estimateMins: 45, dreadScore: 3, aiPriority: 'High', dueAt: futureDays(1, 18), completed: false },
      { title: 'Write literature review on spatial computing interfaces', subject: 'Human-Computer Interaction', estimateMins: 60, dreadScore: 4, aiPriority: 'Medium', dueAt: futureDays(3, 23), completed: false },
      { title: 'Complete problem set 4 on Eigenvalues & Diagonalization', subject: 'Calculus & Linear Algebra', estimateMins: 30, dreadScore: 4, aiPriority: 'High', dueAt: futureDays(2, 17), completed: false },
      { title: 'Review Chapter 7 notes for Operating Systems quiz', subject: 'Computer Science', estimateMins: 20, dreadScore: 2, aiPriority: 'Low', dueAt: futureDays(5, 12), completed: false },
      { title: 'Submit draft presentation slides for UX design sprint', subject: 'Human-Computer Interaction', estimateMins: 40, dreadScore: 2, aiPriority: 'Medium', dueAt: futureDays(6, 15), completed: false },
    ];

    await Task.insertMany([...completedSeeds, ...pendingSeeds].map(t => ({ ...t, userId })));

    // 4. Focus Sessions (to power stats and Move Ring)
    const sessionSeeds = [
      { type: 'deep', subject: 'Data Structures & Algorithms', durationMins: 50, startedAt: pastDays(0, 10), completedAt: pastDays(0, 11) },
      { type: 'pomodoro', subject: 'Computer Science', durationMins: 25, startedAt: pastDays(0, 14), completedAt: pastDays(0, 15) },
      { type: 'pomodoro', subject: 'Calculus & Linear Algebra', durationMins: 25, startedAt: pastDays(1, 9), completedAt: pastDays(1, 10) },
      { type: 'deep', subject: 'Human-Computer Interaction', durationMins: 45, startedAt: pastDays(1, 13), completedAt: pastDays(1, 14) },
      { type: 'deep', subject: 'Computer Science', durationMins: 50, startedAt: pastDays(2, 15), completedAt: pastDays(2, 16) },
      { type: 'pomodoro', subject: 'Data Structures & Algorithms', durationMins: 25, startedAt: pastDays(3, 11), completedAt: pastDays(3, 12) },
      { type: 'deep', subject: 'Calculus & Linear Algebra', durationMins: 40, startedAt: pastDays(4, 14), completedAt: pastDays(4, 15) },
      { type: 'pomodoro', subject: 'Human-Computer Interaction', durationMins: 30, startedAt: pastDays(5, 16), completedAt: pastDays(5, 17) },
    ];
    await Session.insertMany(sessionSeeds.map(s => ({ ...s, userId })));

    // 5. Timetable Blocks
    const timetableSeeds = [
      { title: 'Algorithms Lecture', location: 'Hall 304', dayOfWeek: 1, startMinutes: 540, endMinutes: 630 },
      { title: 'HCI Design Studio', location: 'Studio B', dayOfWeek: 1, startMinutes: 660, endMinutes: 750 },
      { title: 'Linear Algebra', location: 'Hall A', dayOfWeek: 2, startMinutes: 600, endMinutes: 690 },
      { title: 'Algorithms Tutorial', location: 'Lab 2', dayOfWeek: 3, startMinutes: 540, endMinutes: 630 },
      { title: 'Operating Systems Seminar', location: 'Room 102', dayOfWeek: 4, startMinutes: 840, endMinutes: 930 },
      { title: 'HCI Capstone Review', location: 'Studio B', dayOfWeek: 5, startMinutes: 660, endMinutes: 750 },
    ];
    for (const block of timetableSeeds) {
      await TimetableBlock.findOneAndUpdate(
        { userId, dayOfWeek: block.dayOfWeek, startMinutes: block.startMinutes },
        { ...block, userId },
        { upsert: true, new: true }
      );
    }

    // 6. Energy Check-ins for Rhythm
    const checkInSeeds = [
      { level: 4, band: 'high', createdAt: pastDays(0, 9) },
      { level: 5, band: 'high', createdAt: pastDays(0, 11) },
      { level: 3, band: 'medium', createdAt: pastDays(0, 14) },
      { level: 4, band: 'high', createdAt: pastDays(0, 16) },
      { level: 2, band: 'low', createdAt: pastDays(0, 20) },
      { level: 4, band: 'high', createdAt: pastDays(1, 10) },
      { level: 3, band: 'medium', createdAt: pastDays(1, 15) },
    ];
    await EnergyCheckIn.insertMany(checkInSeeds.map(c => ({ ...c, userId })));

    // 7. Focus Shield Rules
    await BlockingRule.findOneAndUpdate(
      { userId },
      {
        userId,
        isEnabled: true,
        blockedSites: [
          { value: 'youtube.com', label: 'YouTube', enabled: true },
          { value: 'instagram.com', label: 'Instagram', enabled: true },
          { value: 'twitter.com', label: 'Twitter / X', enabled: true },
          { value: 'reddit.com', label: 'Reddit', enabled: true },
          { value: 'netflix.com', label: 'Netflix', enabled: true },
        ],
        whitelist: [
          { value: 'github.com', label: 'GitHub', enabled: true },
          { value: 'stackoverflow.com', label: 'Stack Overflow', enabled: true },
          { value: 'classroom.google.com', label: 'Google Classroom', enabled: true },
          { value: 'wikipedia.org', label: 'Wikipedia', enabled: true },
        ],
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({
      ok: true,
      message: 'Test data populated successfully across tasks, focus sessions, timetable, rhythm, and focus shield!',
      counts: {
        tasks: completedSeeds.length + pendingSeeds.length,
        sessions: sessionSeeds.length,
        timetable: timetableSeeds.length,
        energyCheckins: checkInSeeds.length,
      },
    });
  } catch (err) {
    console.error('Error seeding test data:', err);
    res.status(500).json({ error: 'Failed to populate test data' });
  }
});

module.exports = router;
