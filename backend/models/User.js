const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  accessToken:  { type: String, default: null },
  refreshToken: { type: String, default: null },
  connectedAt:  { type: Date, default: null },
  lastSyncedAt: { type: Date, default: null },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, maxlength: 100 },
  email: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say', ''],
    default: '',
  },
  preferredTheme: {
    type: String,
    enum: ['dark', 'light'],
    default: 'dark',
  },
  availableStudyMins: { type: Number, default: 120, min: 15, max: 720 },
  education: {
    department: { type: String, default: '', maxlength: 120 },
    program: { type: String, default: '', maxlength: 120 },
    year: { type: String, default: '', maxlength: 40 },
    semester: { type: String, default: '', maxlength: 40 },
    dailyStudyMins: { type: Number, default: 120, min: 15, max: 720 },
    setupComplete: { type: Boolean, default: false },
  },
  rhythmEnabled: { type: Boolean, default: false },
  restUntil: { type: Date, default: null },
  pinnedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  publicProfile: {
    name: { type: String, default: '', maxlength: 100 },
    github: { type: String, default: '', maxlength: 300 },
    linkedin: { type: String, default: '', maxlength: 300 },
    portfolio: { type: String, default: '', maxlength: 300 },
    email: { type: String, default: '', maxlength: 200 },
  },
  googleId: { type: String, required: true, unique: true },
  passkeys: [{
    credentialId: { type: String, required: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, default: 0 },
    transports: [{ type: String }],
  }],
  integrations: {
    gmail: { type: integrationSchema, default: () => ({}) },
    gcal:  { type: integrationSchema, default: () => ({}) },
    slack: { type: integrationSchema, default: () => ({}) },
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
