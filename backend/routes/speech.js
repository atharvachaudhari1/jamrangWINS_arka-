const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../utils/requireAuth');

const router = express.Router();

const speakLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many read-aloud requests. Try again later.' },
});

router.get('/status', requireAuth, (req, res) => {
  res.json({
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    note: 'Read-aloud sends only the text you ask Doorway to speak. Doorway does not store the audio. ElevenLabs receives that text when this option is configured; Doorway does not control how long ElevenLabs keeps it.',
  });
});

router.post('/speak', requireAuth, speakLimiter, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Nothing to read.' });
  if (text.length > 600) return res.status(400).json({ error: 'That text is too long to read aloud.' });
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({
      configured: false,
      error: 'ElevenLabs is not configured. Browser speech can be used instead.',
    });
  }

  const voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  try {
    const audio = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`,
      { text, model_id: 'eleven_flash_v2_5' },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 20000,
      }
    );
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(audio.data));
  } catch (err) {
    const status = err.response?.status;
    console.warn('[speech] ElevenLabs request failed', status || err.message);
    const error = status === 401
      ? 'ElevenLabs rejected the API key.'
      : status === 429
        ? 'ElevenLabs usage limit was reached. The planner still works.'
        : 'ElevenLabs could not read this aloud. Browser speech can be used instead.';
    res.status(503).json({ configured: true, error });
  }
});

module.exports = router;
