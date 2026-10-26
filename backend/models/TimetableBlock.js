const mongoose = require('mongoose');

const timetableBlockSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 140 },
  location: { type: String, default: '', maxlength: 140 },
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  startMinutes: { type: Number, min: 0, max: 1440, required: true },
  endMinutes: { type: Number, min: 1, max: 1440, required: true },
  date: { type: Date, default: null },
  source: { type: String, enum: ['manual', 'gcal'], default: 'manual' },
  sourceId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TimetableBlock', timetableBlockSchema);
