const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const rateLimit = require('express-rate-limit');

// Strict rate limit for auth endpoints: 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function makeToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Local session used until Google sign-in is configured.
router.post('/local', async (req, res) => {
  if (process.env.GOOGLE_CLIENT_ID) {
    return res.status(404).json({ error: 'Google sign-in is configured. Use that instead.' });
  }

  const email = 'local@doorway.local';
  let user = await User.findOne({ email });
  if (!user) {
    try {
      user = await User.create({
        email,
        name: 'Student',
        googleId: 'local-doorway',
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      user = await User.findOne({ email });
    }
  }

  res.json({
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      gender: user.gender,
      preferredTheme: user.preferredTheme,
    },
    token: makeToken(user._id),
  });
});

// Google Sign-In. Kept for when Google credentials are added.
router.post('/google', authLimiter, async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'Google ID token required' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const { sub: googleId, email, name, email_verified } = payload;
  if (!email_verified) {
    return res.status(400).json({ error: 'Google email not verified' });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;

    if (!user) {
      user = await User.create({
        email: normalizedEmail,
        name: name || '',
        googleId,
      });
      isNewUser = true;
    } else if (user.googleId !== googleId) {
      user.googleId = googleId;
      await user.save();
    }

    const token = makeToken(user._id);
    res.status(isNewUser ? 201 : 200).json({
      user: { id: user._id, email: user.email, name: user.name, gender: user.gender, preferredTheme: user.preferredTheme },
      token,
      ...(isNewUser ? { isNewUser: true } : {}),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw err;
  }
});

module.exports = router;
