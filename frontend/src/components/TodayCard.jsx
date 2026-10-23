import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useEnergy } from "../contexts/EnergyContext";
import { PREF, readPref } from "../accessibility/prefs";
import { speakText } from "../accessibility/speech";
import { matchVoiceCommand, startDictation } from "../accessibility/voice";
import { startGestures } from "../accessibility/gestures";

function formatSlot(slot) {
  if (!slot) return "";
  const label = (mins) => {
    const date = new Date();
    date.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  return `${label(slot.startMinutes)}–${label(slot.endMinutes)}`;
}

export default function TodayCard() {
  const { energy } = useEnergy();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [doOpen, setDoOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [gestureOn, setGestureOn] = useState(false);
  const videoRef = useRef(null);
  const gestureRef = useRef(null);
  const voiceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.get(`/planner/today?energyLevel=${energy}`)
      .then((data) => { if (!cancelled) setPlan(data); })
      .catch(() => {
        if (!cancelled) {
          setError("The suggestion could not be loaded. Your tasks are still available.");
          setPlan(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [energy]);

  useEffect(() => () => {
    voiceRef.current?.stop?.();
    gestureRef.current?.stop?.();
  }, []);

  async function act(action, taskId) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await api.post("/planner/action", {
        action,
        taskId: taskId || plan?.task?._id,
        energyLevel: energy,
      });
      if (action === "do" && data.started) {
        navigate("/focus", { state: { taskId: taskId || plan?.task?._id } });
        return;
      }
      setPlan(data);
      setMessage(data.message || "");
      setDoOpen(false);
      setChangeOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || "That action could not be saved. You can try again.");
    } finally {
      setBusy(false);
    }
  }

  async function readAloud() {
    const task = plan?.task;
    const text = plan?.resting
      ? plan.reason
      : task
        ? `${task.title}. ${task.subject ? `Subject ${task.subject}.` : ""} ${task.estimateMins ? `About ${task.estimateMins} minutes.` : ""} ${plan.reason || ""}`
        : "There is no task suggested yet.";
    const result = await speakText(text);
    if (result.warning) setMessage(result.warning);
    else if (result.error) setError(result.error);
  }

  function listen() {
    if (listening) {
      voiceRef.current?.stop?.();
      setListening(false);
      return;
    }
    const recognition = startDictation({
      onResult: (transcript) => {
        const command = matchVoiceCommand(transcript);
        if (command === "do") setDoOpen(true);
        else if (command) act(command);
        else setMessage(`Heard “${transcript}”. Say Do it, Smaller, Change, Rest, or Not now.`);
      },
      onError: (msg) => setError(msg),
      onEnd: () => setListening(false),
    });
    if (recognition) {
      voiceRef.current = recognition;
      setListening(true);
    }
  }

  async function toggleGestures() {
    if (gestureRef.current) {
      gestureRef.current.stop();
      gestureRef.current = null;
      setGestureOn(false);
      return;
    }
    if (!videoRef.current) return;
    const session = await startGestures({
      video: videoRef.current,
      onAction: (action) => {
        if (action === "do") setDoOpen(true);
        else act(action);
      },
      onError: (msg) => setError(msg),
    });
    if (session) {
      gestureRef.current = session;
      setGestureOn(true);
    }
  }

  const task = plan?.task;
  const voiceEnabled = readPref(PREF.voice) === "on";
  const ttsEnabled = readPref(PREF.tts) !== "off";
  const gesturesEnabled = readPref(PREF.gestures) === "on";

  return (
    <section className="what-next-card today-card" aria-labelledby="today-heading">
      <div className="what-next-label" id="today-heading">Today</div>
      {loading ? (
        <p className="text-sm text-muted">Looking for one manageable step...</p>
      ) : error && !plan ? (
        <p className="text-sm">{error}</p>
      ) : plan?.resting ? (
        <>
          <div className="what-next-task">Take a rest</div>
          <p className="what-next-reason">{plan.reason}</p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act("ready")}>
            I'm ready
          </button>
        </>
      ) : task ? (
        <>
          <div className="what-next-task">{task.title}</div>
          <p className="today-meta">
            {task.subject ? <span>{task.subject}</span> : null}
            {task.estimateMins ? <span>About {task.estimateMins} min</span> : null}
            {task.kind && task.kind !== "general" ? <span>{task.kind}</span> : null}
          </p>
          <p className="what-next-reason">{plan.reason}</p>
          {plan.suggestedSlot && (
            <p className="today-slot">
              Possible time: {formatSlot(plan.suggestedSlot)}. {plan.suggestedSlot.reason}
            </p>
          )}
          {plan.alternative && (
            <p className="today-alt">
              Smaller alternative: <strong>{plan.alternative.title}</strong>
              {plan.alternative.estimateMins ? ` · about ${plan.alternative.estimateMins} min` : ""}
            </p>
          )}
          <div className="today-actions">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => setDoOpen((open) => !open)}>
              Do it
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => act("smaller")}>
              Smaller
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setChangeOpen((open) => !open)}>
              Change
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => act("rest")}>
              Rest
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => act("notnow")}>
              Not now
            </button>
          </div>
          {doOpen && (
            <div className="today-panel">
              <button className="btn btn-primary btn-sm" type="button" onClick={() => act("do")}>Start focus</button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => act("complete")}>Mark done</button>
            </div>
          )}
          {changeOpen && (
            <div className="today-panel">
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => act("change")}>Suggest another</button>
              {(plan.options || []).filter((option) => option._id !== task._id).map((option) => (
                <button key={option._id} className="btn btn-ghost btn-sm" type="button" onClick={() => act("choose", option._id)}>
                  {option.subject ? `${option.subject}: ` : ""}{option.title}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="what-next-task">Nothing is waiting right now</div>
          <p className="what-next-reason">Add a class task, or keep using the general task list. Either one can show up here.</p>
          <div className="today-actions">
            <Link to="/tasks"><button className="btn btn-primary" type="button">Add academic task</button></Link>
            <Link to="/todo"><button className="btn btn-ghost" type="button">All tasks</button></Link>
          </div>
        </>
      )}

      {(voiceEnabled || ttsEnabled || gesturesEnabled) && (
        <div className="today-access">
          {ttsEnabled && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={readAloud}>Read aloud</button>
          )}
          {voiceEnabled && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={listen}>
              {listening ? "Stop voice" : "Voice"}
            </button>
          )}
          {gesturesEnabled && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={toggleGestures}>
              {gestureOn ? "Stop camera" : "Gestures"}
            </button>
          )}
        </div>
      )}
      <video ref={videoRef} className={`gesture-preview${gestureOn ? " on" : ""}`} muted playsInline aria-label="Camera preview for hand gestures" />
      {message && <p className="today-message" role="status">{message}</p>}
      {error && plan && <p className="today-message" role="alert">{error}</p>}
    </section>
  );
}
