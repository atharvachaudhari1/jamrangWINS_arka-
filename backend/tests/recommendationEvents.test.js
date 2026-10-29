const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const supertest = require('supertest');
const express = require('express');

const { connect, disconnect, makeUser } = require('./helpers/testApp');
const Task = require('../models/Task');
const RecommendationEvent = require('../models/RecommendationEvent');
const recommendationEvents = require('../routes/recommendationEvents');

function app() {
  const server = express();
  server.use(express.json());
  server.use('/recommendation-events', recommendationEvents);
  return server;
}

const nudge = {
  state: 'frozen',
  level: 2,
  kind: 'prompt',
  action: 'accepted',
  outcome: 'acted',
  secondsToAction: 40,
  confidence: 0.8,
};

describe('POST /recommendation-events nudge extension', () => {
  let api;
  let alice;

  before(async () => {
    await connect('recommendation_events');
    api = supertest(app());
    alice = await makeUser('Ada');
  });

  after(disconnect);

  it('accepts a valid nudge event', async () => {
    const at = Date.now() - 1000;
    const res = await api.post('/recommendation-events').set(alice.auth).send({
      eventType: 'nudge',
      at,
      nudge,
    });
    assert.equal(res.status, 200);
    const saved = await RecommendationEvent.findOne({ userId: alice.user._id, eventType: 'nudge' }).lean();
    assert.equal(saved.nudge.state, 'frozen');
    assert.equal(saved.nudge.level, 2);
    assert.equal(saved.nudge.kind, 'prompt');
    assert.equal(saved.nudge.action, 'accepted');
    assert.equal(saved.nudge.outcome, 'acted');
    assert.equal(saved.nudge.secondsToAction, 40);
    assert.equal(saved.nudge.confidence, 0.8);
    assert.equal(saved.title, undefined);
    assert.equal(saved.taskId, undefined);
  });

  it('rejects a nudge that contains a url or hostname', async () => {
    const before = await RecommendationEvent.countDocuments({ userId: alice.user._id });
    const urlRes = await api.post('/recommendation-events').set(alice.auth).send({
      eventType: 'nudge',
      url: 'https://example.com/page',
      nudge,
    });
    const hostRes = await api.post('/recommendation-events').set(alice.auth).send({
      eventType: 'nudge',
      nudge: { ...nudge, hostname: 'example.com' },
    });
    assert.equal(urlRes.status, 400);
    assert.equal(hostRes.status, 400);
    assert.equal(await RecommendationEvent.countDocuments({ userId: alice.user._id }), before);
  });

  it('still accepts an old-style recommendation event', async () => {
    const task = await Task.create({ userId: alice.user._id, title: 'Read one page' });
    const res = await api.post('/recommendation-events').set(alice.auth).send({
      type: 'started',
      taskId: String(task._id),
      energyLevel: 3,
      wasRecommended: true,
    });
    assert.equal(res.status, 200);
    const saved = await RecommendationEvent.findOne({ taskId: task._id }).lean();
    assert.equal(saved.type, 'started');
    assert.equal(saved.eventType, 'recommendation');
    assert.equal(saved.nudge, undefined);
  });
});
