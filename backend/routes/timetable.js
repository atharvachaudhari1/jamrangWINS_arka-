const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const TimetableBlock = require('../models/TimetableBlock');
const requireAuth = require('../utils/requireAuth');
const gcal = require('../services/gcalService');
const { parseTimetableText, parseClock, dayIndex, reviewImport, mapCalendarEvents } = require('../services/timetableImport');
const { freeSlots, findConflicts } = require('../services/planner');

const router = express.Router();

function readBlock(body) {
  const title = String(body?.title || '').trim();
  const dayOfWeek = dayIndex(body?.dayOfWeek);
  const startMinutes = Number.isFinite(Number(body?.startMinutes)) && body?.startMinutes !== ''
    ? Number(body.startMinutes)
    : parseClock(body?.start);
  const endMinutes = Number.isFinite(Number(body?.endMinutes)) && body?.endMinutes !== ''
    ? Number(body.endMinutes)
    : parseClock(body?.end);
  const location = String(body?.location || '').trim();

  if (!title || dayOfWeek == null || startMinutes == null || endMinutes == null) {
    return { error: 'Add a class name, day, start time, and end time.' };
  }
  if (endMinutes <= startMinutes) return { error: 'The end time needs to be after the start time.' };
  if (startMinutes < 0 || endMinutes > 1440) return { error: 'Times need to be within the day.' };
  if (title.length > 140 || location.length > 140) return { error: 'Class name and location must be 140 characters or fewer.' };
  return { value: { title, location, dayOfWeek, startMinutes, endMinutes } };
}

router.get('/', requireAuth, async (req, res) => {
  const blocks = await TimetableBlock.find({ userId: req.userId }).sort({ dayOfWeek: 1, startMinutes: 1 }).lean();
  const conflicts = findConflicts(blocks).map(([a, b]) => ({ a: String(a._id), b: String(b._id), titles: [a.title, b.title] }));
  res.json({ blocks, conflicts });
});

router.get('/slots', requireAuth, async (req, res) => {
  const blocks = await TimetableBlock.find({ userId: req.userId }).lean();
  res.json({ slots: freeSlots(blocks, new Date()) });
});

router.post('/', requireAuth, async (req, res) => {
  const { error, value } = readBlock(req.body);
  if (error) return res.status(400).json({ error });
  const duplicate = await TimetableBlock.findOne({
    userId: req.userId,
    date: null,
    dayOfWeek: value.dayOfWeek,
    startMinutes: value.startMinutes,
    endMinutes: value.endMinutes,
    title: new RegExp(`^${value.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (duplicate) return res.status(409).json({ error: 'That class is already in your timetable.' });
  const block = await TimetableBlock.create({ userId: req.userId, ...value, source: 'manual' });
  res.json({ block });
});

router.put('/:id', requireAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Class not found.' });
  }
  const { error, value } = readBlock(req.body);
  if (error) return res.status(400).json({ error });
  const block = await TimetableBlock.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    value,
    { new: true, runValidators: true }
  );
  if (!block) return res.status(404).json({ error: 'Class not found.' });
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

// Parses a file and reports what would change. Saves nothing.
router.post('/upload/preview', requireAuth, async (req, res) => {
  const parsed = parseTimetableText(req.body?.text || '');
  if (parsed.error && !parsed.blocks.length) return res.status(400).json({ error: parsed.error, warnings: parsed.warnings });
  const existing = await TimetableBlock.find({ userId: req.userId }).lean();
  res.json({ ...reviewImport(parsed.blocks, existing), warnings: parsed.warnings });
});

// Saves only the confirmed rows. Duplicates are checked again on the server.
router.post('/upload', requireAuth, async (req, res) => {
  let incoming;
  if (Array.isArray(req.body?.blocks)) {
    incoming = [];
    for (const row of req.body.blocks.slice(0, 200)) {
      const { error, value } = readBlock(row);
      if (error) return res.status(400).json({ error });
      incoming.push({ ...value, source: 'manual' });
    }
  } else {
    const parsed = parseTimetableText(req.body?.text || '');
    if (parsed.error && !parsed.blocks.length) return res.status(400).json({ error: parsed.error });
    incoming = parsed.blocks;
  }
  const existing = await TimetableBlock.find({ userId: req.userId }).lean();
  const review = reviewImport(incoming, existing);
  const fresh = review.rows.filter((row) => row.status === 'new').map(({ status, conflictWith, ...block }) => ({ ...block, userId: req.userId }));
  const blocks = fresh.length ? await TimetableBlock.insertMany(fresh) : [];
  res.json({ blocks, skippedDuplicates: review.duplicateCount, conflicts: review.conflictCount });
});

async function calendarToken(user, { force = false } = {}) {
  const gc = user.integrations.gcal;
  if (!force && gc.accessToken) return gc.accessToken;
  if (!gc.refreshToken) {
    const err = new Error('no refresh token');
    err.code = 'reconnect';
    throw err;
  }
  try {
    const token = await gcal.refreshAccessToken(gc.refreshToken);
    user.integrations.gcal.accessToken = token;
    await user.save();
    return token;
  } catch (refreshErr) {
    const err = new Error('refresh failed');
    err.code = 'reconnect';
    err.status = refreshErr.response?.status;
    throw err;
  }
}

router.post('/import-calendar', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user?.integrations?.gcal?.accessToken && !user?.integrations?.gcal?.refreshToken) {
    return res.status(400).json({
      error: 'Google Calendar is not connected. You can add classes manually, or connect Calendar from Integrations.',
    });
  }

  try {
    let token = await calendarToken(user);
    let events;
    try {
      events = await gcal.fetchUpcomingEvents(token);
    } catch (err) {
      if (err.response?.status !== 401) throw err;
      token = await calendarToken(user, { force: true });
      events = await gcal.fetchUpcomingEvents(token);
    }

    const { blocks: mapped, skipped } = mapCalendarEvents(events, req.body?.timeZone);
    const seenIds = [];
    let imported = 0;
    for (const block of mapped) {
      if (block.sourceId) {
        seenIds.push(block.sourceId);
        await TimetableBlock.updateOne(
          { userId: req.userId, source: 'gcal', sourceId: block.sourceId },
          { $set: { ...block, userId: req.userId } },
          { upsert: true }
        );
      } else {
        await TimetableBlock.create({ ...block, userId: req.userId });
      }
      imported += 1;
    }
    // Events that were removed from Google, or have already passed, are cleared.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const removed = await TimetableBlock.deleteMany({
      userId: req.userId,
      source: 'gcal',
      $or: [{ sourceId: { $nin: seenIds }, date: { $gte: startOfToday } }, { date: { $lt: startOfToday } }],
    });

    user.integrations.gcal.lastSyncedAt = new Date();
    await user.save();
    const blocks = await TimetableBlock.find({ userId: req.userId, source: 'gcal' }).sort({ date: 1 }).lean();
    res.json({
      blocks,
      imported,
      skipped,
      removed: removed.deletedCount || 0,
      message: 'Imported events stay separate from tasks you create in Doorway.',
    });
  } catch (err) {
    console.error('[timetable] calendar import failed', err.code || err.response?.status || err.message);
    if (err.code === 'reconnect') {
      return res.status(401).json({ error: 'Google Calendar access has expired or was removed. Reconnect Calendar from Integrations.' });
    }
    res.status(502).json({ error: 'Google Calendar could not be read right now. Try again in a moment.' });
  }
});

module.exports = router;
