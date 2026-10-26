const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const EnergyCheckIn = require('../models/EnergyCheckIn');
const requireAuth = require('../utils/requireAuth');
const { energyBand, rhythmWindows } = require('../services/planner');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select('rhythmEnabled');
  if (!user) return res.status(404).json({ error: 'User not found' });
  const checkins = await EnergyCheckIn.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(60).lean();
  const summary = rhythmWindows(checkins);
  res.json({
    enabled: !!user.rhythmEnabled,
    checkins,
    ...summary,
    note: 'This only reflects energy levels you chose to save. It is not a medical assessment or a conclusion about you.',
  });
});

router.put('/', requireAuth, async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ error: 'Choose whether Your Rhythm is on or off.' });
  }
  const user = await User.findByIdAndUpdate(
    req.userId,
    { rhythmEnabled: req.body.enabled },
    { new: true }
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ enabled: user.rhythmEnabled });
});

router.post('/checkins', requireAuth, async (req, res) => {
  const level = parseInt(req.body?.level, 10);
  if (!Number.isFinite(level) || level < 1 || level > 5) {
    return res.status(400).json({ error: 'Energy level must be from 1 to 5.' });
  }
  const user = await User.findById(req.userId).select('rhythmEnabled');
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.rhythmEnabled) return res.json({ saved: false, reason: 'Your Rhythm is off, so this was not saved.' });
  const checkin = await EnergyCheckIn.create({
    userId: req.userId,
    level,
    band: energyBand(level),
  });
  res.json({ saved: true, checkin });
});

function validId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Check-in not found.' });
  next();
}

router.put('/checkins/:id', requireAuth, validId, async (req, res) => {
  const level = parseInt(req.body?.level, 10);
  if (!Number.isFinite(level) || level < 1 || level > 5) {
    return res.status(400).json({ error: 'Energy level must be from 1 to 5.' });
  }
  const createdAt = req.body?.createdAt ? new Date(req.body.createdAt) : null;
  const update = { level, band: energyBand(level) };
  if (createdAt && !Number.isNaN(createdAt.getTime())) update.createdAt = createdAt;
  const checkin = await EnergyCheckIn.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    update,
    { new: true }
  );
  if (!checkin) return res.status(404).json({ error: 'Check-in not found.' });
  res.json({ checkin });
});

router.delete('/checkins/:id', requireAuth, validId, async (req, res) => {
  const checkin = await EnergyCheckIn.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!checkin) return res.status(404).json({ error: 'Check-in not found.' });
  res.json({ ok: true });
});

router.delete('/', requireAuth, async (req, res) => {
  await EnergyCheckIn.deleteMany({ userId: req.userId });
  res.json({ ok: true });
});

module.exports = router;
