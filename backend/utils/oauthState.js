const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const PURPOSE = 'oauth-connect';
const used = new Map();

function sweep(now) {
  for (const [nonce, expires] of used) if (expires < now) used.delete(nonce);
}

// Signed, short-lived, single-use state so a callback cannot be pointed at another account.
function signState(userId, provider) {
  const nonce = crypto.randomBytes(16).toString('hex');
  return jwt.sign({ purpose: PURPOSE, uid: String(userId), provider, nonce }, process.env.JWT_SECRET, { expiresIn: '10m' });
}

function verifyState(state, provider) {
  if (!state || typeof state !== 'string') return null;
  let payload;
  try {
    payload = jwt.verify(state, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (payload.purpose !== PURPOSE || payload.provider !== provider || !payload.uid || !payload.nonce) return null;
  const now = Date.now();
  sweep(now);
  if (used.has(payload.nonce)) return null;
  used.set(payload.nonce, (payload.exp || 0) * 1000 || now + 10 * 60 * 1000);
  return payload.uid;
}

module.exports = { signState, verifyState };
