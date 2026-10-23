const express = require('express');
const Subject = require('../models/Subject');
const requireAuth = require('../utils/requireAuth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const subjects = await Subject.find({ userId: req.userId }).sort({ name: 1 }).lean();
  res.json({ subjects });
});

router.post('/', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Subject name is required.' });
  if (name.length > 120) return res.status(400).json({ error: 'Subject name is too long.' });
  const existing = await Subject.findOne({ userId: req.userId, name });
  if (existing) return res.json({ subject: existing });
  const subject = await Subject.create({ userId: req.userId, name });
  res.json({ subject });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const subject = await Subject.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!subject) return res.status(404).json({ error: 'Subject not found.' });
  res.json({ ok: true });
});

module.exports = router;
