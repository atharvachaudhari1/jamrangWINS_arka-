const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const LoginCode = require('../models/LoginCode');
const WebAuthnChallenge = require('../models/WebAuthnChallenge');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../utils/requireAuth');
const sendEmail = require('../utils/sendEmail');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

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

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    gender: user.gender,
    preferredTheme: user.preferredTheme,
    hasPasskey: Array.isArray(user.passkeys) && user.passkeys.length > 0,
  };
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'yandex.com', 'mail.com', 'zoho.com',
]);

function mailDomain(email) {
  return String(email || '').toLowerCase().trim().split('@')[1] || '';
}

function isCollegeDomain(domain) {
  return domain.endsWith('.edu') || domain.endsWith('.ac') || domain.includes('.edu.') || domain.includes('.ac.');
}

function mailProblem(email, kind) {
  const domain = mailDomain(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a full email address.';
  if (kind === 'college') {
    if (FREE_MAIL.has(domain)) return 'Personal addresses use Continue with Google.';
    if (!isCollegeDomain(domain)) return 'Use a college address, such as name@university.edu, or choose Work email.';
  }
  if (kind === 'work') {
    if (FREE_MAIL.has(domain)) return 'Personal addresses use Continue with Google. Enter the address your workplace gave you.';
    if (isCollegeDomain(domain)) return 'That looks like a college address. Choose College email.';
  }
  return '';
}

function hashCode(email, code) {
  return crypto.createHash('sha256').update(`${code}:${email}:${process.env.JWT_SECRET}`).digest('hex');
}

function relyingParty(req) {
  const origin = req.get('origin') || process.env.FRONTEND_URL || 'http://localhost:5173';
  const url = new URL(origin);
  return { origin: url.origin, rpID: url.hostname };
}

function bytesFrom(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64url'));
}

// Local session used until Google sign-in is configured.
router.post('/local', async (req, res) => {
  if (process.env.GOOGLE_CLIENT_ID) {
    return res.status(404).json({ error: 'Google sign-in is configured. Use that instead.' });
  }

  // The local account is identified by its fixed googleId, because the
  // student can change the email shown on it in Settings.
  const googleId = 'local-doorway';
  const email = 'local@doorway.local';
  let user = await User.findOne({ googleId });
  if (!user) {
    try {
      user = await User.create({ email, name: 'Student', googleId });
    } catch (err) {
      if (err.code !== 11000) throw err;
      user = await User.findOne({ googleId });
    }
  }
  if (!user) return res.status(409).json({ error: 'The local account could not be opened. Another account already uses local@doorway.local.' });

  res.json({ user: publicUser(user), token: makeToken(user._id) });
});

router.get('/google/extension-callback', (req, res) => {
  res.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'");
  res.type('html').send(`<!doctype html>
<meta charset="utf-8">
<title>Doorway</title>
<p>Signing you in.</p>
<script>
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const idToken = hash.get('id_token') || query.get('id_token');
  const state = hash.get('state') || query.get('state') || '';
  let next = null;
  try { next = new URL(state); } catch (err) { next = null; }
  const allowed = next && next.protocol === 'https:' && next.hostname.endsWith('.chromiumapp.org');
  if (!idToken || !allowed) {
    document.body.textContent = (hash.get('error') || query.get('error')) ? 'Google sign-in was cancelled.' : 'Google sign-in could not be finished.';
  } else {
    next.searchParams.set('id_token', idToken);
    location.replace(next.toString());
  }
</script>`);
});

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
      user: publicUser(user),
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

router.post('/email/start', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const kind = req.body?.kind === 'work' ? 'work' : req.body?.kind === 'college' ? 'college' : '';
  if (!kind) return res.status(400).json({ error: 'Choose college email or work email.' });
  const problem = mailProblem(email, kind);
  if (problem) return res.status(400).json({ error: problem });

  const code = String(crypto.randomInt(100000, 1000000));
  await LoginCode.deleteMany({ email });
  await LoginCode.create({
    email,
    kind,
    codeHash: hashCode(email, code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const subject = 'Your Doorway sign-in code';
  const text = `Your Doorway sign-in code is ${code}. It expires in 10 minutes. If you did not ask for this, you can ignore the email.`;
  try {
    await sendEmail(email, subject, text);
    return res.json({ sent: true });
  } catch (err) {
    console.error('[auth] sign-in email failed', err.message);
    if (process.env.NODE_ENV === 'development') {
      return res.json({ sent: false, devCode: code });
    }
    return res.status(503).json({ error: 'The sign-in email could not be sent. Try again shortly.' });
  }
});

router.post('/email/verify', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const code = String(req.body?.code || '').trim();
  const record = await LoginCode.findOne({ email }).sort({ expiresAt: -1 });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: 'That code has expired. Request a new one.' });
  }
  if (record.attempts >= 5) {
    return res.status(400).json({ error: 'Too many tries. Request a new code.' });
  }
  if (hashCode(email, code) !== record.codeHash) {
    record.attempts += 1;
    await record.save();
    return res.status(400).json({ error: 'That code does not match.' });
  }
  await LoginCode.deleteMany({ email });

  let user = await User.findOne({ email });
  let isNewUser = false;
  if (!user) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    user = await User.create({
      email,
      name: local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : '',
      googleId: `mail:${email}`,
    });
    isNewUser = true;
  }

  res.status(isNewUser ? 201 : 200).json({
    user: publicUser(user),
    token: makeToken(user._id),
    ...(isNewUser ? { isNewUser: true } : {}),
  });
});

router.post('/webauthn/register/options', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  const { rpID } = relyingParty(req);
  const options = await generateRegistrationOptions({
    rpName: 'Doorway',
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(String(user._id)),
    userDisplayName: user.name || user.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
    preferredAuthenticatorType: 'localDevice',
    excludeCredentials: (user.passkeys || []).map((key) => ({
      id: key.credentialId,
      transports: key.transports,
    })),
  });
  await WebAuthnChallenge.create({
    challenge: options.challenge,
    userId: user._id,
    kind: 'register',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  res.json(options);
});

router.post('/webauthn/register/verify', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  const saved = await WebAuthnChallenge.findOne({ userId: user._id, kind: 'register' }).sort({ expiresAt: -1 });
  if (!saved || saved.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: 'That Touch ID setup expired. Try again.' });
  }
  const { origin, rpID } = relyingParty(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return res.status(400).json({ error: 'Touch ID could not be saved.' });
  }
  await WebAuthnChallenge.deleteMany({ userId: user._id, kind: 'register' });
  if (!verification.verified) return res.status(400).json({ error: 'Touch ID could not be saved.' });

  const credential = verification.registrationInfo.credential;
  if (!user.passkeys) user.passkeys = [];
  user.passkeys.push({
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports || req.body?.response?.transports || [],
  });
  await user.save();
  res.json({ user: publicUser(user) });
});

router.delete('/webauthn', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  user.passkeys = [];
  await user.save();
  res.json({ user: publicUser(user) });
});

router.post('/webauthn/login/options', authLimiter, async (req, res) => {
  const { rpID } = relyingParty(req);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
  });
  await WebAuthnChallenge.create({
    challenge: options.challenge,
    kind: 'login',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  res.json(options);
});

router.post('/webauthn/login/verify', authLimiter, async (req, res) => {
  const credentialId = req.body?.id;
  if (!credentialId) return res.status(400).json({ error: 'No passkey was provided.' });
  const user = await User.findOne({ 'passkeys.credentialId': credentialId });
  const passkey = user?.passkeys?.find((key) => key.credentialId === credentialId);
  if (!user || !passkey) return res.status(400).json({ error: 'Biometric sign-in is not connected for an account on this computer. Sign in, then connect it in Settings.' });

  const challenge = await WebAuthnChallenge.findOne({ kind: 'login' }).sort({ expiresAt: -1 });
  if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: 'That Touch ID sign-in expired. Try again.' });
  }
  const { origin, rpID } = relyingParty(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: bytesFrom(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });
  } catch {
    return res.status(400).json({ error: 'Touch ID could not be verified.' });
  }
  await WebAuthnChallenge.deleteOne({ _id: challenge._id });
  if (!verification.verified) return res.status(400).json({ error: 'Touch ID could not be verified.' });

  passkey.counter = verification.authenticationInfo.newCounter;
  await user.save();
  res.json({ user: publicUser(user), token: makeToken(user._id) });
});

module.exports = router;
