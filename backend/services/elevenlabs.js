const crypto = require('crypto');
const axios = require('axios');

const API = 'https://api.elevenlabs.io';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';
const MODEL = 'eleven_flash_v2_5';
const VOICE_ID = /^[A-Za-z0-9]{20}$/;
const MAX_TEXT = 600;

// Short-lived audio cache so repeated "read again" does not spend more credits.
// Keyed by a hash, so the text itself is never kept as a key.
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_MAX = 40;
const cache = new Map();

function isVoiceId(id) {
  return typeof id === 'string' && VOICE_ID.test(id);
}

function configuredVoice() {
  const id = process.env.ELEVENLABS_VOICE_ID;
  return isVoiceId(id) ? id : DEFAULT_VOICE;
}

function isConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function cacheKey(voiceId, text) {
  return crypto.createHash('sha256').update(`${voiceId}\n${MODEL}\n${text}`).digest('hex');
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.audio;
}

function cacheSet(key, audio) {
  cache.set(key, { audio, expires: Date.now() + CACHE_TTL });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function clearCache() {
  cache.clear();
}

class SpeechError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function errorDetail(err) {
  const data = err.response?.data;
  if (!data) return '';
  try {
    const text = Buffer.isBuffer(data) || data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : JSON.stringify(data);
    return JSON.parse(text)?.detail?.status || text;
  } catch {
    return '';
  }
}

// Turns provider failures into messages a student can act on. Never includes the text.
function mapError(err) {
  if (err instanceof SpeechError) return err;
  const status = err.response?.status;
  const detail = String(errorDetail(err));
  if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
    return new SpeechError('timeout', 'ElevenLabs took too long to respond. Browser speech can be used instead.');
  }
  if (status === 401 && /quota/i.test(detail)) {
    return new SpeechError('quota', 'The ElevenLabs character quota has run out. Browser speech can be used instead.');
  }
  if (status === 401) return new SpeechError('auth', 'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY on the server.');
  if (status === 429) return new SpeechError('rate_limit', 'ElevenLabs is busy or over its limit. Try again shortly, or use browser speech.');
  if (status === 404 || status === 422 || /voice/i.test(detail)) {
    return new SpeechError('voice', 'The chosen ElevenLabs voice is not available. Pick another voice in Accessibility settings.');
  }
  if (!status) return new SpeechError('network', 'ElevenLabs could not be reached. Browser speech can be used instead.');
  return new SpeechError('provider', 'ElevenLabs could not read this aloud. Browser speech can be used instead.');
}

function cleanText(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) throw new SpeechError('empty', 'Nothing to read.', 400);
  if (value.length > MAX_TEXT) throw new SpeechError('too_long', 'That text is too long to read aloud.', 400);
  return value;
}

async function synthesize(text, { voiceId, http = axios, timeoutMs = 20000 } = {}) {
  if (!isConfigured()) throw new SpeechError('not_configured', 'ElevenLabs is not configured. Browser speech can be used instead.');
  const value = cleanText(text);
  if (voiceId && !isVoiceId(voiceId)) throw new SpeechError('voice', 'That voice ID is not valid.', 400);
  const voice = voiceId || configuredVoice();
  const key = cacheKey(voice, value);
  const cached = cacheGet(key);
  if (cached) return { audio: cached, cached: true, voiceId: voice };

  try {
    const response = await http.post(
      `${API}/v1/text-to-speech/${voice}`,
      { text: value, model_id: MODEL },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: timeoutMs,
      }
    );
    const audio = Buffer.from(response.data);
    if (!audio.length) throw new SpeechError('provider', 'ElevenLabs returned no audio. Browser speech can be used instead.');
    cacheSet(key, audio);
    return { audio, cached: false, voiceId: voice };
  } catch (err) {
    throw mapError(err);
  }
}

async function listVoices({ http = axios, timeoutMs = 10000 } = {}) {
  if (!isConfigured()) throw new SpeechError('not_configured', 'ElevenLabs is not configured.');
  try {
    const response = await http.get(`${API}/v2/voices`, {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      params: { page_size: 30 },
      timeout: timeoutMs,
    });
    return (response.data?.voices || [])
      .filter((voice) => isVoiceId(voice.voice_id))
      .map((voice) => ({
        id: voice.voice_id,
        name: String(voice.name || 'Voice').split(' - ')[0],
        description: voice.labels ? [voice.labels.accent, voice.labels.gender, voice.labels.age].filter(Boolean).join(', ') : '',
      }));
  } catch (err) {
    throw mapError(err);
  }
}

module.exports = {
  DEFAULT_VOICE,
  MAX_TEXT,
  SpeechError,
  isVoiceId,
  isConfigured,
  configuredVoice,
  synthesize,
  listVoices,
  mapError,
  clearCache,
};
