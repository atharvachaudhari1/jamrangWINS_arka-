import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { PREF, readPref } from "../accessibility/prefs";
import { speakText, speech, useSpeechState } from "../accessibility/speech";

function useTtsMode() {
  const [mode, setMode] = useState(() => readPref(PREF.tts, "off"));
  useEffect(() => {
    const sync = () => setMode(readPref(PREF.tts, "off"));
    window.addEventListener("doorway-prefs", sync);
    return () => window.removeEventListener("doorway-prefs", sync);
  }, []);
  return mode;
}

export default function ReadAloud({ text, label = "Read aloud", compact = false, owner }) {
  const autoId = useId();
  const id = owner || autoId;
  const mode = useTtsMode();
  const state = useSpeechState();
  const mine = state.owner === id;
  const status = mine ? state.status : "idle";

  useEffect(() => () => {
    if (speech.getState().owner === id) speech.stop();
  }, [id]);

  if (mode === "off") {
    if (compact) return null;
    return (
      <Link to="/accessibility" className="btn btn-ghost btn-sm">Turn on read-aloud</Link>
    );
  }

  return (
    <span className="read-aloud" aria-live="polite">
      {(status === "idle" || status === "error") && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => speakText(text, id)} disabled={!text}>
          {label}
        </button>
      )}
      {status === "loading" && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => speech.stop()}>
          Loading voice… Cancel
        </button>
      )}
      {status === "playing" && (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => speech.pause()}>Pause</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => speech.stop()}>Stop</button>
        </>
      )}
      {status === "paused" && (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => speech.resume()}>Resume</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => speech.stop()}>Stop</button>
        </>
      )}
      {mine && state.status !== "loading" && state.source && (
        <span className="read-aloud-source">{state.source === "elevenlabs" ? "ElevenLabs voice" : "Browser voice"}</span>
      )}
      {mine && state.message && <span className="read-aloud-note" role="status">{state.message}</span>}
    </span>
  );
}
