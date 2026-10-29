const mongoose = require('mongoose');

const recommendationEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['shown', 'started', 'completed', 'skipped', 'session_ended'],
    required: function requiredType() {
      return this.eventType === 'recommendation';
    },
  },
  eventType: {
    type: String,
    enum: ['recommendation', 'nudge', 'signalSummary'],
    default: 'recommendation',
  },
  nudge: {
    state: { type: String, enum: ['thrashing', 'frozen', 'avoidance', 'depleted'] },
    level: { type: Number, min: 1, max: 3 },
    kind: { type: String, enum: ['ambient', 'prompt', 'shrink', 'rest'] },
    action: { type: String, enum: ['accepted', 'dismissed', 'ignored'] },
    outcome: { type: String, enum: ['acted', 'rested', 'dismissed', 'ignored', 'no_change'] },
    secondsToAction: { type: Number, min: 0 },
    confidence: { type: Number, min: 0, max: 1 },
  },
  signals: {
    date: String,
    observedMinutes: { type: Number, min: 0, max: 1440 },
    idleMinutes: { type: Number, min: 0, max: 1440 },
    switches: { type: Number, min: 0, max: 10000 },
    frozenMinutes: { type: Number, min: 0, max: 1440 },
    thrashingMinutes: { type: Number, min: 0, max: 1440 },
    avoidanceMinutes: { type: Number, min: 0, max: 1440 },
    depletedMinutes: { type: Number, min: 0, max: 1440 },
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
