const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  value: { type: String, required: true },
  label: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  notes: { type: String, default: '' },
});

const scheduleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  startTime: { type: String, default: '09:00' },
  endTime: { type: String, default: '17:00' },
  days: { type: [Number], default: [1, 2, 3, 4, 5] },
}, { _id: false });

const blockingRuleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  isEnabled: { type: Boolean, default: false },
  blockedSites: { type: [entrySchema], default: [] },
  blockedApps: { type: [entrySchema], default: [] },
  whitelist: { type: [entrySchema], default: [] },
  schedule: { type: scheduleSchema, default: () => ({}) },
  pausedUntil: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BlockingRule', blockingRuleSchema);
