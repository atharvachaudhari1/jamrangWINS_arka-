import { createGestureGate } from "./gestureGate";

export { GESTURES, GESTURE_HELP } from "./gestureGate";

const VISION_VERSION = "0.10.17";

// Camera frames stay in this browser tab. Nothing is uploaded or saved.
export async function startGestures({ video, onAction, onError, onReady }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    onError?.("This browser cannot use a camera. Buttons and the keyboard still work.");
    return null;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 }, audio: false });
  } catch (err) {
    onError?.(err?.name === "NotFoundError"
      ? "No camera was found. Buttons and the keyboard still work."
      : "Camera permission was blocked. Buttons and the keyboard still work.");
    return null;
  }

  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    release();
    onError?.("The camera preview could not start. Buttons and the keyboard still work.");
    return null;
  }

  let recognizer;
  try {
    const vision = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`);
    const files = await vision.FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`
    );
    recognizer = await vision.GestureRecognizer.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  } catch {
    release();
    onError?.("Hand gestures could not be loaded. Check your connection. Buttons and the keyboard still work.");
    return null;
  }

  const gate = createGestureGate();
  let stopped = false;
  let videoFrame = 0;
  let animationFrame = 0;
  onReady?.();

  function loop() {
    if (stopped) return;
    if (video.readyState >= 2) {
      try {
        const result = recognizer.recognizeForVideo(video, performance.now());
        const top = result?.gestures?.[0]?.[0];
        const action = gate(top?.categoryName, top?.score || 0, Date.now());
        if (action) onAction?.(action, top.categoryName);
      } catch {
        /* a dropped frame is skipped */
      }
    }
    if (video.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(loop);
    else animationFrame = requestAnimationFrame(loop);
  }
  loop();

  const onHidden = () => { if (document.hidden) controller.stop(); };
  document.addEventListener("visibilitychange", onHidden);

  const controller = {
    stop() {
      if (stopped) return;
      stopped = true;
      document.removeEventListener("visibilitychange", onHidden);
      if (videoFrame && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrame);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      try { recognizer?.close?.(); } catch { /* already closed */ }
      release();
    },
  };
  return controller;
}
