const FIVE_MIN_MS = 5 * 60 * 1000;
const DWELL_LIMIT_MS = 25000;

function share(categoryMs, key) {
  const ms = categoryMs || {};
  const total = (ms.passive || 0) + (ms.comms || 0) + (ms.work || 0) + (ms.other || 0);
  if (!total) return 0;
  return (ms[key] || 0) / total;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function rateThreshold(baseline) {
  if (!baseline || typeof baseline.switchesPerMin !== 'number') return 2.5;
  return Math.max(2.5, baseline.switchesPerMin * 1.8);
}

export function detectState(snapshot, ctx = {}) {
  const energyLevel = ctx.energyLevel == null || ctx.energyLevel === '' ? null : Number(ctx.energyLevel);
  const stressHigh = !!ctx.stressHigh;
  const deadlineNear = !!ctx.deadlineNear;
  const readingMode = !!ctx.readingMode;
  const switchesPerMin = snapshot?.switchesPerMin || 0;
  const medianDwellMs = snapshot?.medianDwellMs || 0;
  const revisitLoop = !!snapshot?.revisitLoop;
  const switchEntropy = snapshot?.switchEntropy || 0;
  const focusedIdleMs = snapshot?.focusedIdleMs || 0;
  const current = snapshot?.current || null;
  const audible = !!current?.audible;
  const cat = current?.cat || null;
  const passiveShare = share(snapshot?.categoryMs, 'passive');
  const workShare = share(snapshot?.categoryMs, 'work');
  const threshold = rateThreshold(ctx.baseline);

  const thrashing = switchesPerMin >= threshold
    && medianDwellMs < DWELL_LIMIT_MS
    && (revisitLoop || switchEntropy >= 1.2);
  const frozen = !audible
    && !readingMode
    && (cat === 'work' || cat === 'other')
    && focusedIdleMs >= FIVE_MIN_MS;
  const avoidance = passiveShare >= 0.6 && deadlineNear && switchesPerMin < 2;
  const depleted = (stressHigh || (energyLevel != null && energyLevel <= 2))
    && (frozen || thrashing || workShare < 0.15);

  const thrashingReasons = [];
  if (switchesPerMin >= threshold) thrashingReasons.push('high switch rate');
  if (medianDwellMs < DWELL_LIMIT_MS) thrashingReasons.push('short dwell');
  if (revisitLoop) thrashingReasons.push('revisit loop');
  if (switchEntropy >= 1.2) thrashingReasons.push('high switch entropy');

  const frozenReasons = ['focused idle'];
  if (cat === 'work' || cat === 'other') frozenReasons.push('quiet tab');

  const avoidanceReasons = [];
  if (passiveShare >= 0.6) avoidanceReasons.push('passive time');
  if (deadlineNear) avoidanceReasons.push('deadline near');
  if (switchesPerMin < 2) avoidanceReasons.push('low switch rate');

  function thrashingConfidence() {
    const rateRatio = threshold ? switchesPerMin / threshold : 1;
    const dwellGap = (DWELL_LIMIT_MS - medianDwellMs) / DWELL_LIMIT_MS;
    let score = 0.5;
    score += Math.min(0.25, Math.max(0, rateRatio - 1) * 0.4);
    score += Math.min(0.2, Math.max(0, dwellGap) * 0.35);
    if (revisitLoop) score += 0.15;
    if (switchEntropy >= 1.5) score += 0.1;
    return clamp01(score);
  }

  function frozenConfidence() {
    const extra = (focusedIdleMs - FIVE_MIN_MS) / FIVE_MIN_MS;
    let score = 0.5 + Math.min(0.35, Math.max(0, extra) * 0.25);
    if (cat === 'work') score += 0.12;
    return clamp01(score);
  }

  function avoidanceConfidence() {
    let score = 0.5;
    score += Math.min(0.3, Math.max(0, passiveShare - 0.6) * 1.2);
    score += switchesPerMin <= 1 ? 0.15 : 0.05;
    return clamp01(score);
  }

  function depletedConfidence() {
    let score = 0.62;
    if (stressHigh) score += 0.12;
    if (energyLevel != null && energyLevel <= 2) score += 0.12;
    if (thrashing) score += 0.08;
    if (frozen) score += 0.08;
    if (workShare < 0.15) score += 0.06;
    return clamp01(score);
  }

  const depletedReasons = [];
  if (energyLevel != null && energyLevel <= 2) depletedReasons.push('low energy');
  if (stressHigh) depletedReasons.push('high stress');
  if (thrashing) depletedReasons.push(...thrashingReasons);
  if (frozen) depletedReasons.push(...frozenReasons);
  if (workShare < 0.15) depletedReasons.push('low work share');

  let best = null;
  if (depleted) {
    best = { state: 'depleted', confidence: depletedConfidence(), reasons: [...new Set(depletedReasons)] };
  } else {
    const candidates = [];
    if (thrashing) candidates.push({ state: 'thrashing', confidence: thrashingConfidence(), reasons: thrashingReasons });
    if (frozen) candidates.push({ state: 'frozen', confidence: frozenConfidence(), reasons: frozenReasons });
    if (avoidance) candidates.push({ state: 'avoidance', confidence: avoidanceConfidence(), reasons: avoidanceReasons });
    best = candidates.reduce((top, item) => (!top || item.confidence > top.confidence ? item : top), null);
  }

  if (!best) return { state: 'ok', confidence: 1, reasons: [] };
  if (best.confidence < 0.6) return { state: 'uncertain', confidence: best.confidence, reasons: best.reasons };
  return best;
}
