const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { rankTasks } = require('../ml/priorityModel');
const { snapshotTask, contextFields } = require('../services/recommendationLog');
const recommendationEvents = require('../routes/recommendationEvents');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function request(server, method, path, { token, body } = {}) {
  const { port } = server.address();
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('rankTasks', () => {
  it('puts the sooner deadline first when the tasks otherwise match', () => {
    const soon = {
      _id: 'soon',
      title: 'reply to email',
      dueAt: new Date(Date.now() + 86400000),
      estimateMins: 20,
      importance: 3,
      dreadScore: 3,
    };
    const later = {
      _id: 'later',
      title: 'reply to email',
      dueAt: new Date(Date.now() + 20 * 86400000),
      estimateMins: 20,
      importance: 3,
      dreadScore: 3,
    };
    const ranked = rankTasks([later, soon], {
      energyLevel: 3,
      completionRate: 0.5,
      procrastinationRate: 0.3,
    });
    assert.equal(ranked[0].task._id, 'soon');
    assert.ok(ranked[0].score > ranked[1].score);
  });
});

describe('recommendation event snapshot', () => {
  it('copies the task fields a later model needs', () => {
    const now = new Date('2026-09-25T15:00:00Z');
    const snap = snapshotTask({
      _id: 'task-1',
      title: 'file taxes',
      dueAt: new Date('2026-09-20T15:00:00Z'),
      dreadScore: 4,
      importance: 5,
      estimateMins: 45,
    }, now);
    assert.equal(snap.taskId, 'task-1');
    assert.equal(snap.category, 'high_initiation');
    assert.equal(snap.dreadScore, 4);
    assert.equal(snap.overdue, true);
    assert.deepEqual(contextFields(4, now).energyLevel, 4);
  });
});

describe('POST /recommendation-events', () => {
  it('rejects a type the client is not allowed to write', async () => {
    const app = express();
    app.use(express.json());
    app.use('/recommendation-events', recommendationEvents);
    const server = await listen(app);
    const token = jwt.sign({ id: 'user-1' }, process.env.JWT_SECRET);
    try {
      const res = await request(server, 'POST', '/recommendation-events', {
        token,
        body: { type: 'shown', taskId: '507f1f77bcf86cd799439011', energyLevel: 3 },
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
