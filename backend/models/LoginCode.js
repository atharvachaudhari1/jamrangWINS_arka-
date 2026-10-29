const mongoose = require('mongoose');

const loginCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  kind: { type: String, enum: ['college', 'work'], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

loginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginCode', loginCodeSchema);
