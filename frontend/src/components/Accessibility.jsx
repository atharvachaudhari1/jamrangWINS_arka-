import { useEffect, useState } from "react";
import api from "../services/api";
import { PREF, readPref, writePref } from "../accessibility/prefs";
import { speakText, stopSpeaking } from "../accessibility/speech";
import { startDictation } from "../accessibility/voice";
import { GESTURE_HELP } from "../accessibility/gestures";

export default function Accessibility() {
  const [voice, setVoice] = useState(readPref(PREF.voice));
  const [tts, setTts] = useState(readPref(PREF.tts));
  const [gestures, setGestures] = useState(readPref(PREF.gestures));
  const [eleven, setEleven] = useState(null);
  const [message, setMessage] = useState("");
  const [heard, setHeard] = useState("");

  useEffect(() => {
    api.get("/accessibility/status")
      .then((data) => setEleven(data))
      .catch(() => setEleven({ elevenlabs: false, note: "Speech status could not be checked. Browser speech can still be used." }));
  }, []);

  function save(key, value, setter) {
    setter(value);
    writePref(key, value);
  }

  async function trySpeak() {
    stopSpeaking();
    const result = await speakText("One small step at a time.");
    setMessage(result.warning || result.error || (result.ok ? `Reading with ${result.used === "elevenlabs" ? "ElevenLabs" : "your browser"}.` : "Read-aloud is off."));
  }

  function tryVoice() {
    setMessage("");
    const recognition = startDictation({
      onResult: (text) => setHeard(text),
      onError: (msg) => setMessage(msg),
    });
    if (!recognition) return;
    setMessage("Listening. Say a task name, then stop by pausing.");
  }

  return (
    <div>
      <h1 className="page-title">Accessibility</h1>
      <p className="page-subtitle">Optional. Touch, mouse, and keyboard keep working if these are off.</p>

      <section className="card mb-4">
        <div className="card-title">Voice input</div>
        <p className="text-sm">Uses your browser’s speech recognition to fill a task title or trigger Today actions. Audio is not stored in Doorway. Browser support varies, and some browsers send audio to their own speech service.</p>
        <label className="check-row">
          <input type="checkbox" checked={voice === "on"} onChange={(e) => save(PREF.voice, e.target.checked ? "on" : "off", setVoice)} />
          Enable voice input
        </label>
        <button className="btn btn-secondary btn-sm" type="button" onClick={tryVoice}>Test microphone</button>
        {heard && <p className="today-message" role="status">Heard: {heard}</p>}
      </section>

      <section className="card mb-4">
        <div className="card-title">Read aloud</div>
        <p className="text-sm">This is separate from voice input. Browser speech stays on your device. ElevenLabs is optional and only receives the text you ask to hear.</p>
        <p className="text-sm text-muted">{eleven?.note}</p>
        <label>
          Reader
          <select className="input" value={tts} onChange={(e) => save(PREF.tts, e.target.value, setTts)}>
            <option value="off">Off</option>
            <option value="browser">Browser voice</option>
            <option value="elevenlabs">ElevenLabs {eleven?.elevenlabs ? "" : "(not configured)"}</option>
          </select>
        </label>
        <button className="btn btn-secondary btn-sm" type="button" onClick={trySpeak}>Test read aloud</button>
      </section>

      <section className="card">
        <div className="card-title">Hand gestures</div>
        <p className="text-sm">Optional camera control on the Today card. Video stays in the browser and is not saved. The gesture model is downloaded from Google when you turn the camera on. A camera is never required.</p>
        <label className="check-row">
          <input type="checkbox" checked={gestures === "on"} onChange={(e) => save(PREF.gestures, e.target.checked ? "on" : "off", setGestures)} />
          Show gesture controls on Today
        </label>
        <ul className="academic-list">
          {GESTURE_HELP.map(([gesture, action]) => (
            <li key={gesture}><div><strong>{gesture}</strong><div className="text-sm text-muted">{action}</div></div></li>
          ))}
        </ul>
      </section>
      {message && <p className="today-message" role="status">{message}</p>}
    </div>
  );
}
