import { notify } from "./notify";

const scheduled = new Map();

/**
 * Schedule a deadline notification
 */
export function scheduleDeadline(task) {
  if (!task.dueAt || task.completed) return;

  const dueTime = new Date(task.dueAt).getTime();
  const now = Date.now();
  const delay = dueTime - now;

  if (delay <= 0) return;

  // Avoid duplicate timers
  if (scheduled.has(task._id)) {
    clearTimeout(scheduled.get(task._id));
  }

  const timerId = setTimeout(() => {
    notify(
      "⏰ Task Deadline",
      task.customReminderMessage ||
        `"${task.title}" is due now. Start immediately.`
    );
    scheduled.delete(task._id);
  }, delay);

  scheduled.set(task._id, timerId);
}

/**
 * Clear a scheduled deadline (if task is completed/deleted)
 */
export function clearDeadline(taskId) {
  if (scheduled.has(taskId)) {
    clearTimeout(scheduled.get(taskId));
    scheduled.delete(taskId);
  }
}
