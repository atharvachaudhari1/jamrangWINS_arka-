const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
  challenge: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  kind: { type: String, enum: ['register', 'login'], required: true },
  expiresAt: { type: Date, required: true },
});

challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('WebAuthnChallenge', challengeSchema);
