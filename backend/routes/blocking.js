const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const BlockingRule = require('../models/BlockingRule');

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).end();
  }
}

function sanitizeEntry(e) {
  if (!e || typeof e.value !== 'string') return null;
  const value = e.value.trim().toLowerCase();
  if (!value) return null;
  return {
    value,
    label: typeof e.label === 'string' ? e.label.trim().slice(0, 100) : '',
    enabled: typeof e.enabled === 'boolean' ? e.enabled : true,
    notes: typeof e.notes === 'string' ? e.notes.trim().slice(0, 300) : '',
  };
}

// GET /api/blocking
router.get('/', auth, async (req, res) => {
  try {
    let rules = await BlockingRule.findOne({ userId: req.userId });
    if (!rules) rules = await BlockingRule.create({ userId: req.userId });
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load blocking rules' });
  }
});

// PUT /api/blocking
router.put('/', auth, async (req, res) => {
  try {
    const { isEnabled, blockedSites, blockedApps, whitelist, schedule } = req.body;

    const update = { updatedAt: new Date() };

    if (typeof isEnabled === 'boolean') update.isEnabled = isEnabled;

    if (Array.isArray(blockedSites)) {
      update.blockedSites = blockedSites.map(sanitizeEntry).filter(Boolean).slice(0, 200);
    }
    if (Array.isArray(blockedApps)) {
      update.blockedApps = blockedApps.map(sanitizeEntry).filter(Boolean).slice(0, 200);
    }
    if (Array.isArray(whitelist)) {
      update.whitelist = whitelist.map(sanitizeEntry).filter(Boolean).slice(0, 200);
    }

    if (schedule && typeof schedule === 'object') {
      update.schedule = {
        enabled: typeof schedule.enabled === 'boolean' ? schedule.enabled : false,
        startTime: typeof schedule.startTime === 'string' ? schedule.startTime : '09:00',
        endTime: typeof schedule.endTime === 'string' ? schedule.endTime : '17:00',
        days: Array.isArray(schedule.days) ? schedule.days.filter((d) => d >= 0 && d <= 6) : [1, 2, 3, 4, 5],
      };
    }

    if ('pausedUntil' in req.body) {
      const p = req.body.pausedUntil;
      if (!p) update.pausedUntil = null;
      else {
        const d = new Date(p);
        update.pausedUntil = Number.isNaN(d.getTime()) ? null : d;
      }
    }

    const rules = await BlockingRule.findOneAndUpdate(
      { userId: req.userId },
      update,
      { new: true, upsert: true }
    );

    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save blocking rules' });
  }
});

module.exports = router;
