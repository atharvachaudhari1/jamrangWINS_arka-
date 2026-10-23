const mongoose = require('mongoose');

const habitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  frequency: { type: String, enum: ['daily', 'weekly'], required: true },
  streak: { type: Number, default: 0 },
  completions: { type: [Date], default: [] },
  lastCompleted: Date,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Habit', habitSchema);
