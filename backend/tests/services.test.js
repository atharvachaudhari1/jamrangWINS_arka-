const test = require('node:test');
const assert = require('node:assert/strict');

const elevenlabs = require('../services/elevenlabs');
const { parseOutput, TranscribeError } = require('../services/windowsSpeech');
const { breakdownTask, validateSteps } = require('../services/aiService');
const planner = require('../services/planner');
const { mapCalendarEvents, localParts, reviewImport } = require('../services/timetableImport');

function fakeHttp(handler) {
  const calls = [];
  return {
    calls,
    post: async (url, body, options) => { calls.push({ url, body, options }); return handler(url, body, options); },
    get: async (url, options) => { calls.push({ url, options }); return handler(url, null, options); },
  };
}

function httpError(status, detail) {
  const err = new Error(`status ${status}`);
  err.response = { status, data: Buffer.from(JSON.stringify({ detail })) };
  return err;
}

test.beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'test-key-not-real';
  delete process.env.ELEVENLABS_VOICE_ID;
  elevenlabs.clearCache();
});
test.after(() => { delete process.env.ELEVENLABS_API_KEY; });

test('elevenlabs: sends the current request format and caches repeat text', async () => {
  const http = fakeHttp(() => ({ data: Buffer.from([1, 2, 3]) }));
  const first = await elevenlabs.synthesize('Read this', { http });
  assert.equal(first.cached, false);
  assert.equal(first.audio.length, 3);
  const call = http.calls[0];
  assert.match(call.url, /\/v1\/text-to-speech\/21m00Tcm4TlvDq8ikWAM$/);
  assert.deepEqual(call.body, { text: 'Read this', model_id: 'eleven_flash_v2_5' });
  assert.equal(call.options.headers.Accept, 'audio/mpeg');
  assert.equal(call.options.responseType, 'arraybuffer');
  const second = await elevenlabs.synthesize('Read this', { http });
  assert.equal(second.cached, true);
  assert.equal(http.calls.length, 1);
});

test('elevenlabs: validates voice IDs and text length', async () => {
  const http = fakeHttp(() => ({ data: Buffer.from([1]) }));
  await assert.rejects(elevenlabs.synthesize('Hi', { http, voiceId: '../../etc' }), { code: 'voice' });
  await assert.rejects(elevenlabs.synthesize('', { http }), { code: 'empty' });
  await assert.rejects(elevenlabs.synthesize('x'.repeat(601), { http }), { code: 'too_long' });
  process.env.ELEVENLABS_VOICE_ID = 'not valid';
  assert.equal(elevenlabs.configuredVoice(), elevenlabs.DEFAULT_VOICE);
  process.env.ELEVENLABS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
  assert.equal(elevenlabs.configuredVoice(), 'JBFqnCBsd6RMkjVDRZzb');
});

test('elevenlabs: maps provider failures to clear categories', async () => {
  const cases = [
    [httpError(401, { status: 'invalid_api_key' }), 'auth'],
    [httpError(401, { status: 'quota_exceeded' }), 'quota'],
    [httpError(429, { status: 'too_many_concurrent_requests' }), 'rate_limit'],
    [httpError(404, { status: 'voice_not_found' }), 'voice'],
    [Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' }), 'timeout'],
    [new Error('getaddrinfo ENOTFOUND'), 'network'],
  ];
  for (const [err, code] of cases) {
    elevenlabs.clearCache();
    const http = fakeHttp(() => { throw err; });
    await assert.rejects(elevenlabs.synthesize(`case ${code}`, { http }), (e) => {
      assert.equal(e.code, code);
      assert.equal(e.message.includes('case'), false, 'error messages never echo the text');
      return true;
    });
  }
});

test('windows speech output is parsed without keeping the audio', () => {
  assert.deepEqual(parseOutput('OK\t0.91\tsmaller\n'), { text: 'smaller', confidence: 0.91 });
  assert.deepEqual(parseOutput('NONE'), { text: '', confidence: 0 });
  assert.throws(() => parseOutput('ERROR no-recognizer'), (err) => err instanceof TranscribeError && err.code === 'no-recognizer');
});

test('elevenlabs: missing key is reported without calling the provider', async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const http = fakeHttp(() => ({ data: Buffer.from([1]) }));
  await assert.rejects(elevenlabs.synthesize('Hi', { http }), { code: 'not_configured' });
  assert.equal(http.calls.length, 0);
});

test('elevenlabs: voice list keeps only valid IDs', async () => {
  const http = fakeHttp(() => ({ data: { voices: [
    { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah - Mature', labels: { accent: 'american' } },
    { voice_id: 'bad', name: 'Broken' },
  ] } }));
  const voices = await elevenlabs.listVoices({ http });
  assert.deepEqual(voices.map((v) => v.name), ['Sarah']);
});

test('ai breakdown: falls back locally, validates model output, and handles timeouts', async () => {
  const local = await breakdownTask({ title: 'Essay', kind: 'assignment', estimateMins: 120 }, { client: null });
  assert.equal(local.source, 'local');
  assert.ok(local.steps.every((s) => s.title && s.estimateMins >= 5));

  const good = { chat: { completions: { create: async () => ({ choices: [{ message: { content: '{"steps":[{"title":"1. Outline","estimateMins":15},{"title":"Draft","estimateMins":500}]}' } }] }) } } };
  const fromAi = await breakdownTask({ title: 'Essay' }, { client: good });
  assert.equal(fromAi.source, 'openai');
  assert.equal(fromAi.steps[0].title, 'Outline');
  assert.equal(fromAi.steps[1].estimateMins, 90);

  const junk = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'sorry, no' } }] }) } } };
  assert.equal((await breakdownTask({ title: 'Essay' }, { client: junk })).source, 'local');

  const slow = { chat: { completions: { create: () => new Promise(() => {}) } } };
  const timedOut = await breakdownTask({ title: 'Essay' }, { client: slow, timeoutMs: 20 });
  assert.equal(timedOut.source, 'local');
  assert.match(timedOut.warning, /did not respond/);

  const limited = { chat: { completions: { create: async () => { throw Object.assign(new Error('rate'), { status: 429 }); } } } };
  assert.match((await breakdownTask({ title: 'Essay' }, { client: limited })).warning, /busy|limit/);

  assert.equal(validateSteps([{ title: 'only one' }]), null);
});

test('planner: low energy prefers short tasks, but deadlines still count', () => {
  const now = new Date('2026-10-27T10:00:00');
  const short = { task: { title: 'Short', estimateMins: 15 }, score: 0.5 };
  const long = { task: { title: 'Long', estimateMins: 90 }, score: 0.55 };
  assert.equal(planner.applyFit([long, short], 2, 120, now)[0].task.title, 'Short');
  assert.equal(planner.applyFit([long, short], 5, 120, now)[0].task.title, 'Long');
  const urgentLong = { task: { title: 'Urgent', estimateMins: 60, dueAt: new Date('2026-10-27T18:00:00') }, score: 0.5 };
  assert.ok(planner.fitScore(urgentLong.task, 3, 120, now) > planner.fitScore({ estimateMins: 60 }, 3, 120, now));
  assert.ok(planner.fitScore({ estimateMins: 200 }, 3, 60, now) < 0, 'tasks longer than the time set aside rank lower');
});

test('planner: detects classes in progress and plans around them', () => {
  const now = new Date('2026-10-27T09:30:00');
  const blocks = [{ title: 'Physics', dayOfWeek: now.getDay(), startMinutes: 9 * 60, endMinutes: 10 * 60 }];
  assert.equal(planner.currentClass(blocks, now).title, 'Physics');
  const today = planner.buildToday({ ranked: [{ task: { _id: '1', title: 'Read', estimateMins: 20 }, score: 1 }], blocks, now });
  assert.match(today.reason, /Physics right now/);
  assert.equal(today.suggestedSlot.startMinutes, 600);
  assert.equal(planner.freeSlots(blocks, now)[0].startMinutes, 600);
});

test('planner: Not now and later times stay before the deadline', () => {
  const now = new Date('2026-10-27T10:00:00');
  const due = new Date('2026-10-27T12:00:00');
  assert.ok(planner.postponeUntil('notnow', now, due) <= new Date('2026-10-27T11:00:00'));
  assert.ok(planner.postponeUntil('later', now, due, 600) <= new Date('2026-10-27T11:00:00'));
  assert.equal(planner.postponeUntil('notnow', now, null).getHours(), 13);
  const nearlyDue = new Date('2026-10-27T10:30:00');
  assert.ok(planner.postponeUntil('notnow', now, nearlyDue) < nearlyDue);
});

test('planner: Smaller proposes a concrete step, using the breakdown when there is one', () => {
  assert.equal(planner.proposeSmallerStep({ title: 'Essay', subtasks: [{ title: 'Outline', completed: true }, { title: 'Draft intro', completed: false }] }).title, 'Draft intro');
  assert.match(planner.proposeSmallerStep({ title: 'Chapter 3', kind: 'reading', estimateMins: 60 }).title, /first section of Chapter 3/);
  assert.equal(planner.proposeSmallerStep({ title: 'X', estimateMins: 60 }).estimateMins, 20);
});

test('planner: conflicts only count on the same day', () => {
  const blocks = [
    { title: 'A', dayOfWeek: 1, startMinutes: 540, endMinutes: 600 },
    { title: 'B', dayOfWeek: 1, startMinutes: 570, endMinutes: 630 },
    { title: 'C', dayOfWeek: 2, startMinutes: 540, endMinutes: 600 },
  ];
  assert.equal(planner.findConflicts(blocks).length, 1);
});

test('calendar mapping uses the student time zone and skips all-day events', () => {
  const events = [
    { title: 'Lecture', start: '2026-10-27T14:00:00Z', end: '2026-10-27T15:30:00Z', sourceId: 'e1', location: 'Hall A' },
    { title: 'Holiday', start: '2026-10-28', end: '2026-10-29', allDay: true, sourceId: 'e2' },
    { title: 'Broken', start: '2026-10-27T15:00:00Z', end: '2026-10-27T14:00:00Z', sourceId: 'e3' },
  ];
  const { blocks, skipped } = mapCalendarEvents(events, 'Asia/Kolkata');
  assert.equal(skipped, 2);
  assert.equal(blocks[0].startMinutes, 19 * 60 + 30);
  assert.equal(blocks[0].endMinutes, 21 * 60);
  assert.equal(blocks[0].location, 'Hall A');
  assert.equal(localParts(new Date('2026-10-27T23:30:00Z'), 'Asia/Kolkata').dayOfWeek, 3);
  assert.equal(mapCalendarEvents(events, 'Not/AZone').blocks.length, 1);
});

test('import review catches in-file duplicates too', () => {
  const row = { title: 'Bio', dayOfWeek: 1, startMinutes: 60, endMinutes: 120 };
  const review = reviewImport([row, { ...row, title: 'BIO' }], []);
  assert.equal(review.newCount, 1);
  assert.equal(review.duplicateCount, 1);
});
