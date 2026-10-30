import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideIntervention } from './interventionPolicy.js';
import { updateArm } from './bandit.js';

const now = Date.parse('2026-10-28T15:00:00');
const MINUTE = 60 * 1000;

function row(partial) {
  return { at: now - 11 * MINUTE, state: 'thrashing', level: 1, action: 'ignored', ...partial };
}

describe('decideIntervention', () => {
  it('starts at an ambient nudge', () => {
    assert.deepEqual(
      decideIntervention({ state: 'thrashing' }, [], now),
      { level: 1, kind: 'ambient' }
    );
  });

  it('moves up one level after an ignored nudge', () => {
    assert.deepEqual(
      decideIntervention({ state: 'thrashing' }, [row({})], now),
      { level: 2, kind: 'prompt' }
    );
  });

  it('does not skip levels', () => {
    const result = decideIntervention({ state: 'frozen' }, [row({ state: 'frozen', level: 1 })], now);
    assert.equal(result.level, 2);
    assert.notEqual(result.level, 3);
  });

  it('waits thirty seconds after an ignored nudge', () => {
    assert.equal(
      decideIntervention({ state: 'thrashing' }, [row({ at: now - 15 * 1000 })], now),
      null
    );
  });

  it('backs off for 45 minutes after two dismissals', () => {
    const history = [
      row({ at: now - 50 * MINUTE, action: 'dismissed' }),
      row({ at: now - 40 * MINUTE, state: 'frozen', action: 'dismissed' }),
    ];
    assert.equal(decideIntervention({ state: 'avoidance' }, history, now), null);
  });

  it('maps depleted to a rest nudge', () => {
    assert.deepEqual(
      decideIntervention({ state: 'depleted' }, [], now),
      { level: 1, kind: 'rest' }
    );
  });

  it('stays silent for ok and uncertain', () => {
    assert.equal(decideIntervention({ state: 'ok' }, [], now), null);
    assert.equal(decideIntervention({ state: 'uncertain' }, [], now), null);
  });

  it('stays silent during quiet hours', () => {
    const evening = Date.parse('2026-10-28T23:30:00');
    assert.equal(
      decideIntervention({
        state: 'thrashing',
        quietHours: { start: '22:00', end: '07:00' },
      }, [], evening),
      null
    );
  });

  it('stays silent when the active tab is audible', () => {
    assert.equal(decideIntervention({ state: 'frozen', audible: true }, [], now), null);
  });

  it('starts at a learned arm only after eight updates', () => {
    let early = {};
    for (let i = 0; i < 7; i += 1) early = updateArm('frozen', now, 'prompt', 'acted', 20, early);
    assert.equal(decideIntervention({ state: 'frozen' }, [], now, {
      learningEnabled: true,
      store: early,
      rng: () => 0.99,
    }).level, 1);

    let ready = early;
    ready = updateArm('frozen', now, 'prompt', 'acted', 20, ready);
    for (let i = 0; i < 4; i += 1) ready = updateArm('frozen', now, 'ambient', 'dismissed', null, ready);
    let step = 0;
    const choice = decideIntervention({ state: 'frozen' }, [], now, {
      learningEnabled: true,
      store: ready,
      rng: () => {
        step += 1;
        return step === 1 ? 0.05 : 0.99;
      },
    });
    assert.equal(choice.kind, 'prompt');
    assert.equal(choice.level, 2);
  });

  it('does not let the bandit skip the ladder', () => {
    let store = {};
    for (let i = 0; i < 6; i += 1) store = updateArm('thrashing', now, 'shrink', 'acted', 15, store);
    let step = 0;
    const choice = decideIntervention({ state: 'thrashing' }, [], now, {
      learningEnabled: true,
      store,
      rng: () => {
        step += 1;
        return step === 1 ? 0.05 : 0.99;
      },
    });
    assert.equal(choice.level, 1);
    assert.equal(choice.kind, 'ambient');
  });

  it('matches the plain ladder when learning is off', () => {
    let store = {};
    for (let i = 0; i < 10; i += 1) store = updateArm('thrashing', now, 'prompt', 'acted', 15, store);
    assert.deepEqual(
      decideIntervention({ state: 'thrashing' }, [row({})], now, { learningEnabled: false, store, rng: () => 0.99 }),
      { level: 2, kind: 'prompt' }
    );
  });

  it('keeps cooldown and back-off ahead of the bandit', () => {
    let store = {};
    for (let i = 0; i < 10; i += 1) store = updateArm('frozen', now, 'prompt', 'acted', 15, store);
    const learning = { learningEnabled: true, store, rng: () => 0.5 };
    assert.equal(decideIntervention({ state: 'frozen' }, [row({ at: now - 15 * 1000 })], now, learning), null);
    const dismissed = [
      row({ at: now - 50 * MINUTE, action: 'dismissed' }),
      row({ at: now - 40 * MINUTE, action: 'dismissed' }),
    ];
    assert.equal(decideIntervention({ state: 'frozen' }, dismissed, now, learning), null);
  });
});
