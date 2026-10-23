const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const Task = require('../models/Task');
const gmailService = require('../services/gmailService');
const gcalService  = require('../services/gcalService');
const slackService = require('../services/slackService');

// ── Auth middleware ───────────────────────────────────────────────────────────

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

function googleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${process.env.BACKEND_URL}/api/integrations/google/callback`,
    response_type: 'code',
    scope:         GOOGLE_SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function slackAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:    process.env.SLACK_CLIENT_ID,
    user_scope:   'channels:history,channels:read,stars:read,users:read',
    redirect_uri: `${process.env.BACKEND_URL}/api/integrations/slack/callback`,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

async function tryRefreshAndSave(user, provider, refreshFn) {
  const integration = user.integrations[provider];
  if (!integration?.refreshToken) return null;
  const newToken = await refreshFn(integration.refreshToken);
  user.integrations[provider].accessToken = newToken;
  await user.save();
  return newToken;
}

async function upsertTasksFromSource(userId, candidates) {
  let created = 0;
  for (const c of candidates) {
    const exists = await Task.findOne({ userId, 'meta.sourceId': c.sourceId });
    if (exists) continue;
    await Task.create({
      userId,
      title:    c.title,
      dueAt:    c.dueAt || null,
      meta:     { source: c.source, sourceId: c.sourceId },
    });
    created++;
  }
  return created;
}

// ── Status ────────────────────────────────────────────────────────────────────

// GET /api/integrations/status
router.get('/status', auth, async (req, res) => {
  const user = await User.findById(req.userId).select('integrations');
  if (!user) return res.status(404).json({ error: 'User not found' });

  const fmt = (key) => ({
    connected:    !!user.integrations?.[key]?.accessToken,
    connectedAt:  user.integrations?.[key]?.connectedAt || null,
    lastSyncedAt: user.integrations?.[key]?.lastSyncedAt || null,
  });

  res.json({ gmail: fmt('gmail'), gcal: fmt('gcal'), slack: fmt('slack') });
});

// ── Google OAuth (Gmail + GCal together) ─────────────────────────────────────

// GET /api/integrations/google/url
router.get('/google/url', auth, (req, res) => {
  // Encode userId in state so the callback knows which user to update
  const state = Buffer.from(JSON.stringify({ userId: req.userId })).toString('base64url');
  res.json({ url: googleAuthUrl(state) });
});

// GET /api/integrations/google/callback  (called by Google after consent)
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

  if (error || !code) {
    return res.redirect(`${frontendUrl}/connectors?error=google_denied`);
  }

  let userId;
  try {
    ({ userId } = JSON.parse(Buffer.from(state, 'base64url').toString()));
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=invalid_state`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${process.env.BACKEND_URL}/api/integrations/google/callback`,
        grant_type:    'authorization_code',
        code,
      },
    });

    const { access_token, refresh_token } = tokenRes.data;
    const now = new Date();

    await User.findByIdAndUpdate(userId, {
      'integrations.gmail.accessToken':  access_token,
      'integrations.gmail.refreshToken': refresh_token || undefined,
      'integrations.gmail.connectedAt':  now,
      'integrations.gcal.accessToken':   access_token,
      'integrations.gcal.refreshToken':  refresh_token || undefined,
      'integrations.gcal.connectedAt':   now,
    });

    res.redirect(`${frontendUrl}/connectors?connected=google`);
  } catch (err) {
    console.error('[integrations] Google callback error', err.message);
    res.redirect(`${frontendUrl}/connectors?error=google_token_failed`);
  }
});

// ── Slack OAuth ───────────────────────────────────────────────────────────────

// GET /api/integrations/slack/url
router.get('/slack/url', auth, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.userId })).toString('base64url');
  res.json({ url: slackAuthUrl(state) });
});

// GET /api/integrations/slack/callback
router.get('/slack/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

  if (error || !code) {
    return res.redirect(`${frontendUrl}/connectors?error=slack_denied`);
  }

  let userId;
  try {
    ({ userId } = JSON.parse(Buffer.from(state, 'base64url').toString()));
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=invalid_state`);
  }

  try {
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/slack/callback`;
    const { accessToken } = await slackService.exchangeCode(code, redirectUri);

    await User.findByIdAndUpdate(userId, {
      'integrations.slack.accessToken':  accessToken,
      'integrations.slack.refreshToken': null,
      'integrations.slack.connectedAt':  new Date(),
    });

    res.redirect(`${frontendUrl}/connectors?connected=slack`);
  } catch (err) {
    console.error('[integrations] Slack callback error', err.message);
    res.redirect(`${frontendUrl}/connectors?error=slack_token_failed`);
  }
});

// ── Sync endpoints ────────────────────────────────────────────────────────────

// POST /api/integrations/gmail/sync
router.post('/gmail/sync', auth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user?.integrations?.gmail?.accessToken) {
    return res.status(400).json({ error: 'Gmail not connected' });
  }

  let token = user.integrations.gmail.accessToken;
  try {
    const candidates = await gmailService.fetchTaskCandidates(token);
    const created = await upsertTasksFromSource(req.userId, candidates);
    user.integrations.gmail.lastSyncedAt = new Date();
    await user.save();
    res.json({ synced: candidates.length, created });
  } catch (err) {
    if (err.response?.status === 401) {
      try {
        token = await tryRefreshAndSave(user, 'gmail', gmailService.refreshAccessToken);
        const candidates = await gmailService.fetchTaskCandidates(token);
        const created = await upsertTasksFromSource(req.userId, candidates);
        user.integrations.gmail.lastSyncedAt = new Date();
        await user.save();
        return res.json({ synced: candidates.length, created });
      } catch {
        return res.status(401).json({ error: 'Gmail token expired. Please reconnect.' });
      }
    }
    console.error('[integrations] Gmail sync error', err.message);
    res.status(500).json({ error: 'Gmail sync failed' });
  }
});

// POST /api/integrations/gcal/sync
router.post('/gcal/sync', auth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user?.integrations?.gcal?.accessToken) {
    return res.status(400).json({ error: 'Google Calendar not connected' });
  }

  let token = user.integrations.gcal.accessToken;
  try {
    const candidates = await gcalService.fetchDeadlineCandidates(token);
    const created = await upsertTasksFromSource(req.userId, candidates);
    user.integrations.gcal.lastSyncedAt = new Date();
    await user.save();
    res.json({ synced: candidates.length, created });
  } catch (err) {
    if (err.response?.status === 401) {
      try {
        token = await tryRefreshAndSave(user, 'gcal', gcalService.refreshAccessToken);
        const candidates = await gcalService.fetchDeadlineCandidates(token);
        const created = await upsertTasksFromSource(req.userId, candidates);
        user.integrations.gcal.lastSyncedAt = new Date();
        await user.save();
        return res.json({ synced: candidates.length, created });
      } catch {
        return res.status(401).json({ error: 'Google Calendar token expired. Please reconnect.' });
      }
    }
    console.error('[integrations] GCal sync error', err.message);
    res.status(500).json({ error: 'Google Calendar sync failed' });
  }
});

// POST /api/integrations/slack/sync
router.post('/slack/sync', auth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user?.integrations?.slack?.accessToken) {
    return res.status(400).json({ error: 'Slack not connected' });
  }

  try {
    const candidates = await slackService.fetchTaskCandidates(user.integrations.slack.accessToken);
    const created = await upsertTasksFromSource(req.userId, candidates);
    user.integrations.slack.lastSyncedAt = new Date();
    await user.save();
    res.json({ synced: candidates.length, created });
  } catch (err) {
    console.error('[integrations] Slack sync error', err.message);
    res.status(500).json({ error: 'Slack sync failed' });
  }
});

// ── Disconnect ────────────────────────────────────────────────────────────────

// DELETE /api/integrations/:provider
router.delete('/:provider', auth, async (req, res) => {
  const { provider } = req.params;
  if (!['gmail', 'gcal', 'slack'].includes(provider)) {
    return res.status(400).json({ error: 'Unknown provider' });
  }

  await User.findByIdAndUpdate(req.userId, {
    [`integrations.${provider}.accessToken`]:  null,
    [`integrations.${provider}.refreshToken`]: null,
    [`integrations.${provider}.connectedAt`]:  null,
    [`integrations.${provider}.lastSyncedAt`]: null,
  });

  res.json({ ok: true, provider });
});

module.exports = router;
