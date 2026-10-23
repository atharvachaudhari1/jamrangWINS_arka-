const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Task = require("../models/Task");
const Session = require("../models/Session");

// auth middleware
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.replace("Bearer ", "");
  if (!token) return res.status(401).end();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).end();
  }
}

// DAILY
router.get("/daily", auth, async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const tasks = await Task.find({
    userId: req.userId,
    completed: true,
    completedAt: { $gte: start }
  });

  const sessions = await Session.find({
    userId: req.userId,
    completedAt: { $gte: start }
  });

  res.json({
    tasksCompleted: tasks.length,
    totalSessionMins: sessions.reduce((a, s) => a + s.durationMins, 0)
  });
});

// WEEKLY
router.get("/weekly", auth, async (req, res) => {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const tasks = await Task.find({
    userId: req.userId,
    completed: true,
    completedAt: { $gte: start }
  });

  const sessions = await Session.find({
    userId: req.userId,
    completedAt: { $gte: start }
  });

  res.json({ tasks, sessions });
});

// MONTHLY
router.get("/monthly", auth, async (req, res) => {
  const start = new Date();
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  const tasks = await Task.find({
    userId: req.userId,
    completed: true,
    completedAt: { $gte: start }
  });

  const sessions = await Session.find({
    userId: req.userId,
    completedAt: { $gte: start }
  });

  res.json({ tasks, sessions });
});

module.exports = router;
