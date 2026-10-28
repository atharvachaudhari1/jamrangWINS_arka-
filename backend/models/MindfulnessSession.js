const mongoose = require('mongoose');

const TYPES = ['meditation', 'grounding', 'sleep', 'breathing'];
const TRIGGERS = ['manual', 'recommendation', 'nudge'];

const mindfulnessSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: TYPES, required: true },
  plannedSecs: { type: Number, required: true, min: 1 },
  completedSecs: { type: Number, default: 0, min: 0 },
  completed: { type: Boolean, default: false },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  energyBefore: { type: Number, min: 1, max: 5 },
  energyAfter: { type: Number, min: 1, max: 5 },
  distractionBefore: { type: Number, default: 0 },
  triggeredBy: { type: String, enum: TRIGGERS, default: 'manual' },
});

mindfulnessSessionSchema.index({ userId: 1, startedAt: -1 });

const MindfulnessSession = mongoose.model('MindfulnessSession', mindfulnessSessionSchema);
MindfulnessSession.TYPES = TYPES;
MindfulnessSession.TRIGGERS = TRIGGERS;

module.exports = MindfulnessSession;
