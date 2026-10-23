const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String, // pomodoro, deep, deadline
  subject: String,
  durationMins: Number,
  startedAt: { type: Date, default: Date.now },
  completedAt: Date
});

module.exports = mongoose.model('Session', sessionSchema);
