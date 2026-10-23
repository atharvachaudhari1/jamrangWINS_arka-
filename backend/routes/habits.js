const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Habit = require('../models/Habit');

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).end();
  }
}

// GET /api/habits — list habits (optionally filtered by ?frequency=daily|weekly)
router.get('/', auth, async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.frequency) filter.frequency = req.query.frequency;
    const habits = await Habit.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ habits });
  } catch (err) {
    console.error('[habits] list error:', err.message);
    res.status(500).json({ error: 'Failed to list habits' });
  }
});

// POST /api/habits — create a habit
router.post('/', auth, async (req, res) => {
  try {
    const { name, frequency } = req.body;
    if (!name || !['daily', 'weekly'].includes(frequency)) {
      return res.status(400).json({ error: 'name and frequency (daily|weekly) are required' });
    }
    const habit = await Habit.create({ userId: req.userId, name, frequency });
    req.app.get('io')?.to(`user:${req.userId}`).emit('habit:created', habit);
    res.status(201).json({ habit });
  } catch (err) {
    console.error('[habits] create error:', err.message);
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

// GET /api/habits/:id — get one habit
router.get('/:id', auth, async (req, res) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.userId }).lean();
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    res.json({ habit });
  } catch (err) {
    console.error('[habits] get error:', err.message);
    res.status(500).json({ error: 'Failed to get habit' });
  }
});

// PUT /api/habits/:id — update name/frequency (streak fields are managed by /complete)
router.put('/:id', auth, async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.streak;
    delete updates.completions;
    delete updates.lastCompleted;
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    req.app.get('io')?.to(`user:${req.userId}`).emit('habit:updated', habit);
    res.json({ habit });
  } catch (err) {
    console.error('[habits] update error:', err.message);
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

// DELETE /api/habits/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const habit = await Habit.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    req.app.get('io')?.to(`user:${req.userId}`).emit('habit:deleted', { _id: req.params.id });
    res.json({ message: 'Habit deleted' });
  } catch (err) {
    console.error('[habits] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});

// POST /api/habits/:id/complete — mark done today and update streak
router.post('/:id/complete', auth, async (req, res) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.userId });
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const alreadyDone = habit.completions.some((d) => {
      const cd = new Date(d);
      return (
        cd.getFullYear() === today.getFullYear() &&
        cd.getMonth() === today.getMonth() &&
        cd.getDate() === today.getDate()
      );
    });
    if (alreadyDone) return res.status(409).json({ error: 'Already completed today' });

    if (habit.lastCompleted) {
      const lastDate = new Date(habit.lastCompleted);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const isConsecutive =
        habit.frequency === 'daily'
          ? lastDate >= yesterday
          : lastDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      habit.streak = isConsecutive ? habit.streak + 1 : 1;
    } else {
      habit.streak = 1;
    }

    habit.lastCompleted = now;
    habit.completions.push(now);
    await habit.save();

    req.app.get('io')?.to(`user:${req.userId}`).emit('habit:updated', habit);
    res.json({ habit, streak: habit.streak });
  } catch (err) {
    console.error('[habits] complete error:', err.message);
    res.status(500).json({ error: 'Failed to complete habit' });
  }
});

module.exports = router;
