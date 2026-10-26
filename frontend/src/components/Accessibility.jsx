import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { PREF, readPref, writePref } from "../accessibility/prefs";
import { startListening, parseVoiceCommand } from "../accessibility/voice";
import { recordWav } from "../accessibility/recordWav";
import { transcribeWav } from "../accessibility/transcribe";
import { GESTURE_HELP } from "../accessibility/gestures";
import ReadAloud from "./ReadAloud";

const COMMAND_NAMES = {
  create: "Add a task", openToday: "Open Today", openTasks: "Open My Tasks", read: "Read the recommendation",
  stopRead: "Stop reading", change: "Another option", complete: "Mark done", notnow: "Not now",
  smaller: "Smaller", do: "Do it", rest: "Rest",
};

export default function Accessibility() {
  const [voice, setVoice] = useState(readPref(PREF.voice));
  const [tts, setTts] = useState(readPref(PREF.tts));
  const [ttsVoice, setTtsVoice] = useState(readPref(PREF.ttsVoice, ""));
  const [gestures, setGestures] = useState(readPref(PREF.gestures));
  const [eleven, setEleven] = useState(null);
  const [voices, setVoices] = useState({ list: [], error: "" });
  const [message, setMessage] = useState("");
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const sessionRef = useRef(null);

  useEffect(() => () => sessionRef.current?.stop(), []);

  useEffect(() => {
    api.get("/accessibility/status")
      .then((data) => setEleven(data))
      .catch(() => setEleven({ elevenlabs: false, note: "Speech status could not be checked. Browser speech can still be used." }));
  }, []);

  useEffect(() => {
    if (tts !== "elevenlabs" || !eleven?.elevenlabs || voices.list.length) return;
    api.get("/accessibility/voices")
      .then((data) => setVoices({ list: data.voices || [], error: "" }))
      .catch((err) => setVoices({ list: [], error: err.response?.data?.error || "The voice list could not be loaded. The default voice will be used." }));
  }, [tts, eleven, voices.list.length]);

  function save(key, value, setter) {
    setter(value);
    writePref(key, value);
  }

  function tryVoice() {
    if (voice === "on") {
      setMessage("Doorway is already listening. Just say what you want, from any page.");
      return;
    }
    if (listening) {
      sessionRef.current?.stop();
      setListening(false);
      return;
    }
    setMessage("");
    setHeard("");
    setListening(true);
    sessionRef.current = startListening({
      record: recordWav,
      transcribe: transcribeWav,
      onInterim: (text) => setHeard(text),
      onResult: (text) => {
        setHeard(text);
        const parsed = parseVoiceCommand(text);
        setMessage(parsed?.command
          ? `That would run: ${COMMAND_NAMES[parsed.command]}${parsed.args.title ? ` “${parsed.args.title}”` : ""}${parsed.needsConfirm ? " (after you confirm)" : ""}.`
          : "That is not one of the commands, so nothing would happen.");
      },
      onError: (msg) => setMessage(msg),
      onEnd: () => setListening(false),
    });
  }

  return (
    <div>
      <h1 className="page-title">Accessibility</h1>
      <p className="page-subtitle">Optional. Touch, mouse, and keyboard keep working if these are off.</p>

      <section className="card mb-4">
        <div className="card-title">Voice commands</div>
        <p className="text-sm">While this is on, Doorway stays listening on every page. Say what you want, the way you would ask a person: “open my tasks”, “go to today’s task”, “add Saanvi’s birthday on 5 November”, “read today’s card”, “delete this card”, or “set my GitHub to …” and a link. Doorway answers out loud and does it. In Chrome or Edge this uses the browser’s speech service. In this Cursor window, Windows recognises the phrase on this computer and then deletes the audio. Nothing is saved. Deleting something asks you to say yes first.</p>
        <label className="check-row">
          <input type="checkbox" checked={voice === "on"} onChange={(e) => save(PREF.voice, e.target.checked ? "on" : "off", setVoice)} />
          Enable voice commands
        </label>
        {voice === "on" ? (
          <p className="today-message" role="status">Doorway is listening. Say what you want from any page.</p>
        ) : (
          <button className="btn btn-secondary btn-sm" type="button" onClick={tryVoice} aria-pressed={listening}>
            {listening ? "Listening… tap to stop" : "Test microphone"}
          </button>
        )}
        {heard && <p className="today-message" role="status">Heard: “{heard}”</p>}
        <ul className="task-steps">
          <li><strong>“Open my tasks”</strong>: Opens that page</li>
          <li><strong>“Go to today’s task”</strong>: Opens Today, asks how you are feeling, then reorders</li>
          <li><strong>“Add Saanvi birthday on 5 November”</strong>: Adds the task on that date</li>
          <li><strong>“Read today’s card”</strong>: Reads Today aloud</li>
          <li><strong>“Delete this card”</strong>: Asks you to say yes before deleting</li>
          <li><strong>“Open my profile”</strong> and <strong>“Set my GitHub to …”</strong>: Opens your profile and saves that section</li>
          <li><strong>“Low”, “medium”, or “high”</strong>: Chooses an energy level so Today can reorder</li>
        </ul>
      </section>

      <section className="card mb-4">
        <div className="card-title">Read aloud</div>
        <p className="text-sm">This is separate from voice commands. Browser speech stays on your device. ElevenLabs is optional and only receives the text you ask to hear, through the Doorway server. Your energy history and account details are never sent.</p>
        <p className="text-sm text-muted">{eleven?.note}</p>
        <label>
          Reader
          <select className="input" value={tts} onChange={(e) => save(PREF.tts, e.target.value, setTts)}>
            <option value="off">Off</option>
            <option value="browser">Browser voice</option>
            <option value="elevenlabs" disabled={eleven && !eleven.elevenlabs}>ElevenLabs {eleven && !eleven.elevenlabs ? "(not configured on the server)" : ""}</option>
          </select>
        </label>
        {tts === "elevenlabs" && eleven?.elevenlabs && (
          <label>
            ElevenLabs voice
            <select className="input" value={ttsVoice} onChange={(e) => save(PREF.ttsVoice, e.target.value, setTtsVoice)}>
              <option value="">Default voice</option>
              {voices.list.map((v) => <option key={v.id} value={v.id}>{v.name}{v.description ? ` (${v.description})` : ""}</option>)}
            </select>
          </label>
        )}
        {voices.error && <p className="text-sm text-muted">{voices.error}</p>}
        <div className="today-actions mt-3">
          <ReadAloud text="One small step at a time. This is how Doorway will read your Today card." label="Test read aloud" />
        </div>
      </section>

      <section className="card">
        <div className="card-title">Hand gestures</div>
        <p className="text-sm">Optional camera control on the Today card. Only hand shapes are recognised, in this browser. Video is never uploaded or saved, and there is no face, emotion, or identity detection. The gesture model is downloaded from Google when you turn the camera on. A camera is never required, and leaving the page turns it off.</p>
        <label className="check-row">
          <input type="checkbox" checked={gestures === "on"} onChange={(e) => save(PREF.gestures, e.target.checked ? "on" : "off", setGestures)} />
          Show gesture controls on Today
        </label>
        <ul className="academic-list">
          {GESTURE_HELP.map(([gesture, action]) => (
            <li key={gesture}><div><strong>{gesture}</strong><div className="text-sm text-muted">{action}</div></div></li>
          ))}
        </ul>
        <p className="text-sm text-muted">A gesture has to be held steadily for a moment to count, and holding it does not repeat it. Not now and Mark done always ask you to confirm.</p>
      </section>
      {message && <p className="today-message" role="status">{message}</p>}
    </div>
  );
}
