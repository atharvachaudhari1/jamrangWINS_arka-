export const PREF = {
  voice: "doorway-voice",
  tts: "doorway-tts",
  ttsVoice: "doorway-tts-voice",
  gestures: "doorway-gestures",
};

export function readPref(key, fallback = "off") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event("doorway-prefs"));
}
