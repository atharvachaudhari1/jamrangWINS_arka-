const GESTURES = {
  Thumb_Up: "do",
  Open_Palm: "rest",
  Pointing_Up: "smaller",
  Closed_Fist: "notnow",
  Victory: "change",
};

const VISION_VERSION = "0.10.17";

export const GESTURE_HELP = [
  ["Thumb up", "Do it"],
  ["Open palm", "Rest"],
  ["Point up", "Smaller"],
  ["Closed fist", "Not now"],
  ["Victory", "Change"],
];

export async function startGestures({ video, onAction, onError }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  } catch {
    onError?.("Camera permission was blocked. Buttons and the keyboard still work.");
    return null;
  }

  video.srcObject = stream;
  await video.play();

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
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    onError?.("Hand gestures could not be loaded. Buttons and the keyboard still work.");
    return null;
  }

  let stopped = false;
  let lastAt = 0;
  let frame = 0;

  async function loop() {
    if (stopped) return;
    if (video.readyState >= 2) {
      const result = recognizer.recognizeForVideo(video, performance.now());
      const name = result?.gestures?.[0]?.[0]?.categoryName;
      const action = GESTURES[name];
      const score = result?.gestures?.[0]?.[0]?.score || 0;
      if (action && score > 0.7 && Date.now() - lastAt > 1800) {
        lastAt = Date.now();
        onAction?.(action, name);
      }
    }
    frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => loop()) : requestAnimationFrame(loop);
  }
  loop();

  return {
    stop() {
      stopped = true;
      if (video.cancelVideoFrameCallback && frame) video.cancelVideoFrameCallback(frame);
      recognizer?.close?.();
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    },
  };
}
