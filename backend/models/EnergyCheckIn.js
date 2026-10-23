const mongoose = require('mongoose');

const energyCheckInSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  level: { type: Number, min: 1, max: 5, required: true },
  band: { type: String, enum: ['low', 'medium', 'high'], required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('EnergyCheckIn', energyCheckInSchema);
