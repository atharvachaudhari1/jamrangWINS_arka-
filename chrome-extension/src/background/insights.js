const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function rate(rows) {
  if (!rows.length) return 0;
  return rows.filter((row) => row.outcome === 'acted').length / rows.length;
}

function comparisonLine(rows) {
  const ambient = rows.filter((row) => row.kind === 'ambient');
  const prompts = rows.filter((row) => row.kind === 'prompt');
  if (ambient.length < 5 || prompts.length < 5) return 'Not enough data yet';
  if (rate(prompts) > rate(ambient)) return 'Prompts help you more than ambient tints';
  return 'These look similar so far';
}

export function summarizeHistory(history, now) {
  const rows = (Array.isArray(history) ? history : []).filter((row) => row && typeof row.at === 'number' && now - row.at <= WEEK_MS && now >= row.at);
  const shown = rows.length;
  const counts = {};
  rows.forEach((row) => {
    if (!row.state) return;
    counts[row.state] = (counts[row.state] || 0) + 1;
  });
  const topState = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    shown,
    acceptedPct: percent(rows.filter((row) => row.action === 'accepted').length, shown),
    dismissedPct: percent(rows.filter((row) => row.action === 'dismissed').length, shown),
    ignoredPct: percent(rows.filter((row) => row.action === 'ignored').length, shown),
    medianSecondsToAction: median(rows.map((row) => row.secondsToAction).filter((value) => typeof value === 'number')),
    topState,
    restCompleted: rows.filter((row) => row.outcome === 'rested').length,
    line: comparisonLine(rows),
  };
}
