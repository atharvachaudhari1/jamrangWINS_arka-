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
    blocks.push({
      title: title.slice(0, 140),
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
    const [title, day, startTime, endTime] = line.split(',').map((part) => part.trim());
    return { title, day, start: startTime, end: endTime };
  });
  return normalizeRows(rows);
}

module.exports = { parseTimetableText, parseClock, dayIndex };
