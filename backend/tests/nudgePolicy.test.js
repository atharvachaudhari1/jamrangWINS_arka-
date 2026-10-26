const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  DEFAULTS,
  NUDGE_BREATHING_SECS,
  resolveConfig,
  evaluateNudge,
  validateNudgeCheckBody,
  validateNudgePatchBody,
  nudgeOwnerError,
  nudgeTransitionError,
} = require('../services/nudgePolicyCore');

const NOW = Date.parse('2026-10-26T12:00:00.000Z');
const MIN = 60 * 1000;

function timesInWindow(now, count, windowMins = 10) {
  const span = (windowMins * MIN) - 1000;
  return Array.from({ length: count }, (_, i) => now - Math.floor((span * i) / Math.max(count, 1)));
}

function decide(overrides = {}) {
  return evaluateNudge({
    now: NOW,
    distractionTimes: timesInWindow(NOW, 3),
    focusElapsedSecs: 180,
    nudgesThisSession: 0,
    history: [],
    config: DEFAULTS,
    ...overrides,
  });
}

describe('evaluateNudge block reasons', () => {
  it('blocks too_early before minFocusSecs', () => {
    const result = decide({ focusElapsedSecs: 119 });
    assert.equal(result.nudge, false);
    assert.equal(result.reason, 'too_early');
  });

  it('blocks session_cap when the session already used its nudges', () => {
    const result = decide({ nudgesThisSession: 2, focusElapsedSecs: 180 });
    assert.equal(result.nudge, false);
    assert.equal(result.reason, 'session_cap');
  });

  it('blocks cooldown from the most recent history entry of any outcome', () => {
    const result = decide({
      history: [{ outcome: 'accepted', createdAt: NOW - 10 * MIN }],
    });
    assert.equal(result.nudge, false);
    assert.equal(result.reason, 'cooldown');
    assert.ok(result.cooldownRemainingSecs > 0);
  });

  it('blocks below_threshold when distractions in the window are under the threshold', () => {
    const result = decide({ distractionTimes: timesInWindow(NOW, 2) });
    assert.equal(result.nudge, false);
    assert.equal(result.reason, 'below_threshold');
    assert.equal(result.countInWindow, 2);
    assert.equal(result.threshold, 3);
  });
});

describe('evaluateNudge threshold', () => {
  it('nudges at exactly the threshold, not at threshold-1', () => {
    const at = decide({ distractionTimes: timesInWindow(NOW, 3) });
    const under = decide({ distractionTimes: timesInWindow(NOW, 2) });
    assert.equal(at.nudge, true);
    assert.equal(at.reason, 'ok');
    assert.equal(at.countInWindow, 3);
    assert.match(at.message, /3 times/);
    assert.match(at.message, /10 minutes/);
    assert.match(at.message, /1-minute reset/);
    assert.equal(under.nudge, false);
    assert.equal(under.reason, 'below_threshold');
  });

  it('lowers the threshold to 2 when energy is low', () => {
    const result = decide({
      energyLevel: 2,
      distractionTimes: timesInWindow(NOW, 2),
    });
    assert.equal(result.nudge, true);
    assert.equal(result.threshold, 2);
  });

  it('raises the threshold to 5 when 2 of the last 3 resolved are dismissed, beating low energy', () => {
    const history = [
      { outcome: 'dismissed', createdAt: NOW - 40 * MIN },
      { outcome: 'completed', createdAt: NOW - 50 * MIN },
      { outcome: 'dismissed', createdAt: NOW - 60 * MIN },
    ];
    const lowEnergyButDismissed = decide({
      energyLevel: 1,
      history,
      distractionTimes: timesInWindow(NOW, 4),
    });
    assert.equal(lowEnergyButDismissed.nudge, false);
    assert.equal(lowEnergyButDismissed.reason, 'below_threshold');
    assert.equal(lowEnergyButDismissed.threshold, 5);

    const atRaised = decide({
      energyLevel: 1,
      history,
      distractionTimes: timesInWindow(NOW, 5),
    });
    assert.equal(atRaised.nudge, true);
    assert.equal(atRaised.threshold, 5);
  });
});

describe('evaluateNudge cooldown details', () => {
  it('doubles cooldown after two consecutive dismissals, with a boundary just before and after', () => {
    const latest = NOW - 60 * MIN;
    const history = [
      { outcome: 'dismissed', createdAt: latest },
      { outcome: 'dismissed', createdAt: latest - 5 * MIN },
    ];
    const justBefore = decide({ now: latest + 60 * MIN - 1, history, distractionTimes: timesInWindow(latest + 60 * MIN - 1, 3) });
    const justAfter = decide({ now: latest + 60 * MIN, history, distractionTimes: timesInWindow(latest + 60 * MIN, 5) });
    assert.equal(justBefore.reason, 'cooldown');
    assert.equal(justAfter.nudge, true);
  });

  it('lets a stale shown entry start a cooldown without counting as a dismissal', () => {
    const during = decide({
      energyLevel: 2,
      distractionTimes: timesInWindow(NOW, 2),
      history: [{ outcome: 'shown', createdAt: NOW - 11 * MIN }],
    });
    assert.equal(during.nudge, false);
    assert.equal(during.reason, 'cooldown');

    const after = decide({
      energyLevel: 2,
      distractionTimes: timesInWindow(NOW, 2),
      history: [{ outcome: 'shown', createdAt: NOW - 31 * MIN }],
    });
    assert.equal(after.nudge, true);
    assert.equal(after.threshold, 2);
  });

  it('does not count distraction times older than the window', () => {
    const result = decide({
      distractionTimes: [
        NOW - 11 * MIN,
        NOW - 12 * MIN,
        NOW - 13 * MIN,
        NOW - 1000,
        NOW - 2000,
      ],
    });
    assert.equal(result.countInWindow, 2);
    assert.equal(result.reason, 'below_threshold');
  });
});

describe('resolveConfig demo mode', () => {
  it('keeps DEFAULTS unless NUDGE_DEMO_MODE is the string true', () => {
    assert.deepEqual(resolveConfig({}), DEFAULTS);
    assert.deepEqual(resolveConfig({ NUDGE_DEMO_MODE: 'false' }), DEFAULTS);
    const demo = resolveConfig({ NUDGE_DEMO_MODE: 'true' });
    assert.equal(demo.baseThreshold, 2);
    assert.equal(demo.lowEnergyThreshold, 2);
    assert.equal(demo.windowMins, 5);
    assert.equal(demo.minFocusSecs, 0);
    assert.equal(demo.baseCooldownMins, 1);
    assert.equal(demo.maxPerSession, 5);
    assert.equal(demo.historyLimit, DEFAULTS.historyLimit);
  });

  it('uses demo minFocusSecs of 0', () => {
    const result = evaluateNudge({
      now: NOW,
      distractionTimes: timesInWindow(NOW, 2, 5),
      focusElapsedSecs: 0,
      nudgesThisSession: 0,
      history: [],
      config: resolveConfig({ NUDGE_DEMO_MODE: 'true' }),
    });
    assert.equal(result.nudge, true);
    assert.equal(NUDGE_BREATHING_SECS, 64);
  });
});

describe('validateNudgeCheckBody', () => {
  it('rejects bad types and more than 20 entries', () => {
    assert.equal(validateNudgeCheckBody({ distractionTimes: 'nope', focusElapsedSecs: 10, nudgesThisSession: 0 }, NOW).error.status, 400);
    const many = Array.from({ length: 21 }, () => NOW);
    assert.equal(validateNudgeCheckBody({ distractionTimes: many, focusElapsedSecs: 10, nudgesThisSession: 0 }, NOW).error.status, 400);
    assert.equal(validateNudgeCheckBody({ distractionTimes: [NOW, { t: NOW }], focusElapsedSecs: 10, nudgesThisSession: 0 }, NOW).error.status, 400);
  });

  it('drops old and future timestamps instead of erroring', () => {
    const parsed = validateNudgeCheckBody({
      distractionTimes: [NOW - 31 * MIN, NOW - 1000, new Date(NOW - 2000).toISOString(), NOW + 2 * MIN],
      focusElapsedSecs: 12.5,
      nudgesThisSession: 0,
    }, NOW);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.value.distractionTimes.length, 2);
  });

  it('rejects a bad energyLevel', () => {
    const parsed = validateNudgeCheckBody({
      distractionTimes: [],
      focusElapsedSecs: 0,
      nudgesThisSession: 0,
      energyLevel: 9,
    }, NOW);
    assert.equal(parsed.error.status, 400);
  });
});

describe('validateNudgePatchBody and transitions', () => {
  it('accepts a valid patch and rejects a bad session id', () => {
    const ok = validateNudgePatchBody({ outcome: 'accepted', mindfulnessSessionId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(ok.value.outcome, 'accepted');
    const bad = validateNudgePatchBody({ outcome: 'accepted', mindfulnessSessionId: 'not-an-id' });
    assert.equal(bad.error.status, 400);
    assert.equal(validateNudgePatchBody({ outcome: 'shown' }).error.status, 400);
  });

  it('allows every valid transition and forbids the rest', () => {
    assert.equal(nudgeTransitionError({ outcome: 'shown' }, 'accepted'), null);
    assert.equal(nudgeTransitionError({ outcome: 'shown' }, 'dismissed'), null);
    assert.equal(nudgeTransitionError({ outcome: 'accepted' }, 'completed'), null);
    assert.equal(nudgeTransitionError({ outcome: 'accepted' }, 'abandoned'), null);

    const forbidden = [
      ['shown', 'shown'],
      ['shown', 'completed'],
      ['shown', 'abandoned'],
      ['accepted', 'accepted'],
      ['accepted', 'dismissed'],
      ['accepted', 'shown'],
      ['dismissed', 'accepted'],
      ['dismissed', 'shown'],
      ['completed', 'abandoned'],
      ['abandoned', 'completed'],
    ];
    for (const [from, to] of forbidden) {
      const err = nudgeTransitionError({ outcome: from }, to);
      assert.equal(err.status, 409, `${from} -> ${to}`);
    }
  });

  it('hides another user\'s nudge as 404', () => {
    const err = nudgeOwnerError({ _id: 'n1', userId: 'user-a' }, 'user-b');
    assert.equal(err.status, 404);
    assert.equal(err.error, 'Nudge not found.');
    assert.equal(nudgeOwnerError(null, 'user-a').status, 404);
    assert.equal(nudgeOwnerError({ _id: 'n1', userId: 'user-a' }, 'user-a'), null);
  });
});