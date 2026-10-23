const mongoose = require('mongoose');

const subSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subscription: Object
});

module.exports = mongoose.model('Subscription', subSchema);
