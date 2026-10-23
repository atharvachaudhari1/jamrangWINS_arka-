const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Task = require("../models/Task");
const { rankTasks } = require("../ml/priorityModel");
const { historyRates, logShown } = require("../services/recommendationLog");

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.replace("Bearer ", "");
  if (!token) return res.status(401).end();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).end();
  }
}

/**
 * POST /priority/prioritize
 * Rank open tasks with the shared heuristic and record what was shown.
 */
router.post("/prioritize", auth, async (req, res) => {
  try {
    const tasks = await Task.find({
      userId: req.userId,
      completed: false,
    }).lean();

    if (!tasks.length) return res.json({ tasks: [] });

    const energyLevel = parseInt(req.body?.energyLevel ?? req.query.energyLevel ?? "3", 10);
    const rates = await historyRates(req.userId);
    const ranked = rankTasks(tasks, { energyLevel, ...rates });
    await logShown({ userId: req.userId, energyLevel, ranked });

    res.json({
      tasks: ranked.map((row) => ({
        ...row.task,
        aiPriority: row.priority,
        priority_score: row.score,
        recommendation: row.reason,
        category: row.category,
      })),
      model_used: "heuristic",
    });
  } catch (err) {
    console.error("[priority] error:", err.message);
    res.status(500).json({ error: "Prioritization failed" });
  }
});

/**
 * POST /priority/train
 * Per-user forest training stays off until the recommendation event log
 * is the training source.
 */
router.post("/train", auth, async (req, res) => {
  res.json({
    status: "skipped",
    reason: "Per-user model training is paused until recommendation events are the training source",
  });
});

module.exports = router;
