const mongoose = require('mongoose');

const recommendationEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['shown', 'started', 'completed', 'skipped', 'session_ended'],
    required: true,
  },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  topTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  rankedTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  energyLevel: { type: Number, min: 1, max: 5 },
  hour: Number,
  dayOfWeek: Number,
  title: String,
  category: String,
  dreadScore: Number,
  importance: Number,
  estimateMins: Number,
  deadlineDays: Number,
  overdue: Boolean,
  score: Number,
  reason: String,
  wasRecommended: Boolean,
  minutesSpent: Number,
  plannedMins: Number,
  actualMins: Number,
  distractionCount: Number,
  createdAt: { type: Date, default: Date.now },
});

recommendationEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('RecommendationEvent', recommendationEventSchema);
