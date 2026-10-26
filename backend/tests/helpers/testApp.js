const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || 'doorway-test-secret';

const User = require('../../models/User');

// Builds the API without server.js, so tests never touch the real database,
// cron jobs, or the network listener. Each test file uses its own database.
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '50kb' }));
  app.use('/api/tasks', require('../../routes/tasks'));
  app.use('/api/planner', require('../../routes/planner'));
  app.use('/api/timetable', require('../../routes/timetable'));
  app.use('/api/rhythm', require('../../routes/rhythm'));
  app.use('/api/integrations', require('../../routes/integrations'));
  app.use('/api/accessibility', require('../../routes/speech'));
  app.use('/api/account', require('../../routes/account'));
  app.use('/api/profile', require('../../routes/profile'));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: 'Something went wrong on the server. Please try again.' }));
  return app;
}

async function connect(name) {
  const base = process.env.MONGO_URI_TEST_BASE || 'mongodb://127.0.0.1:27017';
  await mongoose.connect(`${base}/doorway_test_${name}`);
  await mongoose.connection.db.dropDatabase();
}

async function disconnect() {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
}

async function makeUser(label) {
  const user = await User.create({
    name: label,
    email: `${label.toLowerCase()}@test.doorway`,
    googleId: `google-${label}-${Date.now()}-${Math.random()}`,
  });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

module.exports = { buildApp, connect, disconnect, makeUser };
