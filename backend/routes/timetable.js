const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const TimetableBlock = require('../models/TimetableBlock');
const requireAuth = require('../utils/requireAuth');
const gcal = require('../services/gcalService');
const { parseTimetableText, parseClock, dayIndex } = require('../services/timetableImport');

const router = express.Router();

function minutesOf(date) {
  return date.getHours() * 60 + date.getMinutes();
}

router.get('/', requireAuth, async (req, res) => {
  const blocks = await TimetableBlock.find({ userId: req.userId }).sort({ dayOfWeek: 1, startMinutes: 1 }).lean();
  res.json({ blocks });
});

router.post('/', requireAuth, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const dayOfWeek = dayIndex(req.body?.dayOfWeek);
  const startMinutes = Number.isFinite(Number(req.body?.startMinutes))
    ? Number(req.body.startMinutes)
    : parseClock(req.body?.start);
  const endMinutes = Number.isFinite(Number(req.body?.endMinutes))
    ? Number(req.body.endMinutes)
    : parseClock(req.body?.end);

  if (!title || dayOfWeek == null || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return res.status(400).json({ error: 'Add a class name, day, start time, and end time.' });
  }

  const block = await TimetableBlock.create({
    userId: req.userId,
    title: title.slice(0, 140),
    dayOfWeek,
    startMinutes,
    endMinutes,
    source: 'manual',
  });
  res.json({ block });
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Class not found.' });
  }
  const block = await TimetableBlock.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!block) return res.status(404).json({ error: 'Class not found.' });
  res.json({ ok: true });
});

router.post('/upload', requireAuth, async (req, res) => {
  const parsed = parseTimetableText(req.body?.text || '');
  if (parsed.error && !parsed.blocks.length) return res.status(400).json({ error: parsed.error });
  const blocks = await TimetableBlock.insertMany(parsed.blocks.map((block) => ({ ...block, userId: req.userId })));
  res.json({ blocks, warnings: parsed.warnings });
});

router.post('/import-calendar', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user?.integrations?.gcal?.accessToken && !user?.integrations?.gcal?.refreshToken) {
    return res.status(400).json({
      error: 'Google Calendar is not connected. You can add classes manually, or connect Calendar from Integrations.',
    });
  }

  let token = user.integrations.gcal.accessToken;
  try {
    if (!token && user.integrations.gcal.refreshToken) {
      token = await gcal.refreshAccessToken(user.integrations.gcal.refreshToken);
      user.integrations.gcal.accessToken = token;
      await user.save();
    }
    const events = await gcal.fetchUpcomingEvents(token);
    const dated = [];
    let skipped = 0;
    for (const event of events) {
      if (!event.start || event.allDay) {
        skipped += 1;
        continue;
      }
      const start = new Date(event.start);
      const end = new Date(event.end || event.start);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        skipped += 1;
        continue;
      }
      dated.push({
        userId: req.userId,
        title: String(event.title || 'Calendar event').slice(0, 140),
        dayOfWeek: start.getDay(),
        startMinutes: minutesOf(start),
        endMinutes: Math.min(1440, minutesOf(end) || minutesOf(start) + 30),
        date: start,
        source: 'gcal',
        sourceId: event.sourceId || null,
      });
    }
    await TimetableBlock.deleteMany({ userId: req.userId, source: 'gcal' });
    const blocks = dated.length ? await TimetableBlock.insertMany(dated) : [];
    res.json({
      blocks,
      imported: blocks.length,
      skipped,
      message: 'Imported events stay separate from tasks you create in Doorway.',
    });
  } catch (err) {
    console.error('[timetable] calendar import failed', err.response?.status || err.message);
    res.status(502).json({ error: 'Google Calendar could not be read. Check that the connection is still authorized.' });
  }
});

module.exports = router;
