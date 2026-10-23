const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { streamChatResponse } = require('../services/aiService');

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).end();
  }
}

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const SYSTEM_PROMPT = `You are Jumpy Brain, a friendly and focused ADHD productivity coach.
You help people with ADHD manage tasks, build momentum, and stay motivated throughout their day.
Be concise, supportive, and practical.`;

// GET /api/ai/health — is the AI configured?
router.get('/health', (req, res) => {
  res.json({ configured: !!process.env.OPENAI_API_KEY, model: 'gpt-4o' });
});

// GET /api/ai/chat?prompt=... — SSE stream (used by the web frontend)
router.get('/chat', auth, aiLimiter, async (req, res) => {
  const prompt = (req.query.prompt || '').toString().trim();
  if (!prompt) return res.status(400).json({ error: 'prompt query param is required' });
  try {
    await streamChatResponse([{ role: 'user', content: prompt }], SYSTEM_PROMPT, res);
  } catch (err) {
    console.error('[ai] chat stream error:', err.message);
    if (res.headersSent) res.end();
    else res.status(500).json({ error: 'AI chat failed' });
  }
});

// POST /api/ai/chat — SSE stream from a full messages array
router.post('/chat', auth, aiLimiter, async (req, res) => {
  const { messages, system } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  try {
    await streamChatResponse(messages, system || SYSTEM_PROMPT, res);
  } catch (err) {
    console.error('[ai] chat stream error:', err.message);
    if (res.headersSent) res.end();
    else res.status(500).json({ error: 'AI chat failed' });
  }
});

module.exports = router;
