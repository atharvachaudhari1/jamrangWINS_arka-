const mongoose = require('mongoose');

const OUTCOMES = ['shown', 'accepted', 'dismissed', 'completed', 'abandoned'];

// Privacy: store only counts, outcomes, and timestamps — never page titles, URLs, or tab names.
const nudgeEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  outcome: { type: String, enum: OUTCOMES, default: 'shown' },
  countInWindow: { type: Number, default: 0 },
  threshold: { type: Number, default: 3 },
  focusElapsedSecs: { type: Number, default: 0 },
  energyLevel: { type: Number, min: 1, max: 5 },
  mindfulnessSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MindfulnessSession' },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
});

nudgeEventSchema.index({ userId: 1, createdAt: -1 });

const NudgeEvent = mongoose.model('NudgeEvent', nudgeEventSchema);
NudgeEvent.OUTCOMES = OUTCOMES;

module.exports = NudgeEvent;
