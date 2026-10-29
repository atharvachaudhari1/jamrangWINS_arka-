const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  estimateMins: { type: Number, default: 45, min: 5, max: 240 },
  importance: { type: Number, default: 3, min: 1, max: 5 },
  confidence: { type: Number, default: 3, min: 1, max: 5 },
  completed: { type: Boolean, default: false },
});

const subjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  examAt: { type: Date, default: null },
  topics: { type: [topicSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

subjectSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);
