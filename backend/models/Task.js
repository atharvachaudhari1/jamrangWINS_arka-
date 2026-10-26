const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: String,
  description: { type: String, default: '', maxlength: 2000 },
  dueAt: Date,
  estimateMins: Number,
  completed: { type: Boolean, default: false },
  completedAt: Date,
  subtasks: [{ title: String, estimateMins: Number, completed: { type: Boolean, default: false } }],
  importance: { type: Number, default: 1 },
  dreadScore: { type: Number, default: 3, min: 1, max: 5 },
  aiPriority: { type: String, enum: ['High', 'Medium', 'Low', null], default: null },
  kind: {
    type: String,
    enum: ['general', 'assignment', 'project', 'reading', 'revision'],
    default: 'general',
  },
  subject: { type: String, default: '', maxlength: 120 },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  postponedUntil: { type: Date, default: null },
  parentTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  meta: {
    source:   { type: String, default: null },
    sourceId: { type: String, default: null },
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Task', taskSchema);
