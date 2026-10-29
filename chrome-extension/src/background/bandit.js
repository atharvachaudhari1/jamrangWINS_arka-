const ARMS = ['ambient', 'prompt', 'shrink', 'cowork'];
const PRIORS = {
  ambient: { alpha: 2, beta: 2 },
  prompt: { alpha: 1.5, beta: 2 },
  shrink: { alpha: 1, beta: 2 },
  cowork: { alpha: 1, beta: 2 },
};
const LEVELS = { ambient: 1, prompt: 2, shrink: 3, cowork: 4 };
const BY_LEVEL = { 1: 'ambient', 2: 'prompt', 3: 'shrink', 4: 'cowork' };

export function armKind(arm) {
  if (typeof arm === 'number') return BY_LEVEL[arm] || null;
  return ARMS.includes(arm) ? arm : null;
}

export function armLevel(arm) {
  const kind = armKind(arm);
  return kind ? LEVELS[kind] : null;
}

export function bucketOf(now) {
  const hour = new Date(now).getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function blankArms() {
  return Object.fromEntries(ARMS.map((arm) => [arm, {
    alpha: PRIORS[arm].alpha,
    beta: PRIORS[arm].beta,
    samples: 0,
  }]));
}

function context(store, key) {
  return store?.contexts?.[key] || { updates: 0, arms: blankArms() };
}

function armRow(store, key, kind) {
  return context(store, key).arms[kind] || {
    alpha: PRIORS[kind].alpha,
    beta: PRIORS[kind].beta,
    samples: 0,
  };
}

export function rewardFor(outcome, secondsToAction) {
  if (outcome === 'acted') return secondsToAction > 300 ? 0.8 : 1;
  if (outcome === 'rested') return 1;
  if (outcome === 'no_change') return 0.2;
  if (outcome === 'ignored') return 0.15;
  return 0;
}

function blended(store, state, bucket, kind) {
  const specific = armRow(store, `${state}|${bucket}`, kind);
  const pool = armRow(store, `${state}|all`, kind);
  const updates = context(store, `${state}|${bucket}`).updates || 0;
  if (updates >= 5) return specific;
  return {
    alpha: specific.alpha + pool.alpha - PRIORS[kind].alpha,
    beta: specific.beta + pool.beta - PRIORS[kind].beta,
  };
}

function unit(rng) {
  const value = rng();
  if (value <= 0) return 1e-9;
  if (value >= 1) return 1 - 1e-9;
  return value;
}

function normal(rng) {
  const u = unit(rng);
  const v = unit(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function gammaSample(shape, rng) {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let x = 0;
    let v = 0;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = unit(rng);
    if (u < 1 - 0.0331 * (x ** 4)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return shape;
}

function betaSample(alpha, beta, rng) {
  const left = gammaSample(Math.max(alpha, 1e-3), rng);
  const right = gammaSample(Math.max(beta, 1e-3), rng);
  if (left + right === 0) return 0.5;
  return left / (left + right);
}

export function chooseArm(state, now, allowedArms, store = {}, rng = Math.random) {
  const allowed = (allowedArms || []).map(armKind).filter(Boolean);
  if (!allowed.length) return 'ambient';
  if (rng() < 0.1) return allowed[Math.floor(rng() * allowed.length) % allowed.length];
  let best = allowed[0];
  let bestScore = -1;
  const bucket = bucketOf(now);
  allowed.forEach((kind) => {
    const row = blended(store, state, bucket, kind);
    const score = betaSample(row.alpha, row.beta, rng);
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  });
  return best;
}

function apply(store, key, kind, reward) {
  const current = context(store, key);
  const row = current.arms[kind];
  const prior = PRIORS[kind];
  const arms = {
    ...current.arms,
    [kind]: {
      alpha: Math.max(prior.alpha, row.alpha * 0.98) + reward,
      beta: Math.max(prior.beta, row.beta * 0.98) + (1 - reward),
      samples: (row.samples || 0) + 1,
    },
  };
  return {
    ...store,
    contexts: {
      ...(store.contexts || {}),
      [key]: { updates: (current.updates || 0) + 1, arms },
    },
  };
}

export function updateArm(state, now, arm, outcome, secondsToAction, store = {}) {
  const kind = armKind(arm);
  if (!kind || state === 'depleted') return store || {};
  const reward = rewardFor(outcome, secondsToAction);
  const bucketKey = `${state}|${bucketOf(now)}`;
  return apply(apply(store || {}, bucketKey, kind, reward), `${state}|all`, kind, reward);
}

export function summarize(store = {}) {
  const result = {};
  Object.keys(store.contexts || {}).forEach((key) => {
    if (!key.endsWith('|all')) return;
    const state = key.slice(0, -4);
    result[state] = ARMS.map((arm) => {
      const row = armRow(store, key, arm);
      return {
        arm,
        samples: row.samples || 0,
        mean: row.alpha / (row.alpha + row.beta),
      };
    }).sort((a, b) => b.mean - a.mean || b.samples - a.samples);
  });
  return result;
}

export function seedPersona(now = Date.parse('2026-10-28T15:00:00')) {
  let store = {};
  for (let i = 0; i < 8; i += 1) {
    store = updateArm('frozen', now, 'prompt', 'acted', 40, store);
    store = updateArm('frozen', now, 'ambient', 'dismissed', null, store);
    store = updateArm('thrashing', now, 'ambient', 'acted', 30, store);
    store = updateArm('thrashing', now, 'prompt', 'dismissed', null, store);
  }
  return store;
}

export function allowedFromMax(maxLevel) {
  const allowed = [];
  for (let level = 1; level <= Math.min(3, maxLevel); level += 1) allowed.push(BY_LEVEL[level]);
  if (maxLevel >= 3) allowed.push('cowork');
  return allowed;
}
