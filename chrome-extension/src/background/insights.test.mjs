import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeHistory } from './insights.js';
import { beginOutcome, stepOutcome, WINDOW_MS } from './outcomeTracker.js';

const NOW = Date.parse('2026-10-28T15:00:00Z');

function nudge(overrides = {}) {
  return beginOutcome({
    at: NOW - 60 * 1000,
    state: 'frozen',
    level: 2,
    kind: 'prompt',
    confidence: 0.8,
    ...overrides,
  });
}

describe('stepOutcome', () => {
  it('records acted when a task action happens inside the window', () => {
    const started = nudge({ at: NOW - 2 * 60 * 1000 });
    let step = stepOutcome(started, { type: 'tick', category: 'work', focusedIdleMs: 1000, restUntil: null }, NOW - 90 * 1000);
    step = stepOutcome(step.pending, { type: 'tick', category: 'work', focusedIdleMs: 1000, restUntil: null }, NOW - 60 * 1000);
    step = stepOutcome(step.pending, { type: 'tick', category: 'work', focusedIdleMs: 1000, restUntil: null }, NOW - 30 * 1000);
    assert.equal(step.record.outcome, 'acted');
    assert.equal(step.record.secondsToAction, 90);
  });

  it('records ignored after the window when the nudge was ignored', () => {
    const started = nudge({ at: NOW - WINDOW_MS - 1000 });
    const answered = stepOutcome(started, { type: 'response', action: 'ignored', kind: 'ambient' }, started.sentAt + 3 * 60 * 1000);
    const step = stepOutcome(answered.pending, { type: 'tick', category: 'passive', focusedIdleMs: 0, restUntil: null }, NOW);
    assert.equal(step.record.outcome, 'ignored');
    assert.equal(step.record.secondsToAction, null);
  });

  it('records rested after the rest window elapses', () => {
    const started = nudge({ at: NOW - 5 * 60 * 1000, kind: 'rest', level: 1, state: 'depleted' });
    const accepted = stepOutcome(started, { type: 'response', action: 'accepted', kind: 'rest' }, started.sentAt + 1000);
    const step = stepOutcome(accepted.pending, {
      type: 'tick',
      category: 'passive',
      focusedIdleMs: 0,
      restUntil: started.sentAt + 5 * 60 * 1000,
    }, NOW);
    assert.equal(step.record.outcome, 'rested');
    assert.equal(step.record.secondsToAction, null);
  });

  it('records dismissed when the window ends without a task action', () => {
    const started = nudge({ at: NOW - WINDOW_MS });
    const dismissed = stepOutcome(started, { type: 'response', action: 'dismissed', kind: 'prompt' }, started.sentAt + 1000);
    const step = stepOutcome(dismissed.pending, { type: 'tick', category: 'other', focusedIdleMs: 0, restUntil: null }, NOW);
    assert.equal(step.record.outcome, 'dismissed');
  });

  it('records no change when a rest is accepted and the window ends first', () => {
    const started = nudge({ at: NOW - WINDOW_MS, kind: 'rest', state: 'depleted', level: 1 });
    const accepted = stepOutcome(started, { type: 'response', action: 'accepted', kind: 'rest' }, started.sentAt + 1000);
    const step = stepOutcome(accepted.pending, {
      type: 'tick',
      category: 'passive',
      focusedIdleMs: 0,
      restUntil: NOW + 60 * 1000,
    }, NOW);
    assert.equal(step.record.outcome, 'no_change');
    assert.equal(step.record.secondsToAction, null);
  });

  it('counts seconds from the nudge to the first task action', () => {
    const started = nudge({ at: NOW - 125 * 1000 });
    const step = stepOutcome(started, { type: 'task' }, NOW);
    assert.equal(step.record.outcome, 'acted');
    assert.equal(step.record.secondsToAction, 125);
  });
});

describe('summarizeHistory', () => {
  it('summarizes the last seven days and waits for enough samples', () => {
    const recent = [
      { at: NOW - 1000, state: 'frozen', level: 1, kind: 'ambient', action: 'ignored', outcome: 'ignored', secondsToAction: null },
      { at: NOW - 2000, state: 'frozen', level: 2, kind: 'prompt', action: 'accepted', outcome: 'acted', secondsToAction: 40 },
      { at: NOW - 3000, state: 'depleted', level: 1, kind: 'rest', action: 'accepted', outcome: 'rested', secondsToAction: null },
      { at: NOW - 8 * 24 * 60 * 60 * 1000, state: 'thrashing', level: 3, kind: 'shrink', action: 'dismissed', outcome: 'dismissed', secondsToAction: null },
    ];
    const summary = summarizeHistory(recent, NOW);
    assert.equal(summary.shown, 3);
    assert.equal(summary.acceptedPct, 67);
    assert.equal(summary.dismissedPct, 0);
    assert.equal(summary.ignoredPct, 33);
    assert.equal(summary.medianSecondsToAction, 40);
    assert.equal(summary.topState, 'frozen');
    assert.equal(summary.restCompleted, 1);
    assert.equal(summary.line, 'Not enough data yet');
  });

  it('says when prompts are helping more than ambient tints', () => {
    const rows = [];
    for (let i = 0; i < 5; i += 1) {
      rows.push({ at: NOW - i * 1000, state: 'frozen', kind: 'ambient', action: 'ignored', outcome: 'ignored', secondsToAction: null });
      rows.push({ at: NOW - 10000 - i * 1000, state: 'thrashing', kind: 'prompt', action: 'accepted', outcome: 'acted', secondsToAction: 20 + i });
    }
    const summary = summarizeHistory(rows, NOW);
    assert.equal(summary.line, 'Prompts help you more than ambient tints');
    assert.equal(summary.medianSecondsToAction, 22);
  });
});
