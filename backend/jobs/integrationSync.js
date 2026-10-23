const User = require('../models/User');
const Task = require('../models/Task');
const gmailService = require('../services/gmailService');
const gcalService  = require('../services/gcalService');
const slackService = require('../services/slackService');

async function upsertTasks(userId, candidates) {
  for (const c of candidates) {
    if (!c.sourceId) continue;
    const exists = await Task.findOne({ userId, 'meta.sourceId': c.sourceId });
    if (!exists) {
      await Task.create({ userId, title: c.title, dueAt: c.dueAt || null, meta: { source: c.source, sourceId: c.sourceId } });
    }
  }
}

async function syncUser(user) {
  const integrations = user.integrations || {};

  // Gmail
  if (integrations.gmail?.accessToken) {
    try {
      let token = integrations.gmail.accessToken;
      try {
        const candidates = await gmailService.fetchTaskCandidates(token);
        await upsertTasks(user._id, candidates);
      } catch (err) {
        if (err.response?.status === 401 && integrations.gmail.refreshToken) {
          token = await gmailService.refreshAccessToken(integrations.gmail.refreshToken);
          user.integrations.gmail.accessToken = token;
          const candidates = await gmailService.fetchTaskCandidates(token);
          await upsertTasks(user._id, candidates);
        }
      }
      user.integrations.gmail.lastSyncedAt = new Date();
    } catch (err) {
      console.error(`[integrationSync] Gmail failed for user ${user._id}:`, err.message);
    }
  }

  // Google Calendar
  if (integrations.gcal?.accessToken) {
    try {
      let token = integrations.gcal.accessToken;
      try {
        const candidates = await gcalService.fetchDeadlineCandidates(token);
        await upsertTasks(user._id, candidates);
      } catch (err) {
        if (err.response?.status === 401 && integrations.gcal.refreshToken) {
          token = await gcalService.refreshAccessToken(integrations.gcal.refreshToken);
          user.integrations.gcal.accessToken = token;
          const candidates = await gcalService.fetchDeadlineCandidates(token);
          await upsertTasks(user._id, candidates);
        }
      }
      user.integrations.gcal.lastSyncedAt = new Date();
    } catch (err) {
      console.error(`[integrationSync] GCal failed for user ${user._id}:`, err.message);
    }
  }

  // Slack
  if (integrations.slack?.accessToken) {
    try {
      const candidates = await slackService.fetchTaskCandidates(integrations.slack.accessToken);
      await upsertTasks(user._id, candidates);
      user.integrations.slack.lastSyncedAt = new Date();
    } catch (err) {
      console.error(`[integrationSync] Slack failed for user ${user._id}:`, err.message);
    }
  }

  await user.save();
}

module.exports = async function integrationSync() {
  // Only process users who have at least one integration connected
  const users = await User.find({
    $or: [
      { 'integrations.gmail.accessToken': { $ne: null } },
      { 'integrations.gcal.accessToken':  { $ne: null } },
      { 'integrations.slack.accessToken': { $ne: null } },
    ],
  });

  console.log(`[integrationSync] syncing ${users.length} users`);
  for (const user of users) {
    await syncUser(user);
  }
};
