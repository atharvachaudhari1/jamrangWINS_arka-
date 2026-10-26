import axios from "axios";
import { useEffect, useState } from "react";
import { PREF, readPref } from "./prefs";
import { createSpeechController } from "./speechController";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// The browser only ever talks to the Doorway backend. The ElevenLabs key stays on the server.
async function fetchAudio(text, voiceId) {
  try {
    const token = localStorage.getItem("accessToken");
    const res = await axios.post(
      `${API}/accessibility/speak`,
      { text, voiceId: voiceId || undefined },
      {
        responseType: "blob",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        validateStatus: () => true,
        timeout: 25000,
      }
    );
    const type = res.data?.type || "";
    if (res.status === 200 && type.includes("audio")) return { ok: true, blob: res.data };
    let error = "ElevenLabs is unavailable.";
    if (type.includes("json")) {
      try {
        const parsed = JSON.parse(await res.data.text());
        if (parsed.error) error = parsed.error;
      } catch { /* keep the generic message */ }
    }
    return { ok: false, error };
  } catch {
    return { ok: false, error: "ElevenLabs could not be reached." };
  }
}

const hasSynth = typeof window !== "undefined" && "speechSynthesis" in window;

// Chrome on Windows speaks the same line twice, once male and once female,
// unless the utterance is pinned to a single local voice and the previous
// line is fully cancelled before the next one starts.
let lockedVoice = null;
let speakTimer = 0;

function pickVoice() {
  if (!hasSynth) return null;
  if (lockedVoice) return lockedVoice;
  const voices = window.speechSynthesis.getVoices();
  lockedVoice = voices.find((voice) => voice.localService && /^en/i.test(voice.lang))
    || voices.find((voice) => /^en/i.test(voice.lang))
    || null;
  return lockedVoice;
}

function pin(utterance) {
  const voice = pickVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-US";
  }
  return utterance;
}

export const speech = createSpeechController({
  fetchAudio,
  makeAudio: (url) => new Audio(url),
  urls: { create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) },
  synth: hasSynth
    ? {
        makeUtterance: (text) => pin(new SpeechSynthesisUtterance(text)),
        speak: (utterance) => {
          window.clearTimeout(speakTimer);
          window.speechSynthesis.cancel();
          speakTimer = window.setTimeout(() => {
            speakTimer = 0;
            pin(utterance);
            window.speechSynthesis.speak(utterance);
          }, 60);
        },
        cancel: () => {
          window.clearTimeout(speakTimer);
          speakTimer = 0;
          window.speechSynthesis.cancel();
        },
        pause: () => window.speechSynthesis.pause(),
        resume: () => window.speechSynthesis.resume(),
      }
    : null,
});

if (hasSynth) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    if (!lockedVoice) pickVoice();
  });
  pickVoice();
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => speech.dispose());

export function speakText(text, owner = null) {
  return speech.speak(text, {
    mode: readPref(PREF.tts, "off"),
    voiceId: readPref(PREF.ttsVoice, ""),
    owner,
  });
}

export function stopSpeaking() {
  speech.stop();
}

export function useSpeechState() {
  const [state, setState] = useState(speech.getState());
  useEffect(() => speech.subscribe(setState), []);
  return state;
}
