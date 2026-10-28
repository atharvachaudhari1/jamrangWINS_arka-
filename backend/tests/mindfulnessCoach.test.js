const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  buildRuleSuggestions,
  recommendFromSignals,
  personalizeSuggestions,
  computeStreakDays,
  computeSessionStats,
  applySessionEnd,
  sessionOwnerError,
  sessionDeleteError,
  typeScoresFromHistory,
  validateStartBody,
  validatePatchBody,
  parseTzOffsetMins,
  dayKey,
} = require('../services/mindfulnessCoachCore');

describe('rules fallback when ML fails', () => {
  it('uses local rules and source=rules when the ML call throws', async () => {
    const result = await recommendFromSignals({
      avgTabSwitches: 6,
      hour: 10,
      energyLevel: 3,
      completionRate: 0.8,
      todayTotal: 1,
      overdueCount: 0,
      history: [],
      stats: { avgTabSwitches: 6, completionRate: 0.8, hour: 10 },
    }, {
      fetchMl: async () => { throw new Error('timeout'); },
    });

    assert.equal(result.source, 'rules');
    assert.equal(result.top.type, 'grounding');
    assert.equal(result.personalized, false);
    assert.ok(result.reasons.length > 0);
  });

  it('still produces the original tab-switch grounding rule', () => {
    const { suggestions } = buildRuleSuggestions({
      avgTabSwitches: 4.2,
      hour: 11,
      energyLevel: 4,
      completionRate: 0.9,
      todayTotal: 1,
    });
    assert.equal(suggestions[0].type, 'grounding');
    assert.ok(suggestions[0].priority >= 0.9);
  });
});

describe('personalization re-rank', () => {
  it('boosts a type with positive energy delta and lower switching afterwards', () => {
    const suggestions = [
      { type: 'meditation', title: 'Meditation', description: '', priority: 0.8 },
      { type: 'grounding', title: 'Grounding', description: '', priority: 0.81 },
    ];
    const history = [
      { type: 'meditation', endedAt: '2026-10-20T10:00:00.000Z', plannedSecs: 120, completedSecs: 120, energyBefore: 2, energyAfter: 4, tabSwitchesBefore: 8, tabSwitchesAfter: 1 },
      { type: 'meditation', endedAt: '2026-10-21T10:00:00.000Z', plannedSecs: 120, completedSecs: 110, energyBefore: 3, energyAfter: 4, tabSwitchesBefore: 5, tabSwitchesAfter: 2 },
      { type: 'grounding', endedAt: '2026-10-22T10:00:00.000Z', plannedSecs: 120, completedSecs: 20, energyBefore: 3, energyAfter: 2, tabSwitchesBefore: 2, tabSwitchesAfter: 7 },
    ];
    const { suggestions: ranked, personalized } = personalizeSuggestions(suggestions, history);
    assert.equal(personalized, true);
    assert.equal(ranked[0].type, 'meditation');
    assert.ok(ranked[0].priority > ranked[1].priority);
  });

  it('penalizes types abandoned early', () => {
    const suggestions = [
      { type: 'breathing', title: 'Box', description: '', priority: 0.7 },
      { type: 'grounding', title: 'Ground', description: '', priority: 0.71 },
    ];
    const history = [
      { type: 'grounding', endedAt: '2026-10-20T10:00:00.000Z', plannedSecs: 300, completedSecs: 20, energyBefore: 3, energyAfter: 3 },
      { type: 'grounding', endedAt: '2026-10-21T10:00:00.000Z', plannedSecs: 300, completedSecs: 10, energyBefore: 3, energyAfter: 3 },
      { type: 'breathing', endedAt: '2026-10-22T10:00:00.000Z', plannedSecs: 64, completedSecs: 64, energyBefore: 3, energyAfter: 3 },
    ];
    const { suggestions: ranked, personalized } = personalizeSuggestions(suggestions, history);
    assert.equal(personalized, true);
    assert.equal(ranked[0].type, 'breathing');
  });
});

describe('streak calculation', () => {
  it('counts consecutive days ending today', () => {
    assert.equal(computeStreakDays(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26'), 3);
  });

  it('allows a streak that ended yesterday if today is still empty', () => {
    assert.equal(computeStreakDays(['2026-10-24', '2026-10-25'], '2026-10-26'), 2);
  });

  it('returns 0 when the last practice was two days ago', () => {
    assert.equal(computeStreakDays(['2026-10-24'], '2026-10-26'), 0);
  });

  it('rolls last-7-days minutes from completed sessions', () => {
    const stats = computeSessionStats([
      { type: 'grounding', completed: true, completedSecs: 300, startedAt: '2026-10-26T10:00:00.000Z', endedAt: '2026-10-26T10:05:00.000Z' },
      { type: 'meditation', completed: true, completedSecs: 120, startedAt: '2026-10-25T10:00:00.000Z', endedAt: '2026-10-25T10:02:00.000Z' },
      { type: 'breathing', completed: false, completedSecs: 10, startedAt: '2026-10-26T11:00:00.000Z' },
    ], { now: new Date('2026-10-26T18:00:00.000Z'), tzOffsetMins: 0 });

    assert.equal(stats.count, 2);
    assert.equal(stats.totalMinutes, 7);
    assert.equal(stats.streakDays, 2);
    assert.equal(stats.perType.grounding, 1);
    assert.equal(stats.perType.meditation, 1);
    const today = stats.last7Days.find((d) => d.date === '2026-10-26');
    assert.equal(today.minutes, 5);
  });
});

describe('PATCH ownership', () => {
  it('hides another user\'s session as not found', () => {
    const err = sessionOwnerError({ _id: 's1', userId: 'user-a' }, 'user-b');
    assert.equal(err.status, 404);
  });

  it('rejects a missing session', () => {
    const result = applySessionEnd(null, 'user-a', { completed: true, completedSecs: 60 });
    assert.equal(result.error.status, 404);
  });

  it('is idempotent once ended, but still accepts a first energyAfter', () => {
    const session = {
      _id: 's1',
      userId: 'user-a',
      plannedSecs: 120,
      completedSecs: 120,
      completed: true,
      endedAt: new Date('2026-10-26T10:02:00.000Z'),
      energyAfter: null,
    };
    const again = applySessionEnd(session, 'user-a', { completedSecs: 3, completed: false });
    assert.equal(again.idempotent, true);
    assert.deepEqual(again.updates, {});

    const energy = applySessionEnd(session, 'user-a', { energyAfter: 4 });
    assert.equal(energy.idempotent, true);
    assert.equal(energy.updates.energyAfter, 4);
  });

  it('does not overwrite energyAfter once it is already set', () => {
    const session = {
      _id: 's1',
      userId: 'user-a',
      plannedSecs: 120,
      completedSecs: 120,
      completed: true,
      endedAt: new Date('2026-10-26T10:02:00.000Z'),
      energyAfter: 3,
    };
    const again = applySessionEnd(session, 'user-a', { energyAfter: 5, completedSecs: 1 });
    assert.equal(again.idempotent, true);
    assert.deepEqual(again.updates, {});
  });
});

describe('unended sessions are ignored for ranking', () => {
  it('skips entries with no endedAt in typeScoresFromHistory', () => {
    const scores = typeScoresFromHistory([
      { type: 'grounding', endedAt: null, plannedSecs: 300, completedSecs: 0 },
      { type: 'grounding', plannedSecs: 300, completedSecs: 0 },
    ]);
    assert.deepEqual(scores, {});
  });

  it('does not change ranking when one unended zero-second session is added', () => {
    const suggestions = [
      { type: 'breathing', title: 'Box', description: '', priority: 0.7 },
      { type: 'grounding', title: 'Ground', description: '', priority: 0.71 },
    ];
    const ended = [
      { type: 'grounding', endedAt: '2026-10-20T10:00:00.000Z', plannedSecs: 300, completedSecs: 300, energyBefore: 3, energyAfter: 3 },
      { type: 'breathing', endedAt: '2026-10-21T10:00:00.000Z', plannedSecs: 64, completedSecs: 64, energyBefore: 3, energyAfter: 3 },
    ];
    const withOpen = ended.concat([
      { type: 'grounding', endedAt: null, plannedSecs: 300, completedSecs: 0 },
    ]);
    assert.deepEqual(typeScoresFromHistory(ended), typeScoresFromHistory(withOpen));
    const a = personalizeSuggestions(suggestions, ended);
    const b = personalizeSuggestions(suggestions, withOpen);
    assert.equal(a.suggestions[0].type, b.suggestions[0].type);
    assert.equal(a.suggestions[0].priority, b.suggestions[0].priority);
  });
});

describe('sessionDeleteError', () => {
  it('hides another user\'s session as not found', () => {
    const err = sessionDeleteError({ _id: 's1', userId: 'user-a', endedAt: null }, 'user-b');
    assert.equal(err.status, 404);
    assert.equal(err.error, 'Session not found.');
  });

  it('rejects a missing session', () => {
    const err = sessionDeleteError(null, 'user-a');
    assert.equal(err.status, 404);
    assert.equal(err.error, 'Session not found.');
  });

  it('rejects a session that already ended', () => {
    const err = sessionDeleteError({
      _id: 's1',
      userId: 'user-a',
      endedAt: new Date('2026-10-26T10:02:00.000Z'),
    }, 'user-a');
    assert.equal(err.status, 409);
    assert.equal(err.error, 'Session already ended.');
  });

  it('allows deleting an open session owned by the caller', () => {
    const err = sessionDeleteError({ _id: 's1', userId: 'user-a', endedAt: null }, 'user-a');
    assert.equal(err, null);
  });
});

describe('local-day stats (tzOffsetMins)', () => {
  it('counts an IST session on the next local calendar day', () => {
    const at = '2026-10-26T20:00:00.000Z';
    assert.equal(dayKey(at, -330), '2026-10-27');
    const stats = computeSessionStats([
      { type: 'meditation', completed: true, completedSecs: 60, startedAt: at, endedAt: at },
    ], { now: new Date('2026-10-27T06:00:00.000Z'), tzOffsetMins: -330 });
    const localDay = stats.last7Days.find((d) => d.date === '2026-10-27');
    assert.ok(localDay);
    assert.equal(localDay.minutes, 1);
  });

  it('keeps a streak that crosses UTC midnight with IST offset, and would break with 0', () => {
    const sessions = [
      {
        type: 'meditation',
        completed: true,
        completedSecs: 60,
        startedAt: '2026-10-26T17:30:00.000Z',
        endedAt: '2026-10-26T17:31:00.000Z',
      },
      {
        type: 'meditation',
        completed: true,
        completedSecs: 60,
        startedAt: '2026-10-26T19:30:00.000Z',
        endedAt: '2026-10-26T19:31:00.000Z',
      },
    ];
    const now = new Date('2026-10-27T00:30:00.000Z');
    assert.equal(computeSessionStats(sessions, { now, tzOffsetMins: -330 }).streakDays, 2);
    assert.equal(computeSessionStats(sessions, { now, tzOffsetMins: 0 }).streakDays, 1);
  });

  it('returns exactly 7 last7Days entries ending on the user\'s local today', () => {
    const stats = computeSessionStats([], {
      now: new Date('2026-10-26T20:00:00.000Z'),
      tzOffsetMins: -330,
    });
    assert.equal(stats.last7Days.length, 7);
    assert.equal(stats.last7Days[6].date, '2026-10-27');
    assert.equal(stats.last7Days[0].date, '2026-10-21');
  });

  it('accepts missing tzOffsetMins as 0 and rejects out-of-range values', () => {
    assert.equal(parseTzOffsetMins(undefined).value, 0);
    assert.equal(parseTzOffsetMins('-330').value, -330);
    assert.equal(parseTzOffsetMins(900).error.status, 400);
    assert.equal(parseTzOffsetMins('nope').error.status, 400);
  });
});

describe('start and patch validators', () => {
  it('rejects energyBefore 9, 2.5, and abc, and allows omitting it', () => {
    const base = { type: 'breathing', plannedSecs: 64 };
    assert.equal(validateStartBody({ ...base, energyBefore: 9 }).error.error, 'energyBefore must be from 1 to 5.');
    assert.equal(validateStartBody({ ...base, energyBefore: 2.5 }).error.error, 'energyBefore must be from 1 to 5.');
    assert.equal(validateStartBody({ ...base, energyBefore: 'abc' }).error.error, 'energyBefore must be from 1 to 5.');
    assert.equal(validateStartBody(base).error, undefined);
    assert.equal(validateStartBody(base).value.energyBefore, undefined);
  });

  it('rejects distractionBefore outside 0..200', () => {
    const base = { type: 'breathing', plannedSecs: 64 };
    assert.ok(validateStartBody({ ...base, distractionBefore: -1 }).error);
    assert.ok(validateStartBody({ ...base, distractionBefore: 201 }).error);
    assert.ok(validateStartBody({ ...base, distractionBefore: Infinity }).error);
    assert.ok(validateStartBody({ ...base, distractionBefore: '12' }).error);
  });

  it('rejects unknown triggeredBy and defaults absent to manual', () => {
    const base = { type: 'breathing', plannedSecs: 64 };
    assert.ok(validateStartBody({ ...base, triggeredBy: 'popup' }).error);
    assert.equal(validateStartBody(base).value.triggeredBy, 'manual');
  });

  it('accepts a valid start body', () => {
    const parsed = validateStartBody({
      type: 'meditation',
      plannedSecs: 120,
      energyBefore: 3,
      distractionBefore: 12,
      triggeredBy: 'recommendation',
    });
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.value.triggeredBy, 'recommendation');
    assert.equal(parsed.value.energyBefore, 3);
  });

  it('rejects completedSecs above plannedSecs*2 and negative values', () => {
    const session = { plannedSecs: 120, startedAt: '2026-10-26T10:00:00.000Z' };
    assert.ok(validatePatchBody({ completedSecs: 241 }, session).error);
    assert.ok(validatePatchBody({ completedSecs: -1 }, session).error);
    assert.equal(validatePatchBody({ completedSecs: 240 }, session).value.completedSecs, 240);
  });

  it('rejects endedAt in the future or before startedAt', () => {
    const session = { plannedSecs: 120, startedAt: '2026-10-26T10:00:00.000Z' };
    assert.ok(validatePatchBody({ endedAt: '2099-01-01T00:00:00.000Z' }, session).error);
    assert.ok(validatePatchBody({ endedAt: '2026-10-26T09:00:00.000Z' }, session).error);
  });

  it('accepts a valid patch body', () => {
    const parsed = validatePatchBody({
      completedSecs: 60,
      completed: true,
      endedAt: '2026-10-26T10:02:00.000Z',
      energyAfter: 4,
    }, { plannedSecs: 120, startedAt: '2026-10-26T10:00:00.000Z' });
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.value.completedSecs, 60);
    assert.equal(parsed.value.energyAfter, 4);
  });
});
