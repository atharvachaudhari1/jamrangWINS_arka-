import axios from "axios";
import { PREF, readPref } from "./prefs";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function browserSpeak(text) {
  if (!("speechSynthesis" in window)) {
    return { ok: false, error: "This browser cannot speak text. You can still read the card." };
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
  return { ok: true, used: "browser" };
}

export async function speakText(text) {
  const mode = readPref(PREF.tts, "off");
  const clean = String(text || "").trim();
  if (!clean || mode === "off") return { ok: false, skipped: true };

  if (mode === "elevenlabs") {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await axios.post(
        `${API}/accessibility/speak`,
        { text: clean },
        {
          responseType: "blob",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          validateStatus: () => true,
          timeout: 20000,
        }
      );
      const type = res.data?.type || "";
      if (res.status !== 200 || type.includes("json")) {
        let message = "ElevenLabs is unavailable. Using browser speech instead.";
        if (type.includes("json")) {
          const parsed = JSON.parse(await res.data.text());
          if (parsed.error) message = parsed.error;
        }
        const fallback = browserSpeak(clean);
        return { ...fallback, warning: message };
      }
      const url = URL.createObjectURL(res.data);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      return { ok: true, used: "elevenlabs" };
    } catch {
      const fallback = browserSpeak(clean);
      return { ...fallback, warning: "ElevenLabs could not be reached. Using browser speech instead." };
    }
  }

  return browserSpeak(clean);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
