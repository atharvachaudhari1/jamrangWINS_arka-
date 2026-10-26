const DAYS = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function parseClock(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function dayIndex(value) {
  if (typeof value === 'number' && value >= 0 && value <= 6) return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(DAYS, text)) return DAYS[text];
  if (/^[0-6]$/.test(text)) return Number(text);
  return null;
}

function normalizeRows(rows) {
  const blocks = [];
  const warnings = [];
  rows.slice(0, 200).forEach((row, index) => {
    const title = String(row.title || row.name || '').trim();
    const dayOfWeek = dayIndex(row.day ?? row.dayOfWeek);
    const startMinutes = Number.isFinite(Number(row.startMinutes)) && row.startMinutes !== ''
      ? Number(row.startMinutes)
      : parseClock(row.start || row.startTime);
    const endMinutes = Number.isFinite(Number(row.endMinutes)) && row.endMinutes !== ''
      ? Number(row.endMinutes)
      : parseClock(row.end || row.endTime);

    if (!title || dayOfWeek == null || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
      warnings.push(`Row ${index + 1} needs a title, day, start, and end.`);
      return;
    }
    if (startMinutes < 0 || endMinutes > 1440) {
      warnings.push(`Row ${index + 1} has a time outside the day.`);
      return;
    }
    blocks.push({
      title: title.slice(0, 140),
      location: String(row.location || row.room || '').trim().slice(0, 140),
      dayOfWeek,
      startMinutes,
      endMinutes,
      source: 'manual',
    });
  });

  if (!blocks.length) {
    return { blocks: [], warnings, error: warnings[0] || 'No classes were found in that file.' };
  }
  return { blocks, warnings, error: null };
}

function parseTimetableText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { blocks: [], warnings: [], error: 'The file is empty.' };
  if (trimmed.length > 100000) return { blocks: [], warnings: [], error: 'That file is too large.' };

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      const rows = Array.isArray(data) ? data : data.blocks || data.classes;
      if (!Array.isArray(rows)) {
        return { blocks: [], warnings: [], error: 'JSON should be a list of classes.' };
      }
      return normalizeRows(rows);
    } catch {
      return { blocks: [], warnings: [], error: 'That JSON could not be read.' };
    }
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0].toLowerCase();
  const start = header.includes('title') && header.includes('day') ? 1 : 0;
  const rows = lines.slice(start).map((line) => {
    const [title, day, startTime, endTime, location] = line.split(',').map((part) => part.trim());
    return { title, day, start: startTime, end: endTime, location };
  });
  return normalizeRows(rows);
}

function blockKey(block) {
  return [String(block.title).trim().toLowerCase(), block.dayOfWeek, block.startMinutes, block.endMinutes].join('|');
}

// Marks each parsed row as new, a duplicate of a saved or earlier row, and
// whether it overlaps another class. Nothing is written here.
function reviewImport(parsedBlocks, existingBlocks) {
  const seen = new Set((existingBlocks || []).filter((b) => !b.date).map(blockKey));
  const accepted = [];
  const rows = (parsedBlocks || []).map((block) => {
    const key = blockKey(block);
    if (seen.has(key)) return { ...block, status: 'duplicate' };
    seen.add(key);
    const clash = [...(existingBlocks || []).filter((b) => !b.date), ...accepted].find((other) =>
      other.dayOfWeek === block.dayOfWeek
      && other.startMinutes < block.endMinutes
      && block.startMinutes < other.endMinutes);
    accepted.push(block);
    return { ...block, status: 'new', conflictWith: clash ? clash.title : null };
  });
  return {
    rows,
    newCount: rows.filter((row) => row.status === 'new').length,
    duplicateCount: rows.filter((row) => row.status === 'duplicate').length,
    conflictCount: rows.filter((row) => row.conflictWith).length,
  };
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function validTimeZone(timeZone) {
  if (!timeZone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return null;
  }
}

// Day of week and minutes past midnight as the student sees them, not the server.
function localParts(date, timeZone) {
  const zone = validTimeZone(timeZone);
  if (!zone) return { dayOfWeek: date.getDay(), minutes: date.getHours() * 60 + date.getMinutes() };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { dayOfWeek: WEEKDAYS[parts.weekday], minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

// Calendar events become dated timetable blocks. All-day and malformed events are skipped.
function mapCalendarEvents(events, timeZone) {
  const blocks = [];
  let skipped = 0;
  for (const event of events || []) {
    if (!event.start || event.allDay) { skipped += 1; continue; }
    const start = new Date(event.start);
    const end = new Date(event.end || event.start);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) { skipped += 1; continue; }
    const from = localParts(start, timeZone);
    const to = localParts(end, timeZone);
    const sameDay = to.dayOfWeek === from.dayOfWeek && to.minutes > from.minutes;
    blocks.push({
      title: String(event.title || 'Calendar event').slice(0, 140),
      location: String(event.location || '').slice(0, 140),
      dayOfWeek: from.dayOfWeek,
      startMinutes: from.minutes,
      endMinutes: sameDay ? to.minutes : 1440,
      date: start,
      source: 'gcal',
      sourceId: event.sourceId || null,
    });
  }
  return { blocks, skipped };
}

module.exports = { parseTimetableText, parseClock, dayIndex, reviewImport, localParts, mapCalendarEvents, validTimeZone };
