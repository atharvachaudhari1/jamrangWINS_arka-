import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectState } from './detectState.js';

const calm = {
  energyLevel: 4,
  baseline: null,
  stressHigh: false,
  deadlineNear: false,
  readingMode: false,
};

function snapshot(overrides = {}) {
  return {
    switchesPerMin: 0.4,
    medianDwellMs: 90000,
    revisitLoop: false,
    switchEntropy: 0.3,
    focusedIdleMs: 0,
    categoryMs: { passive: 5000, comms: 5000, work: 80000, other: 0 },
    current: { host: 'docs.google.com', cat: 'work', audible: false },
    ...overrides,
  };
}

describe('detectState', () => {
  it('reports thrashing when switches are fast, short, and looping', () => {
    const result = detectState(snapshot({
      switchesPerMin: 4,
      medianDwellMs: 8000,
      revisitLoop: true,
      switchEntropy: 1.6,
      current: { host: 'youtube.com', cat: 'passive', audible: false },
    }), calm);
    assert.equal(result.state, 'thrashing');
    assert.ok(result.confidence >= 0.6);
    assert.ok(result.reasons.includes('high switch rate'));
    assert.ok(result.reasons.includes('revisit loop'));
  });

  it('reports frozen on a quiet work tab after five minutes', () => {
    const result = detectState(snapshot({
      focusedIdleMs: 8 * 60 * 1000,
      switchesPerMin: 0.2,
    }), calm);
    assert.equal(result.state, 'frozen');
    assert.ok(result.confidence >= 0.6);
    assert.ok(result.reasons.includes('focused idle'));
  });

  it('does not report frozen while the current tab is audible', () => {
    const result = detectState(snapshot({
      focusedIdleMs: 8 * 60 * 1000,
      current: { host: 'youtube.com', cat: 'work', audible: true },
    }), calm);
    assert.notEqual(result.state, 'frozen');
    assert.equal(result.state, 'ok');
  });

  it('reports avoidance when passive time dominates and a deadline is near', () => {
    const result = detectState(snapshot({
      switchesPerMin: 0.3,
      medianDwellMs: 70000,
      focusedIdleMs: 0,
      categoryMs: { passive: 80000, comms: 5000, work: 10000, other: 5000 },
      current: { host: 'youtube.com', cat: 'passive', audible: true },
    }), { ...calm, deadlineNear: true });
    assert.equal(result.state, 'avoidance');
    assert.ok(result.confidence >= 0.6);
    assert.ok(result.reasons.includes('deadline near'));
  });

  it('does not report avoidance without a nearby deadline', () => {
    const result = detectState(snapshot({
      switchesPerMin: 0.3,
      categoryMs: { passive: 80000, comms: 5000, work: 10000, other: 5000 },
      current: { host: 'youtube.com', cat: 'passive', audible: true },
    }), calm);
    assert.notEqual(result.state, 'avoidance');
    assert.equal(result.state, 'ok');
  });

  it('reports depleted instead of frozen when energy is low', () => {
    const result = detectState(snapshot({
      focusedIdleMs: 8 * 60 * 1000,
    }), { ...calm, energyLevel: 1 });
    assert.equal(result.state, 'depleted');
    assert.ok(result.confidence >= 0.6);
    assert.ok(result.reasons.includes('low energy'));
  });

  it('reports depleted instead of thrashing when stress is high', () => {
    const result = detectState(snapshot({
      switchesPerMin: 4,
      medianDwellMs: 8000,
      revisitLoop: true,
      switchEntropy: 1.6,
      current: { host: 'mail.google.com', cat: 'comms', audible: false },
    }), { ...calm, stressHigh: true, energyLevel: 5 });
    assert.equal(result.state, 'depleted');
    assert.ok(result.reasons.includes('high stress'));
    assert.ok(result.reasons.includes('high switch rate'));
  });

  it('returns uncertain when thrashing only barely matches', () => {
    const result = detectState(snapshot({
      switchesPerMin: 2.5,
      medianDwellMs: 24900,
      revisitLoop: false,
      switchEntropy: 1.2,
      focusedIdleMs: 0,
      current: { host: 'mail.google.com', cat: 'comms', audible: false },
    }), calm);
    assert.equal(result.state, 'uncertain');
    assert.ok(result.confidence < 0.6);
    assert.ok(result.reasons.includes('high switch rate'));
  });

  it('returns ok for a steady work session', () => {
    const result = detectState(snapshot(), calm);
    assert.equal(result.state, 'ok');
    assert.equal(result.confidence, 1);
    assert.deepEqual(result.reasons, []);
  });
});
