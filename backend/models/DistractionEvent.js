const mongoose = require('mongoose');

const distractionEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  tabSwitchCount: { type: Number, default: 0 },
  sessionType: { type: String, enum: ['pomodoro', 'deep', 'deadline'], default: 'pomodoro' },
  sessionDurationMins: Number,
  energyLevel: { type: Number, min: 1, max: 5 },
  hourOfDay: Number,
  dayOfWeek: Number,
  recordedAt: { type: Date, default: Date.now },
});

distractionEventSchema.index({ userId: 1, recordedAt: -1 });

module.exports = mongoose.model('DistractionEvent', distractionEventSchema);
