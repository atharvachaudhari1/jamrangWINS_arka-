export const SIGNAL_HISTORY_KEY = 'doorway_signalHistory';
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(at) {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function updateDailySignalHistory(history, snapshot, state, now) {
  const rows = Array.isArray(history) ? history.map((row) => ({ ...row })) : [];
  const key = dayKey(now);
  let row = rows.find((item) => item.date === key);
  if (!row) {
    row = { date: key, observedMinutes: 0, idleMinutes: 0, switches: 0, frozenMinutes: 0, thrashingMinutes: 0, avoidanceMinutes: 0, depletedMinutes: 0, lastSwitchAt: 0, lastSampleAt: 0 };
    rows.push(row);
  }
  const elapsed = row.lastSampleAt ? Math.min(2, Math.max(0, Math.round((now - row.lastSampleAt) / 60000))) : 0;
  row.observedMinutes += elapsed;
  if ((snapshot?.focusedIdleMs || 0) >= 60_000) row.idleMinutes += elapsed;
  const stateKey = `${state}Minutes`;
  if (['frozen', 'thrashing', 'avoidance', 'depleted'].includes(state)) row[stateKey] += elapsed;
  (snapshot?.switchTimes || []).forEach((at) => {
    if (at > row.lastSwitchAt) {
      row.switches += 1;
      row.lastSwitchAt = at;
    }
  });
  row.lastSampleAt = now;
  return rows.filter((item) => now - new Date(`${item.date}T00:00:00`).getTime() < 30 * DAY_MS).slice(-30);
}
