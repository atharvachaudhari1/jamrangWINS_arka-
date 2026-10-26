const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const MONTH_PATTERN = Object.keys(MONTHS).join("|");
const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

const PAGES = [
  { re: /today(?:'|’)?s?\s+(?:task|card)|today card|^today$|^home$/, path: "/", name: "Today", askEnergy: true },
  { re: /timetable|classes|class schedule|my classes/, path: "/timetable", name: "Timetable" },
  { re: /rhythm|energy history|check-?ins/, path: "/rhythm", name: "Your Rhythm" },
  { re: /all tasks|general tasks|to-?do|todo list/, path: "/todo", name: "All tasks" },
  { re: /task calendar|^calendar$/, path: "/calendar", name: "Task calendar" },
  { re: /progress|dashboard|stats/, path: "/dashboard", name: "Progress" },
  { re: /focus shield|blocking|shield/, path: "/blocking", name: "Focus Shield" },
  { re: /focus timer|^focus$/, path: "/focus", name: "Focus Timer" },
  { re: /mindful|mindfulness|breathe/, path: "/mindful", name: "Mindfulness" },
  { re: /deadlines?/, path: "/deadline", name: "Deadlines" },
  { re: /connectors?|integrations?|gmail|slack|google calendar/, path: "/connectors", name: "Integrations" },
  { re: /accessibility|voice settings/, path: "/accessibility", name: "Accessibility" },
  { re: /profile|settings|account|my details/, path: "/settings", name: "your profile" },
  { re: /(?:my\s+)?tasks?|academic/, path: "/tasks", name: "My Tasks" },
];

const ENERGY = [
  [/exhausted|drained|sleepy|wiped|very low|^1$/, 1, "very low"],
  [/tired|low|^2$/, 2, "low"],
  [/okay|ok|medium|fine|alright|all right|neutral|^3$/, 3, "medium"],
  [/good|high|focused|energetic|^4$/, 4, "good"],
  [/peak|great|amazing|excellent|^5$/, 5, "high"],
];

const PROFILE_FIELDS = ["github", "linkedin", "portfolio", "email", "name"];

function sameLengthClean(raw) {
  const original = String(raw || "").replace(/\s+/g, " ").trim();
  // Sentence punctuation becomes a space so matching still lines up with the
  // original words. Dots inside links, like github.com, stay as they are.
  const lower = original.toLowerCase().replace(/[,!?]/g, " ").replace(/(?<=\w)\.(?=\s|$)/g, " ");
  return { original, lower };
}

function prepare(lower) {
  return lower
    .replace(/^(?:hey\s+)?doorway[\s,:;-]+/, "")
    .replace(/^(?:please\s+)?(?:can you|could you|would you|i want you to|i want to|let's|lets)\s+/, "")
    .replace(/^(?:hi|hello|hey|good morning|good afternoon|good evening)[\s,:;-]+(?=\S)/, "")
    .trim();
}

function sliceOriginal(original, lower, start, length) {
  return original.slice(start, start + length).trim();
}

function endOfDay(year, month, day) {
  const date = new Date(year, month, day, 23, 59, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function withYear(month, day, now, yearText) {
  if (yearText) {
    const year = Number(yearText);
    return endOfDay(year < 100 ? 2000 + year : year, month, day);
  }
  const thisYear = endOfDay(now.getFullYear(), month, day);
  if (thisYear && thisYear.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    return endOfDay(now.getFullYear() + 1, month, day);
  }
  return thisYear;
}

function pullDate(lower, now) {
  const candidates = [];
  const consider = (match, date) => {
    if (match && date) candidates.push({ index: match.index, length: match[0].length, date });
  };
  consider(lower.match(/\b(today|tomorrow)\b/), (() => {
    const match = lower.match(/\b(today|tomorrow)\b/);
    if (!match) return null;
    const date = new Date(now);
    if (match[1] === "tomorrow") date.setDate(date.getDate() + 1);
    date.setHours(23, 59, 0, 0);
    return date;
  })());
  const dayMonth = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`));
  if (dayMonth) consider(dayMonth, withYear(MONTHS[dayMonth[2]], Number(dayMonth[1]), now, dayMonth[3]));
  const monthDay = lower.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`));
  if (monthDay) consider(monthDay, withYear(MONTHS[monthDay[1]], Number(monthDay[2]), now, monthDay[3]));
  const numeric = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    let day = Number(numeric[1]);
    let month = Number(numeric[2]) - 1;
    if (month > 11 && day <= 12) { const swap = day; day = month + 1; month = swap - 1; }
    consider(numeric, withYear(month, day, now, numeric[3]));
  }
  const weekday = lower.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekday) {
    const target = WEEKDAYS[weekday[2]];
    let delta = (target - now.getDay() + 7) % 7;
    if (delta === 0 && weekday[1]) delta = 7;
    const date = new Date(now);
    date.setDate(date.getDate() + delta);
    date.setHours(23, 59, 0, 0);
    consider(weekday, date);
  }
  if (!candidates.length) return { rest: lower, date: null, index: -1, length: 0 };
  candidates.sort((a, b) => a.index - b.index);
  const best = candidates[0];
  const rest = `${lower.slice(0, best.index)} ${lower.slice(best.index + best.length)}`.replace(/\s+/g, " ").trim();
  return { rest, date: best.date, index: best.index, length: best.length };
}

function taskTitle(original, lower, fragmentLower) {
  const start = lower.indexOf(fragmentLower);
  const chunk = start >= 0 ? original.slice(start, start + fragmentLower.length) : fragmentLower;
  return chunk
    .replace(/\b(?:on\s+)?this date\b/gi, " ")
    .replace(/^(?:(?:this|on|for|a|the|task|card|called|named)\s+)+/i, "")
    .replace(/\s+\bon\s*$/i, "")
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function energyOf(text) {
  const bare = text.replace(/^(?:i am|i'm|im|i feel|feeling|my energy is|energy is|set energy to|i'm feeling)\s+/, "");
  for (const [re, level, label] of ENERGY) if (re.test(bare) && bare.split(" ").length <= 3) return { level, label };
  return null;
}

function pageOf(destination) {
  const target = destination.replace(/^(?:the|my|to)\s+/, "").trim();
  return PAGES.find((page) => page.re.test(target)) || null;
}

function profileChange(lower, original) {
  const fieldList = PROFILE_FIELDS.join("|");
  const patterns = [
    new RegExp(`(?:set|change|update|add|put)\\s+(?:my\\s+)?(${fieldList})\\s+(?:to|as|is|:)?\\s*(?!section\\b)(.+)$`),
    new RegExp(`(?:in|to|into)\\s+(?:the\\s+)?(${fieldList})\\s+(?:section\\s+)?(?:add|put|set)?\\s*(.+)$`),
    new RegExp(`(?:my\\s+)?(${fieldList})\\s+(?:is|to)\\s+(.+)$`),
  ];
  for (const re of patterns) {
    const match = lower.match(re);
    if (!match || !match[2].trim()) continue;
    const value = sliceOriginal(original, lower, match.index + match[0].length - match[2].length, match[2].length);
    return { field: match[1], value: value.replace(/^(?:add|put|set)\s+/i, "").replace(/[.,!?]+$/g, "").trim() };
  }
  return null;
}

// Turns one spoken phrase into something Doorway can do. Dates and names keep
// the caller's words; only the matching is done in lowercase.
export function interpret(raw, pending = null, now = new Date(), path = "") {
  const { original, lower: cleaned } = sameLengthClean(raw);
  const text = prepare(cleaned);
  const spoken = sliceOriginal(original, cleaned, cleaned.indexOf(text), text.length);
  if (!text) return /doorway/.test(cleaned) ? { action: "hello" } : { action: "ignore" };

  if (/^(?:stop listening|goodbye|good bye|that's all|thats all|go to sleep)$/.test(text)) {
    return { action: "stop" };
  }
  if (/^(?:stop reading|be quiet|silence)$/.test(text)) return { action: "stop-speaking" };

  if (pending?.type === "confirm" && /^(?:yes|yeah|yep|yup|confirm|do it|delete it|go ahead)$/.test(text)) {
    return { action: "yes" };
  }
  if (pending?.type === "confirm" && /^(?:no|nope|cancel|don't|do not|keep it)$/.test(text)) {
    return { action: "no" };
  }

  if (pending?.type === "task" && !looksLikeCommand(text)) {
    return continueTask(pending.draft, pending.asking, spoken || original, text, now);
  }
  if (pending?.type === "calendar" && !looksLikeCommand(text)) {
    return fillCalendar(pending.draft, pending.asking, spoken || original, text, now);
  }

  const energy = energyOf(text);
  if (energy && (pending?.type === "energy" || /energy|feeling|feel|tired|exhausted/.test(text) || text === energy.label || /^(low|medium|high|okay|ok|good|peak|tired)$/.test(text))) {
    return { action: "energy", level: energy.level, label: energy.label };
  }

  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening)$/.test(text)) return { action: "hello" };

  const study = text.match(/\b(?:study time|available time)\s+(?:to\s+)?(\d{2,3})\b/);
  if (study) return { action: "study", minutes: Number(study[1]) };

  if (/\b(?:dark|light)\s+(?:mode|theme)\b/.test(text) || /^(?:dark|light) mode$/.test(text)) {
    return { action: "theme", value: /dark/.test(text) ? "dark" : "light" };
  }

  const profile = profileChange(text, spoken || original);
  if (profile && profile.value) return { action: "profile", ...profile, open: /profile|settings/.test(text) };

  if (/\b(?:read|say|tell me|what(?:'s| is) (?:my|the))\b.*\b(?:today|card|recommendation|plan|next)\b/.test(text) || /^read$/.test(text)) {
    return { action: "read" };
  }

  if (/^(?:shuffle|reorder|sort)(?:\s+(?:my\s+)?(?:tasks?|today))?$/.test(text)) return { action: "shuffle" };

  if (/^(?:delete|remove|erase)\s+(?:this|the|that|current)?\s*(?:card|cart|task|one)?$/.test(text)) {
    return { action: "delete", title: null };
  }
  const namedDelete = text.match(/^(?:delete|remove|erase)\s+(?:the\s+)?(?:task\s+|card\s+)?(.+)$/);
  if (namedDelete) {
    const title = taskTitle(spoken || original, text, namedDelete[1]);
    if (title) return { action: "delete", title };
  }

  const calendar = calendarIntent(text, spoken || original, now);
  if (calendar) return calendar;

  if (/^(?:add|create|make|schedule|new)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:task|card|event|reminder)$/.test(text)) {
    return taskResult(blankDraft(), [], "title");
  }

  const add = text.match(/^(?:add|create|new|schedule|put|make)\s+(?:a\s+)?(?:new\s+)?(?:task|card|event|reminder\s+)?(?:called\s+|named\s+)?(.+)$/);
  if (add && !/^(?:my\s+)?(?:github|linkedin|portfolio|email|name)\b/.test(add[1])) {
    const aligned = keepCase(spoken || original, text, add[1]);
    return continueTask(blankDraft(), "title", aligned, add[1], now);
  }

  if (/^undo$/.test(text)) return { action: "undo" };
  if (/^(?:mark|complete)\b.*\b(?:done|complete|finished)\b|^done$/.test(text)) return { action: "planner", name: "complete" };
  if (/^smaller$|\bsmall step\b/.test(text)) return { action: "planner", name: "smaller" };
  if (/^rest$|\btake a break\b/.test(text)) return { action: "planner", name: "rest" };
  if (/^not now$|^later$/.test(text)) return { action: "planner", name: "notnow" };
  if (/^another(?: one)?$|^change$/.test(text)) return { action: "planner", name: "change" };
  if (/^do it$|^start$/.test(text)) return { action: "planner", name: "do" };

  if (/\b(?:start|pause|reset)\b/.test(text) && /\b(?:focus|timer|pomodoro|deep work)\b/.test(text)) {
    const command = /\bpause\b/.test(text) ? "pause" : /\breset\b/.test(text) ? "reset" : /\bdeep\b/.test(text) ? "deep" : "start";
    return { action: "focus", command };
  }
  if (/\b(?:turn|switch|enable|disable)\b/.test(text) && /\b(?:focus shield|shield)\b/.test(text)) {
    return { action: "shield", on: !/\b(?:off|disable)\b/.test(text) };
  }
  if (/\b(?:start|stop|begin)\b/.test(text) && /\b(?:mindful|mindfulness|meditation|grounding|breathe|breathing)\b/.test(text)) {
    const mode = /\bground/.test(text) ? "grounding" : /\bsleep/.test(text) ? "guided" : "meditation";
    return { action: "mindful", command: /\bstop\b/.test(text) ? "stop" : "start", mode };
  }
  if (/^(?:open|show|go to)?\s*more(?:\s+menu)?$/.test(text)) return { action: "more" };

  const about = explainIntent(text, path);
  if (about) return about;

  if (/\b(?:where|show)\b/.test(text) && /\b(?:add|added|put|saved)\b/.test(text)) {
    return { action: "show-last" };
  }

  const destination = text.match(/^(?:open|go to|goto|show(?:\s+me)?|take me to|go|find|where(?:\s+is)?)\s+(.+)$/);
  if (destination) {
    const page = pageOf(destination[1]);
    if (page) return { action: "navigate", path: page.path, name: page.name, askEnergy: !!page.askEnergy };
  }
  if (/\b(?:open|show|go to|take me|find)\b/.test(text)) {
    const page = pageOf(text);
    if (page) return { action: "navigate", path: page.path, name: page.name, askEnergy: !!page.askEnergy };
  }
  const direct = pageOf(text);
  if (direct && text.split(" ").length <= 4 && !/^(?:add|create|make|schedule)\b/.test(text)) {
    return { action: "navigate", path: direct.path, name: direct.name, askEnergy: !!direct.askEnergy };
  }

  return { action: "unknown", heard: spoken || text };
}

function looksLikeCommand(text) {
  if (/^(?:stop|undo|delete|remove|open|show|find|where)\b/.test(text)) return true;
  if (/^(?:go to|goto|take me|add|create|make|schedule)\b/.test(text)) return true;
  if (/\b(?:show me|go to|take me to|where is|where did|open my)\b/.test(text)) return true;
  if (/\b(?:read|say)\b.*\b(?:today|card|recommendation|plan)\b/.test(text)) return true;
  if (/\bwhat\b/.test(text) && /\b(?:do|can)\b/.test(text)) return true;
  if (/\b(?:tell me about|how does|explain|describe)\b/.test(text)) return true;
  if (/\b(?:start|pause|reset)\b/.test(text) && /\b(?:focus|timer|pomodoro)\b/.test(text)) return true;
  if (/\b(?:focus shield|mindful|mindfulness|meditation)\b/.test(text) && /\b(?:open|start|stop|turn|enable|disable)\b/.test(text)) return true;
  if (/\b(?:add|create|make|schedule|put)\b/.test(text) && /\bcalendar\b/.test(text)) return true;
  return false;
}

const ABOUT = [
  { re: /focus shield|blocking/, path: "/blocking", name: "Focus Shield", say: "Focus Shield blocks distracting sites while you focus. You can turn it on or off, and choose what to block." },
  { re: /focus timer|pomodoro|\bfocus\b/, path: "/focus", name: "Focus Timer", say: "Focus Timer is a Pomodoro. You can start it, pause it, reset it, or start deep work, and link the session to a task." },
  { re: /timetable|classes|class schedule/, path: "/timetable", name: "Timetable", say: "Timetable is your weekly classes. You can add a class, edit it, and see the free time left today. Class times stay separate from tasks." },
  { re: /rhythm|check-?ins|energy history/, path: "/rhythm", name: "Your Rhythm", say: "Your Rhythm keeps the energy check-ins you choose to save, so you can look back at low, medium, and high days." },
  { re: /all tasks|general tasks|to-?do|todo/, path: "/todo", name: "All tasks", say: "All tasks is the general list. You can add a task, mark it done, break it into steps, or brain-dump several at once." },
  { re: /calendar/, path: "/calendar", name: "Task calendar", say: "Task calendar shows the deadlines of tasks you created. Class times stay on the Timetable." },
  { re: /progress|dashboard|stats/, path: "/dashboard", name: "Progress", say: "Progress shows tasks done, focus minutes, your streak, and how the week looks." },
  { re: /mindful|meditation|breathe/, path: "/mindful", name: "Mindfulness", say: "Mindfulness plays a short audio practice. You can start or stop meditation, grounding, or sleep." },
  { re: /deadline/, path: "/deadline", name: "Deadlines", say: "Deadlines lists the upcoming due dates from your tasks." },
  { re: /connector|integration|gmail|slack/, path: "/connectors", name: "Integrations", say: "Integrations is where Gmail, Slack, and Google Calendar connect. Each one shows whether it is ready." },
  { re: /accessibility|voice/, path: "/accessibility", name: "Accessibility", say: "Accessibility is where you turn voice on, choose read-aloud, and turn hand gestures on for Today." },
  { re: /profile|settings|account/, path: "/settings", name: "your profile", say: "Your profile holds your name, email, theme, and links such as GitHub. You can also export or delete your account." },
  { re: /\btoday\b|home/, path: "/", name: "Today", say: "Today picks one next step from your energy. You can mark it done, make it smaller, rest, change it, or start focus." },
  { re: /\btasks?\b|academic/, path: "/tasks", name: "My Tasks", say: "My Tasks is for class work. You can add a task with a name, subject, type, priority, date, minutes, and notes, then search, edit, or delete it." },
];

function explainIntent(text, path) {
  const asking = (/\bwhat\b/.test(text) && /\b(?:do|can)\b/.test(text))
    || /\b(?:tell me about|how does|explain|describe)\b/.test(text);
  if (!asking) return null;
  const named = ABOUT.find((page) => page.re.test(text));
  const here = /\b(?:here|this section|this page)\b/.test(text);
  const page = named && !here ? named : ABOUT.find((item) => item.path === (path || "/"));
  if (!page) return null;
  return { action: "about", path: page.path, name: page.name, say: page.say };
}

const TASK_ORDER = ["title", "subject", "kind", "priority", "dueAt", "estimateMins", "notes"];
const TASK_QUESTIONS = {
  title: "What's the task name?",
  subject: "Which subject?",
  kind: "What type? Assignment, project, reading, or revision?",
  priority: "What priority? High, medium, or low?",
  dueAt: "What date?",
  estimateMins: "How many minutes?",
  notes: "Any notes? Say skip if you don't want any.",
};

function calendarResult(draft) {
  if (!draft.title) return { action: "calendar-draft", draft, ask: "title", say: "What's the task name?" };
  if (!draft.dueAt) return { action: "calendar-draft", draft, ask: "dueAt", say: "What date?" };
  const when = spokenDate(draft.dueAt);
  return { action: "calendar-save", draft, say: `Added ${draft.title}, due ${when}. It's on the task calendar.` };
}

function calendarTitle(original, lower, fragment) {
  const titled = taskTitle(original, lower, fragment).replace(/\s+\b(?:on|for|at|in|to|by)\s*$/i, "").trim();
  return titled;
}

function calendarIntent(text, original, now) {
  if (!/\b(?:add|create|make|schedule|put)\b/.test(text) || !/\bcalendar\b/.test(text)) return null;
  if (/^(?:open|show|go to|goto|take me|find|where(?:\s+is)?)\b/.test(text)) return null;
  const rest = text
    .replace(/\b(?:add|put|schedule|create|make)(?:\s+(?:it|this|that))?\s+(?:in|on|to|into)\s+(?:the\s+|my\s+)?(?:task\s+)?calendar\b/g, " ")
    .replace(/\b(?:in|on|to|into)\s+(?:the\s+|my\s+)?(?:task\s+)?calendar\b/g, " ")
    .replace(/\b(?:the\s+|my\s+)?task\s+calendar\b/g, " ")
    .replace(/\bcalendar\b/g, " ")
    .replace(/^(?:add|create|make|schedule|put)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:task|event|reminder)?\s*/, " ")
    .replace(/\s+/g, " ")
    .trim();
  return draftCalendar(rest, original, text, now, { title: undefined, dueAt: undefined });
}

function fillCalendar(draft, asking, original, text, now) {
  return draftCalendar(text, original, text, now, { ...draft }, asking);
}

function draftCalendar(rest, original, lower, now, draft, asking = "title") {
  const next = { ...draft };
  const found = pullDate(rest, now);
  if (found.date) next.dueAt = found.date.toISOString();
  if (asking === "title") {
    const fragment = (found.date ? found.rest : rest)
      .replace(/^(?:(?:a|an|the|it|this|that)\s+)+/, "")
      .replace(/\s+\b(?:on|for|at|in|to|by)\s*$/, "")
      .trim();
    const title = fragment ? calendarTitle(original, lower, fragment) : "";
    if (title) next.title = title;
  }
  return calendarResult(next);
}

function blankDraft() {
  return { title: undefined, subject: undefined, kind: undefined, priority: undefined, dueAt: undefined, estimateMins: undefined, notes: undefined };
}

function nextField(draft) {
  return TASK_ORDER.find((key) => draft[key] === undefined) || null;
}

export function taskQuestion(field) {
  return TASK_QUESTIONS[field] || "Say that once more.";
}

function taskResult(draft, heardBits, asking) {
  const ask = nextField(draft);
  const extra = heardBits.filter((bit) => bit && bit !== "Skipped");
  const echo = asking && draft[asking] !== undefined && extra.length <= 1 ? [] : extra;
  if (!ask) return { action: "task-save", draft };
  const say = echo.length ? `${echo.join(". ")}. ${TASK_QUESTIONS[ask]}` : TASK_QUESTIONS[ask];
  return { action: "task-draft", draft, ask, say };
}

function skipWord(text) {
  return /^(?:skip|none|nothing|no|nope|no thanks|leave it|no subject|no notes|no date|no deadline)$/.test(text);
}

function keepCase(original, lower, fragment) {
  const start = lower.indexOf(fragment);
  const chunk = start >= 0 ? original.slice(start, start + fragment.length) : fragment;
  return chunk.replace(/\s+/g, " ").replace(/[.,!?]+$/g, "").trim();
}

function continueTask(draft, asking, original, text, now) {
  const next = { ...draft };
  const heard = [];
  let rest = text;
  const pullLabel = (label) => {
    const match = rest.match(new RegExp(`\\b${label}\\s+(?:is|as|:)?\\s*(.+?)(?=\\s+(?:subject|type|kind|priority|date|deadline|minutes|mins|notes|note|name|called)\\b|$)`));
    if (!match) return null;
    rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
    return match[1].trim();
  };

  const subjectLabel = pullLabel("subject");
  if (subjectLabel && !skipWord(subjectLabel)) {
    next.subject = keepCase(original, text, subjectLabel);
    heard.push(`Subject ${next.subject}`);
  }
  const nameLabel = pullLabel("name") || pullLabel("called");
  if (nameLabel && !skipWord(nameLabel)) {
    next.title = keepCase(original, text, nameLabel);
    heard.push(next.title);
  }

  const kindLabel = pullLabel("type") || pullLabel("kind");
  const kindWord = `${kindLabel || ""} ${rest}`.match(/\b(assignment|project|reading|revision)\b/);
  if (kindWord && (kindLabel || asking === "kind" || new RegExp(`^${kindWord[1]}$`).test(text) || /\btype\b/.test(text))) {
    next.kind = kindWord[1];
    heard.push(next.kind[0].toUpperCase() + next.kind.slice(1));
    rest = rest.replace(kindWord[0], " ").replace(/\s+/g, " ").trim();
  }

  const priorityLabel = pullLabel("priority");
  const priorityWord = `${priorityLabel || ""} ${text}`.match(/\b(high|medium|low)\b/);
  if (priorityWord && (priorityLabel || asking === "priority" || /^(?:high|medium|low)$/.test(text) || /\bpriority\b/.test(text))) {
    next.priority = priorityWord[1];
    heard.push(`${next.priority} priority`);
    rest = rest.replace(new RegExp(`\\b${priorityWord[1]}\\b`), " ").replace(/\bpriority\b/, " ").replace(/\s+/g, " ").trim();
  }

  const mins = text.match(/\b(\d{1,3})\s*(?:minutes|mins|min)\b/);
  if (mins) {
    const count = Number(mins[1]);
    if (count >= 1 && count <= 1440) {
      next.estimateMins = count;
      heard.push(`${count} minutes`);
      rest = rest.replace(mins[0], " ").replace(/\s+/g, " ").trim();
    }
  } else if (asking === "estimateMins" && /^(\d{1,3})$/.test(text)) {
    const count = Number(text);
    if (count >= 1 && count <= 1440) {
      next.estimateMins = count;
      heard.push(`${count} minutes`);
      rest = "";
    }
  }

  const notesLabel = pullLabel("notes") || pullLabel("note");
  if (notesLabel) {
    next.notes = skipWord(notesLabel) ? "" : keepCase(original, text, notesLabel);
    heard.push(next.notes ? "Notes saved" : "No notes");
  }

  const found = pullDate(text, now);
  if (found.date) {
    next.dueAt = found.date.toISOString();
    heard.push(`Due ${found.date.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`);
    rest = (pullDate(rest, now).rest || "").trim();
  }

  if (asking === "title" && next.title === undefined && rest && !skipWord(rest)) {
    const value = taskTitle(original, text, rest);
    if (value) {
      next.title = value;
      heard.push(value);
    }
  }

  rest = rest
    .replace(/\b(?:subject|type|kind|priority|date|deadline|minutes|mins|notes|note|name|called)\b/g, " ")
    .replace(/^(?:(?:is|as|on|for|a|an|the|it)\s+)+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (skipWord(text) && asking && asking !== "title") {
    next[asking] = asking === "dueAt" || asking === "estimateMins" ? null : "";
    heard.push("Skipped");
  } else if (asking && next[asking] === undefined && rest) {
    if (asking === "subject") {
      const value = taskTitle(original, text, rest);
      if (value) {
        next.subject = value;
        heard.push(`Subject ${value}`);
      }
    } else if (asking === "notes") {
      next.notes = keepCase(original, text, rest);
      heard.push("Notes saved");
    }
  }

  return taskResult(next, heard, asking);
}

export function spokenDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" });
}
