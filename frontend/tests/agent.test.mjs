import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "../src/accessibility/agent.js";

const now = new Date(2026, 9, 27, 15, 0, 0);

function heard(phrase, pending = null) {
  return interpret(phrase, pending, now);
}

test("agent: what can I do describes that section", () => {
  const timetable = heard("What can I do in timetable?");
  assert.equal(timetable.action, "about");
  assert.equal(timetable.path, "/timetable");
  assert.match(timetable.say, /class/i);
  const today = heard("what can I do in the today section");
  assert.equal(today.path, "/");
  assert.match(today.say, /energy/i);
  const tasks = heard("what can I do in the task");
  assert.equal(tasks.path, "/tasks");
  const here = interpret("what can I do here", null, now, "/focus");
  assert.equal(here.path, "/focus");
  assert.match(here.say, /Pomodoro|start/i);
  assert.equal(heard("open timetable").action, "navigate");
});

test("agent: a dated task said before add goes on the task calendar", () => {
  const intent = heard("Math test on 31st October, add in task calendar.");
  assert.equal(intent.action, "calendar-save");
  assert.equal(intent.draft.title, "Math test");
  const due = new Date(intent.draft.dueAt);
  assert.equal(due.getFullYear(), 2026);
  assert.equal(due.getMonth(), 9);
  assert.equal(due.getDate(), 31);
  assert.match(intent.say, /task calendar/i);
  const leading = heard("add math test on 31st october to the task calendar");
  assert.equal(leading.action, "calendar-save");
  assert.equal(leading.draft.title, "math test");
  assert.equal(heard("add in the task calendar").action, "calendar-draft");
  assert.equal(heard("add in the task calendar").ask, "title");
  assert.equal(heard("open task calendar").action, "navigate");
  assert.equal(heard("add a task").action, "task-draft");
});

test("agent: doorway open task opens My Tasks", () => {
  const intent = heard("doorway open task");
  assert.equal(intent.action, "navigate");
  assert.equal(intent.path, "/tasks");
  assert.equal(intent.askEnergy, false);
});

test("agent: hi go to todays task opens Today and asks energy", () => {
  const intent = heard("hi go to todays task");
  assert.equal(intent.action, "navigate");
  assert.equal(intent.path, "/");
  assert.equal(intent.askEnergy, true);
});

test("agent: a dated birthday keeps the name and the day, then asks the next field", () => {
  const intent = heard("doorway add Saanvi birthday on 5 november");
  assert.equal(intent.action, "task-draft");
  assert.equal(intent.draft.title, "Saanvi birthday");
  assert.equal(intent.ask, "subject");
  const due = new Date(intent.draft.dueAt);
  assert.equal(due.getFullYear(), 2026);
  assert.equal(due.getMonth(), 10);
  assert.equal(due.getDate(), 5);
});

test("agent: add this on this date keeps the title and asks for the subject", () => {
  const intent = heard("doorway add this on this date Saanvi birthday");
  assert.equal(intent.action, "task-draft");
  assert.equal(intent.draft.title, "Saanvi birthday");
  assert.equal(intent.ask, "subject");
});

test("agent: a later date fills the date and asks for minutes", () => {
  const intent = heard("5 november", {
    type: "task",
    asking: "dueAt",
    draft: { title: "Saanvi birthday", subject: "maths", kind: "assignment", priority: "high", dueAt: undefined, estimateMins: undefined, notes: undefined },
  });
  assert.equal(intent.action, "task-draft");
  assert.equal(intent.ask, "estimateMins");
  assert.equal(new Date(intent.draft.dueAt).getDate(), 5);
});

test("agent: read and delete the current card", () => {
  assert.equal(heard("doorway read todays card").action, "read");
  assert.deepEqual(heard("doorway delete this card"), { action: "delete", title: null });
  assert.deepEqual(heard("doorway delete this cart"), { action: "delete", title: null });
});

test("agent: profile navigation and a section update", () => {
  const open = heard("open my profile");
  assert.equal(open.action, "navigate");
  assert.equal(open.path, "/settings");
  const save = heard("set my github to https://github.com/example");
  assert.equal(save.action, "profile");
  assert.equal(save.field, "github");
  assert.equal(save.value, "https://github.com/example");
});

test("agent: add a task walks name, subject, type, priority, date, minutes, and notes", () => {
  const started = heard("add a task");
  assert.equal(started.action, "task-draft");
  assert.equal(started.ask, "title");
  const named = heard("name as math", { type: "task", asking: "title", draft: started.draft });
  assert.equal(named.draft.title, "math");
  assert.equal(named.ask, "subject");
  const subject = heard("maths", { type: "task", asking: "subject", draft: named.draft });
  assert.equal(subject.draft.subject, "maths");
  assert.equal(subject.ask, "kind");
  const kind = heard("assignment", { type: "task", asking: "kind", draft: subject.draft });
  assert.equal(kind.draft.kind, "assignment");
  assert.equal(kind.ask, "priority");
  const priority = heard("high", { type: "task", asking: "priority", draft: kind.draft });
  assert.equal(priority.draft.priority, "high");
  assert.equal(priority.ask, "dueAt");
  const dated = heard("24th october", { type: "task", asking: "dueAt", draft: priority.draft });
  assert.equal(dated.ask, "estimateMins");
  assert.equal(new Date(dated.draft.dueAt).getDate(), 24);
  assert.equal(new Date(dated.draft.dueAt).getMonth(), 9);
  const minutes = heard("45", { type: "task", asking: "estimateMins", draft: dated.draft });
  assert.equal(minutes.draft.estimateMins, 45);
  assert.equal(minutes.ask, "notes");
  const saved = heard("skip", { type: "task", asking: "notes", draft: minutes.draft });
  assert.equal(saved.action, "task-save");
  assert.equal(saved.draft.notes, "");
});

test("agent: subject and type are accepted even while a date was the question", () => {
  const draft = { title: "math", subject: undefined, kind: undefined, priority: "medium", dueAt: undefined, estimateMins: undefined, notes: undefined };
  const intent = heard("subject maths", { type: "task", asking: "dueAt", draft });
  assert.equal(intent.draft.subject, "maths");
  assert.equal(intent.ask, "kind");
  assert.match(intent.say, /subject maths/i);
});

test("agent: the other pages open, and their main controls are commands", () => {
  assert.equal(heard("open all tasks").path, "/todo");
  assert.equal(heard("open task calendar").path, "/calendar");
  assert.equal(heard("open progress").path, "/dashboard");
  assert.equal(heard("open focus timer").path, "/focus");
  assert.equal(heard("go to focus timer").action, "navigate");
  assert.equal(heard("go to focus timer").path, "/focus");
  assert.equal(heard("open focus shield").path, "/blocking");
  assert.equal(heard("open mindfulness").path, "/mindful");
  assert.equal(heard("open deadlines").path, "/deadline");
  assert.equal(heard("more").action, "more");
  assert.equal(heard("start focus").action, "focus");
  assert.equal(heard("turn on focus shield").action, "shield");
  assert.equal(heard("start mindfulness").action, "mindful");
});

test("agent: open my task and show me where you added that", () => {
  const open = heard("open my task");
  assert.equal(open.action, "navigate");
  assert.equal(open.path, "/tasks");
  assert.equal(heard("show me where you added that").action, "show-last");
  const leave = heard("open my task", { type: "date", title: "maths homework" });
  assert.equal(leave.action, "navigate");
  assert.equal(leave.path, "/tasks");
});

test("agent: energy and delete confirmation only apply while Doorway is waiting", () => {
  assert.deepEqual(heard("low", { type: "energy" }), { action: "energy", level: 2, label: "low" });
  assert.equal(heard("yes", { type: "confirm" }).action, "yes");
  assert.equal(heard("yes").action, "unknown");
  assert.equal(heard("good morning").action, "hello");
});
