const test = require('node:test');
const assert = require('node:assert/strict');
const {
  eligibleTasks,
  explainTask,
  smallerEstimate,
  suggestStudySlot,
  rhythmWindows,
  energyBand,
} = require('../services/planner');
const { parseTimetableText } = require('../services/timetableImport');

test('postponed tasks stay out of the next recommendation', () => {
  const later = new Date(Date.now() + 60 * 60 * 1000);
  const tasks = [
    { title: 'Later', completed: false, postponedUntil: later },
    { title: 'Ready', completed: false },
    { title: 'Done', completed: true },
  ];
  const open = eligibleTasks(tasks);
  assert.deepEqual(open.map((task) => task.title), ['Ready']);
});

test('explanations stay free of shame and streak pressure', () => {
  const text = explainTask(
    {
      title: 'Essay',
      subject: 'History',
      estimateMins: 90,
      availableStudyMins: 40,
      dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    },
    2,
    'You tend to delay this type — tackling it now while energy is good'
  );
  assert.match(text, /History/);
  assert.match(text, /low energy/i);
  assert.doesNotMatch(text, /dread|delay|lazy|fail|behind|streak|procrastinat/i);
});

test('a smaller step stays short', () => {
  assert.equal(smallerEstimate(90), 20);
  assert.equal(smallerEstimate(10), 10);
});

test('study slots avoid confirmed classes', () => {
  const now = new Date('2026-10-23T09:00:00');
  const slot = suggestStudySlot(
    [{ dayOfWeek: now.getDay(), startMinutes: 9 * 60, endMinutes: 10 * 60 }],
    30,
    now
  );
  assert.equal(slot.startMinutes, 10 * 60);
});

test('rhythm only summarises explicit check-ins', () => {
  const summary = rhythmWindows([
    { level: 2, createdAt: '2026-10-23T08:10:00' },
    { level: 5, createdAt: '2026-10-23T16:10:00' },
  ]);
  assert.equal(summary.enough, false);
  assert.equal(summary.windows.length, 2);
  assert.equal(energyBand(5), 'high');
});

test('timetable upload accepts csv and rejects a bad row', () => {
  const parsed = parseTimetableText('title,day,start,end\nBiology,mon,09:00,10:30\nbad,nope,1,2');
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0].dayOfWeek, 1);
  assert.equal(parsed.blocks[0].startMinutes, 9 * 60);
  assert.equal(parsed.warnings.length, 1);
});
