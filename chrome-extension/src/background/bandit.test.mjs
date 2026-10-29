import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseArm, seedPersona, summarize, updateArm } from './bandit.js';

const NOW = Date.parse('2026-10-28T15:00:00');
const MORNING = Date.parse('2026-10-28T09:00:00');
const ARMS = ['ambient', 'prompt', 'shrink', 'cowork'];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scripted(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

function meanOf(store, state, arm) {
  return summarize(store)[state].find((row) => row.arm === arm).mean;
}

describe('bandit', () => {
  it('converges on the arm that keeps working', () => {
    let store = {};
    for (let i = 0; i < 30; i += 1) {
      store = updateArm('frozen', NOW, 'prompt', 'acted', 20, store);
      store = updateArm('frozen', NOW, 'ambient', 'dismissed', null, store);
      store = updateArm('frozen', NOW, 'shrink', 'dismissed', null, store);
      store = updateArm('frozen', NOW, 'cowork', 'ignored', null, store);
    }
    const rng = mulberry32(4);
    let wins = 0;
    for (let i = 0; i < 40; i += 1) {
      if (chooseArm('frozen', NOW, ARMS, store, rng) === 'prompt') wins += 1;
    }
    assert.ok(wins >= 24, `prompt won ${wins} of 40`);
  });

  it('forgets old wins after later dismissals', () => {
    let store = {};
    for (let i = 0; i < 30; i += 1) store = updateArm('frozen', NOW, 'prompt', 'acted', 10, store);
    const before = meanOf(store, 'frozen', 'prompt');
    for (let i = 0; i < 30; i += 1) store = updateArm('frozen', NOW, 'prompt', 'dismissed', null, store);
    const after = meanOf(store, 'frozen', 'prompt');
    assert.ok(after < before - 0.25);
  });

  it('uses the exploration floor instead of the favorite arm', () => {
    let store = {};
    for (let i = 0; i < 20; i += 1) store = updateArm('frozen', NOW, 'prompt', 'acted', 10, store);
    const picked = chooseArm('frozen', NOW, ARMS, store, scripted([0.05, 0.99]));
    assert.equal(picked, 'cowork');
  });

  it('borrows from the state pool when the time of day is new', () => {
    let store = {};
    for (let i = 0; i < 12; i += 1) store = updateArm('frozen', NOW, 'prompt', 'acted', 15, store);
    assert.equal(store.contexts['frozen|morning'], undefined);
    const rng = mulberry32(9);
    let wins = 0;
    for (let i = 0; i < 30; i += 1) {
      if (chooseArm('frozen', MORNING, ARMS, store, rng) === 'prompt') wins += 1;
    }
    assert.ok(wins >= 18, `borrowed prompt won ${wins} of 30`);
  });

  it('lowers an arm after a dismissal', () => {
    const before = 1.5 / 3.5;
    const store = updateArm('avoidance', NOW, 'prompt', 'dismissed', null, {});
    assert.ok(meanOf(store, 'avoidance', 'prompt') < before);
  });

  it('summarizes each state with counts and means', () => {
    const summary = summarize(seedPersona());
    assert.equal(summary.frozen[0].arm, 'prompt');
    assert.ok(summary.frozen[0].samples >= 5);
    assert.equal(typeof summary.frozen[0].mean, 'number');
    assert.equal(summary.thrashing[0].arm, 'ambient');
  });
});
