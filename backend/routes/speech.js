const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../utils/requireAuth');
const elevenlabs = require('../services/elevenlabs');
const { transcribeWav, TranscribeError } = require('../services/windowsSpeech');

const router = express.Router();

const speakLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many read-aloud requests. Try again later, or use browser speech.' },
});

router.get('/status', requireAuth, (req, res) => {
  res.json({
    elevenlabs: elevenlabs.isConfigured(),
    voiceId: elevenlabs.configuredVoice(),
    maxChars: elevenlabs.MAX_TEXT,
    note: 'Read-aloud sends only the text you ask Doorway to speak. Doorway does not store the audio or the text. ElevenLabs receives that text when this option is configured; Doorway does not control how long ElevenLabs keeps it.',
  });
});

router.get('/voices', requireAuth, async (req, res) => {
  try {
    const voices = await elevenlabs.listVoices();
    res.json({ voices, defaultVoiceId: elevenlabs.configuredVoice() });
  } catch (err) {
    console.warn('[speech] voice list failed', err.code);
    res.status(err.status || 503).json({ error: err.message, code: err.code });
  }
});

const transcribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many voice commands. Try again later, or use the buttons.' },
});

// One spoken phrase. The recording is recognised and then deleted. It is never logged.
router.post('/transcribe', requireAuth, transcribeLimiter, express.raw({ type: ['audio/wav', 'audio/wave', 'application/octet-stream'], limit: '600kb' }), async (req, res) => {
  try {
    const { text } = await transcribeWav(req.body);
    res.json({ transcript: text });
  } catch (err) {
    const mapped = err instanceof TranscribeError ? err : new TranscribeError('recognizer', 'That phrase could not be recognised. The buttons still work.');
    console.warn('[speech] transcribe failed', mapped.code);
    res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
  }
});

router.post('/speak', requireAuth, speakLimiter, async (req, res) => {
  try {
    const { audio, cached } = await elevenlabs.synthesize(req.body?.text, { voiceId: req.body?.voiceId || undefined });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.set('X-Doorway-Cache', cached ? 'hit' : 'miss');
    res.send(audio);
  } catch (err) {
    const mapped = err instanceof elevenlabs.SpeechError ? err : elevenlabs.mapError(err);
    // Only the error category is logged, never the text being spoken.
    console.warn('[speech] ElevenLabs request failed', mapped.code);
    res.status(mapped.status).json({
      configured: mapped.code !== 'not_configured',
      code: mapped.code,
      error: mapped.message,
    });
  }
});

module.exports = router;
