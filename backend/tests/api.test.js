const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');

delete process.env.OPENAI_API_KEY;
delete process.env.ELEVENLABS_API_KEY;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.SLACK_CLIENT_ID;

const { buildApp, connect, disconnect, makeUser } = require('./helpers/testApp');
const Task = require('../models/Task');
const User = require('../models/User');
const TimetableBlock = require('../models/TimetableBlock');
const EnergyCheckIn = require('../models/EnergyCheckIn');
const { signState, verifyState } = require('../utils/oauthState');

let api;
let alice;
let bob;

test.before(async () => {
  await connect('api');
  api = supertest(buildApp());
  alice = await makeUser('Alice');
  bob = await makeUser('Bob');
});

test.after(disconnect);

async function createTask(who, body) {
  const res = await api.post('/api/tasks').set(who.auth).send(body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.task;
}

test('tasks: create, edit, search, filter, complete, reopen, delete', async () => {
  const essay = await createTask(alice, {
    title: 'History essay', subject: 'History', kind: 'assignment', priority: 'high',
    estimateMins: 90, description: 'Compare two sources', dueAt: new Date(Date.now() + 3 * 864e5).toISOString(),
  });
  await createTask(alice, { title: 'Read chapter 4', subject: 'Biology', kind: 'reading', estimateMins: 30 });

  assert.equal((await api.post('/api/tasks').set(alice.auth).send({ title: '' })).status, 400);
  assert.equal((await api.post('/api/tasks').set(alice.auth).send({ title: 'x', kind: 'nope' })).status, 400);
  assert.equal((await api.post('/api/tasks').set(alice.auth).send({ title: 'x', estimateMins: 0 })).status, 400);
  assert.equal((await api.post('/api/tasks').set(alice.auth).send({ title: 'x', dueAt: 'not a date' })).status, 400);

  const edited = await api.put(`/api/tasks/${essay._id}`).set(alice.auth).send({ title: 'History essay draft', estimateMins: 60 });
  assert.equal(edited.body.task.title, 'History essay draft');
  assert.equal((await api.put(`/api/tasks/${essay._id}`).set(alice.auth).send({ priority: 'urgent' })).status, 400);

  const search = await api.get('/api/tasks?q=sources').set(alice.auth);
  assert.deepEqual(search.body.tasks.map((t) => t.title), ['History essay draft']);
  const reading = await api.get('/api/tasks?kind=reading').set(alice.auth);
  assert.equal(reading.body.tasks.length, 1);
  const biology = await api.get('/api/tasks?subject=Biology').set(alice.auth);
  assert.equal(biology.body.tasks[0].title, 'Read chapter 4');

  await api.put(`/api/tasks/${essay._id}/complete`).set(alice.auth).send({});
  assert.equal((await api.get('/api/tasks?status=done').set(alice.auth)).body.tasks.length, 1);
  const reopened = await api.put(`/api/tasks/${essay._id}/reopen`).set(alice.auth);
  assert.equal(reopened.body.task.completed, false);

  const doomed = await createTask(alice, { title: 'Delete me' });
  assert.equal((await api.delete(`/api/tasks/${doomed._id}`).set(alice.auth)).status, 200);
  assert.equal((await api.get(`/api/tasks/${doomed._id}`).set(alice.auth)).status, 404);
});

test('tasks: AI breakdown is a preview, validated, and saved only on confirm', async () => {
  const task = await createTask(alice, { title: 'Lab report', kind: 'assignment', estimateMins: 120 });
  const preview = await api.post(`/api/tasks/${task._id}/breakdown`).set(alice.auth);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.source, 'local');
  assert.ok(preview.body.steps.length >= 3);
  const untouched = await Task.findById(task._id);
  assert.equal(untouched.subtasks.length, 0);

  const bad = await api.put(`/api/tasks/${task._id}/subtasks`).set(alice.auth).send({ steps: [{ title: '' }] });
  assert.equal(bad.status, 400);
  const saved = await api.put(`/api/tasks/${task._id}/subtasks`).set(alice.auth)
    .send({ steps: [{ title: 'Outline', estimateMins: 15 }, { title: 'Write method', estimateMins: 30 }] });
  assert.equal(saved.body.task.subtasks.length, 2);
});

test('planner: Smaller previews first, confirms, avoids duplicates, and undoes', async () => {
  await Task.deleteMany({ userId: alice.user._id });
  const big = await createTask(alice, { title: 'Revise calculus', kind: 'revision', estimateMins: 80 });

  const preview = await api.post('/api/planner/action').set(alice.auth).send({ action: 'smaller', taskId: big._id, preview: true });
  assert.match(preview.body.proposal.title, /calculus/);
  assert.equal(await Task.countDocuments({ parentTaskId: big._id }), 0);

  const step = { title: 'Review one page of limits notes', estimateMins: 15 };
  const first = await api.post('/api/planner/action').set(alice.auth).send({ action: 'smaller', taskId: big._id, step });
  assert.equal(first.body.task.title, step.title);
  const again = await api.post('/api/planner/action').set(alice.auth).send({ action: 'smaller', taskId: big._id, step });
  assert.match(again.body.message, /already on your list/);
  assert.equal(await Task.countDocuments({ parentTaskId: big._id }), 1);

  const undone = await api.post('/api/planner/action').set(alice.auth).send({ action: 'undo', undo: first.body.undo });
  assert.equal(undone.status, 200);
  assert.equal(await Task.countDocuments({ parentTaskId: big._id }), 0);
  assert.ok(await Task.findById(big._id));
});

test('planner: Not now never pushes past a near deadline, and can be undone', async () => {
  await Task.deleteMany({ userId: alice.user._id });
  const due = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const task = await createTask(alice, { title: 'Quiz prep', dueAt: due.toISOString(), estimateMins: 20 });
  const res = await api.post('/api/planner/action').set(alice.auth).send({ action: 'notnow', taskId: task._id });
  const stored = await Task.findById(task._id);
  assert.ok(stored.postponedUntil < due, 'postponement stays before the deadline');
  assert.equal(res.body.task, null);

  await api.post('/api/planner/action').set(alice.auth).send({ action: 'undo', undo: res.body.undo });
  assert.equal((await Task.findById(task._id)).postponedUntil, null);
});

test('planner: complete, undo, rest, ready, and later time', async () => {
  await Task.deleteMany({ userId: alice.user._id });
  const task = await createTask(alice, { title: 'Read notes', estimateMins: 15 });
  const done = await api.post('/api/planner/action').set(alice.auth).send({ action: 'complete', taskId: task._id });
  assert.equal((await Task.findById(task._id)).completed, true);
  await api.post('/api/planner/action').set(alice.auth).send({ action: 'undo', undo: done.body.undo });
  assert.equal((await Task.findById(task._id)).completed, false);

  const later = await api.post('/api/planner/action').set(alice.auth).send({ action: 'change', taskId: task._id, laterMins: 120 });
  const until = (await Task.findById(task._id)).postponedUntil;
  assert.ok(until - Date.now() > 110 * 60 * 1000);
  assert.ok(later.body.undo);
  assert.equal((await api.post('/api/planner/action').set(alice.auth).send({ action: 'change', taskId: task._id, laterMins: 5 })).status, 400);

  const rest = await api.post('/api/planner/action').set(alice.auth).send({ action: 'rest' });
  assert.equal(rest.body.resting, true);
  const ready = await api.post('/api/planner/action').set(alice.auth).send({ action: 'ready' });
  assert.equal(ready.body.resting, false);
  assert.equal((await api.post('/api/planner/action').set(alice.auth).send({ action: 'explode' })).status, 400);
});

test('timetable: preview flags duplicates and conflicts, confirm saves only new rows', async () => {
  await api.post('/api/timetable').set(alice.auth).send({ title: 'Biology', dayOfWeek: 1, start: '09:00', end: '10:30', location: 'Lab 2' });
  const dup = await api.post('/api/timetable').set(alice.auth).send({ title: 'biology', dayOfWeek: 1, start: '09:00', end: '10:30' });
  assert.equal(dup.status, 409);
  assert.equal((await api.post('/api/timetable').set(alice.auth).send({ title: 'Bad', dayOfWeek: 1, start: '11:00', end: '10:00' })).status, 400);

  const text = 'title,day,start,end,location\nBiology,mon,09:00,10:30\nChemistry,mon,10:00,11:00,Room 5\nChemistry,mon,10:00,11:00\nbad,row';
  const preview = await api.post('/api/timetable/upload/preview').set(alice.auth).send({ text });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.newCount, 1);
  assert.equal(preview.body.duplicateCount, 2);
  assert.equal(preview.body.conflictCount, 1);
  assert.equal(preview.body.warnings.length, 1);
  assert.equal(await TimetableBlock.countDocuments({ userId: alice.user._id }), 1);

  const rows = preview.body.rows.filter((row) => row.status === 'new');
  const saved = await api.post('/api/timetable/upload').set(alice.auth).send({ blocks: rows });
  assert.equal(saved.body.blocks.length, 1);
  assert.equal(saved.body.blocks[0].location, 'Room 5');

  const list = await api.get('/api/timetable').set(alice.auth);
  assert.equal(list.body.conflicts.length, 1);
  const edited = await api.put(`/api/timetable/${saved.body.blocks[0]._id}`).set(alice.auth)
    .send({ title: 'Chemistry', dayOfWeek: 1, start: '11:00', end: '12:00', location: 'Room 5' });
  assert.equal(edited.body.block.startMinutes, 660);
  assert.equal((await api.get('/api/timetable').set(alice.auth)).body.conflicts.length, 0);
  assert.equal((await api.get('/api/timetable/slots').set(alice.auth)).status, 200);
});

test('timetable: calendar import reports a missing connection', async () => {
  const res = await api.post('/api/timetable/import-calendar').set(alice.auth).send({});
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not connected/);
});

test('rhythm: off by default, opt-in saving, edit, delete, delete all', async () => {
  const off = await api.post('/api/rhythm/checkins').set(alice.auth).send({ level: 4 });
  assert.equal(off.body.saved, false);
  await api.put('/api/rhythm').set(alice.auth).send({ enabled: true });
  const on = await api.post('/api/rhythm/checkins').set(alice.auth).send({ level: 4 });
  assert.equal(on.body.saved, true);
  const edited = await api.put(`/api/rhythm/checkins/${on.body.checkin._id}`).set(alice.auth).send({ level: 2 });
  assert.equal(edited.body.checkin.band, 'low');
  await api.post('/api/rhythm/checkins').set(alice.auth).send({ level: 3 });
  assert.equal((await api.delete(`/api/rhythm/checkins/${on.body.checkin._id}`).set(alice.auth)).status, 200);
  assert.equal((await api.delete('/api/rhythm/checkins/not-an-id').set(alice.auth)).status, 404);
  await api.delete('/api/rhythm').set(alice.auth);
  assert.equal(await EnergyCheckIn.countDocuments({ userId: alice.user._id }), 0);
  await api.put('/api/rhythm').set(alice.auth).send({ enabled: false });
  assert.equal((await api.post('/api/rhythm/checkins').set(alice.auth).send({ level: 5 })).body.saved, false);
});

test('isolation: one student cannot read or change another student\'s data', async () => {
  const secret = await createTask(alice, { title: 'Alice private task' });
  const block = (await api.post('/api/timetable').set(alice.auth).send({ title: 'Alice class', dayOfWeek: 2, start: '13:00', end: '14:00' })).body.block;
  await api.put('/api/rhythm').set(alice.auth).send({ enabled: true });
  const checkin = (await api.post('/api/rhythm/checkins').set(alice.auth).send({ level: 3 })).body.checkin;

  assert.equal((await api.get(`/api/tasks/${secret._id}`).set(bob.auth)).status, 404);
  assert.equal((await api.put(`/api/tasks/${secret._id}`).set(bob.auth).send({ title: 'mine' })).status, 404);
  assert.equal((await api.put(`/api/tasks/${secret._id}/complete`).set(bob.auth)).status, 404);
  assert.equal((await api.delete(`/api/tasks/${secret._id}`).set(bob.auth)).status, 404);
  assert.equal((await api.post(`/api/tasks/${secret._id}/breakdown`).set(bob.auth)).status, 404);
  assert.equal((await api.post('/api/planner/action').set(bob.auth).send({ action: 'complete', taskId: secret._id })).status, 404);
  assert.equal((await api.post('/api/planner/action').set(bob.auth).send({ action: 'undo', undo: { type: 'complete', taskId: secret._id } })).status, 404);
  assert.equal((await api.put(`/api/timetable/${block._id}`).set(bob.auth).send({ title: 'x', dayOfWeek: 1, start: '09:00', end: '10:00' })).status, 404);
  assert.equal((await api.delete(`/api/timetable/${block._id}`).set(bob.auth)).status, 404);
  assert.equal((await api.delete(`/api/rhythm/checkins/${checkin._id}`).set(bob.auth)).status, 404);
  assert.equal((await api.get('/api/tasks').set(bob.auth)).body.tasks.length, 0);
  assert.equal((await api.get('/api/timetable').set(bob.auth)).body.blocks.length, 0);
  assert.equal((await api.get('/api/rhythm').set(bob.auth)).body.checkins.length, 0);
  assert.equal((await Task.findById(secret._id)).title, 'Alice private task');
  assert.equal((await api.get('/api/tasks')).status, 401);
});

test('oauth: state is signed, provider-bound, single-use, and checked in callbacks', async () => {
  const state = signState(alice.user._id, 'google');
  assert.equal(verifyState(state, 'slack'), null);
  assert.equal(verifyState(state, 'google'), String(alice.user._id));
  assert.equal(verifyState(state, 'google'), null, 'replayed state is rejected');

  const forged = Buffer.from(JSON.stringify({ userId: String(bob.user._id) })).toString('base64url');
  const cb = await api.get(`/api/integrations/google/callback?code=abc&state=${forged}`);
  assert.equal(cb.status, 302);
  assert.match(cb.headers.location, /invalid_state/);

  const url = await api.get('/api/integrations/google/url').set(alice.auth);
  assert.equal(url.status, 503);
  assert.equal(url.body.code, 'not_configured');
  const status = await api.get('/api/integrations/status').set(alice.auth);
  assert.equal(status.body.gcal.configured, false);
  assert.equal(status.body.gcal.connected, false);
});

test('speech: a recording that is not audio is refused and never logged', async () => {
  const res = await api.post('/api/accessibility/transcribe').set(alice.auth).set('Content-Type', 'audio/wav').send(Buffer.from('not-audio'));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'bad-audio');
  assert.equal((await api.post('/api/accessibility/transcribe').set('Content-Type', 'audio/wav').send(Buffer.from('RIFF'))).status, 401);
});

test('speech: missing key gives a clear message and never leaks configuration', async () => {
  const status = await api.get('/api/accessibility/status').set(alice.auth);
  assert.equal(status.body.elevenlabs, false);
  assert.equal(JSON.stringify(status.body).includes('xi-api-key'), false);
  const speak = await api.post('/api/accessibility/speak').set(alice.auth).send({ text: 'Hello' });
  assert.equal(speak.status, 503);
  assert.equal(speak.body.code, 'not_configured');
  assert.equal((await api.post('/api/accessibility/speak').send({ text: 'Hello' })).status, 401);
});

test('account: export excludes tokens, delete requires confirmation and removes data', async () => {
  const victim = await makeUser('Carol');
  await User.updateOne({ _id: victim.user._id }, { 'integrations.gcal.accessToken': 'secret-token', 'integrations.gcal.refreshToken': 'secret-refresh' });
  await createTask(victim, { title: 'Carol task' });

  const exported = await api.get('/api/account/export').set(victim.auth);
  assert.equal(exported.status, 200);
  const body = JSON.stringify(exported.body);
  assert.equal(body.includes('secret-token'), false);
  assert.equal(body.includes('secret-refresh'), false);
  assert.equal(exported.body.integrations.gcal.connected, true);
  assert.equal(exported.body.tasks.length, 1);

  assert.equal((await api.delete('/api/account').set(victim.auth).send({})).status, 400);
  const gone = await api.delete('/api/account').set(victim.auth).send({ confirm: 'DELETE' });
  assert.equal(gone.status, 200);
  assert.equal(await User.countDocuments({ _id: victim.user._id }), 0);
  assert.equal(await Task.countDocuments({ userId: victim.user._id }), 0);
  assert.ok(await User.findById(alice.user._id), 'other accounts are untouched');
});
