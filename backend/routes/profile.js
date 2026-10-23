const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

function publicProfileOf(user) {
  const profile = user.publicProfile || {};
  return {
    name: profile.name || '',
    github: profile.github || '',
    linkedin: profile.linkedin || '',
    portfolio: profile.portfolio || '',
    email: profile.email || '',
  };
}

function cleanLink(value, label) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length > 300) {
    return { error: `${label} is too long.` };
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: `${label} should be a full link, starting with https://` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: `${label} should start with https://` };
  }
  return text;
}

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

// GET /api/profile — return current user profile
router.get('/', auth, async (req, res) => {
  const user = await User.findById(req.userId).select('-googleId -integrations');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user._id,
    email: user.email,
    name: user.name,
    gender: user.gender,
    preferredTheme: user.preferredTheme,
    availableStudyMins: user.availableStudyMins,
    rhythmEnabled: user.rhythmEnabled,
    publicProfile: publicProfileOf(user),
  });
});

// PUT /api/profile — update name, gender, email, preferredTheme
router.put('/', auth, async (req, res) => {
  const { name, gender, email, preferredTheme } = req.body;
  const update = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Name is too long' });
    }
    update.name = name.trim();
  }

  if (gender !== undefined) {
    const allowed = ['male', 'female', 'non-binary', 'prefer-not-to-say', ''];
    if (!allowed.includes(gender)) {
      return res.status(400).json({ error: 'Invalid gender value' });
    }
    update.gender = gender;
  }

  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: req.userId } });
    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    update.email = email.toLowerCase().trim();
  }

  if (preferredTheme !== undefined) {
    if (!['dark', 'light'].includes(preferredTheme)) {
      return res.status(400).json({ error: 'Invalid theme value' });
    }
    update.preferredTheme = preferredTheme;
  }

  if (req.body?.availableStudyMins !== undefined) {
    const mins = Number(req.body.availableStudyMins);
    if (!Number.isFinite(mins) || mins < 15 || mins > 720) {
      return res.status(400).json({ error: 'Available study time should be between 15 and 720 minutes.' });
    }
    update.availableStudyMins = mins;
  }

  if (req.body?.rhythmEnabled !== undefined) {
    if (typeof req.body.rhythmEnabled !== 'boolean') {
      return res.status(400).json({ error: 'Your Rhythm must be on or off.' });
    }
    update.rhythmEnabled = req.body.rhythmEnabled;
  }

  if (req.body?.publicProfile !== undefined) {
    const incoming = req.body.publicProfile || {};
    const current = publicProfileOf({ publicProfile: {} });
    const next = { ...current };
    if (incoming.name !== undefined) {
      const displayName = String(incoming.name).trim();
      if (displayName.length > 100) return res.status(400).json({ error: 'Name is too long.' });
      next.name = displayName;
      if (displayName) update.name = displayName;
    }
    for (const [key, label] of [['github', 'GitHub'], ['linkedin', 'LinkedIn'], ['portfolio', 'Portfolio']]) {
      if (incoming[key] === undefined) continue;
      const cleaned = cleanLink(incoming[key], label);
      if (cleaned && cleaned.error) return res.status(400).json({ error: cleaned.error });
      next[key] = cleaned;
    }
    if (incoming.email !== undefined) {
      const contact = String(incoming.email).trim();
      if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
        return res.status(400).json({ error: 'Contact email should look like name@example.com' });
      }
      if (contact.length > 200) return res.status(400).json({ error: 'Contact email is too long.' });
      next.email = contact;
    }
    update.publicProfile = next;
  }

  const user = await User.findByIdAndUpdate(req.userId, update, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: user._id,
    email: user.email,
    name: user.name,
    gender: user.gender,
    preferredTheme: user.preferredTheme,
    availableStudyMins: user.availableStudyMins,
    rhythmEnabled: user.rhythmEnabled,
    publicProfile: publicProfileOf(user),
  });
});

module.exports = router;
