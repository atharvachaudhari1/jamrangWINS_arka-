// Hand shapes only. No face, gaze, emotion, or identity is ever read.
export const GESTURES = {
  Thumb_Up: "confirm",
  Open_Palm: "stop",
  Pointing_Up: "smaller",
  Victory: "change",
  Closed_Fist: "notnow",
};

export const GESTURE_HELP = [
  ["Thumb up", "Do it, or confirm a question on screen"],
  ["Open palm", "Stop: cancel, close a panel, or stop reading"],
  ["Point up", "Smaller (shows a preview first)"],
  ["Victory (two fingers)", "Change task"],
  ["Closed fist", "Not now (asks you to confirm)"],
];

// A gesture only counts after it is held steadily above the confidence
// threshold. Holding it does not repeat: the hand has to drop or change,
// and the cooldown has to pass, before anything fires again.
export function createGestureGate({ threshold = 0.75, stableFrames = 4, cooldownMs = 2000 } = {}) {
  let candidate = null;
  let count = 0;
  let lastFiredAt = -Infinity;
  let latched = null;

  return function feed(name, score, now) {
    const action = GESTURES[name];
    if (!action || score < threshold) {
      candidate = null;
      count = 0;
      latched = null;
      return null;
    }
    if (latched === name) return null;
    latched = null;
    if (candidate !== name) {
      candidate = name;
      count = 1;
    } else {
      count += 1;
    }
    if (count < stableFrames || now - lastFiredAt < cooldownMs) return null;
    lastFiredAt = now;
    latched = name;
    candidate = null;
    count = 0;
    return action;
  };
}
