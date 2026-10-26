import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useEnergy } from "../contexts/EnergyContext";
import { PREF, readPref } from "../accessibility/prefs";
import { speakText, speech } from "../accessibility/speech";
import { startGestures, GESTURE_HELP } from "../accessibility/gestures";
import ReadAloud from "./ReadAloud";

const READ_OWNER = "today-card";

function clock(mins) {
  const date = new Date();
  date.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSlot(slot) {
  return slot ? `${clock(slot.startMinutes)}–${clock(slot.endMinutes)}` : "";
}

function minutesUntilTomorrowMorning() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return Math.min(1440, Math.round((next - Date.now()) / 60000));
}

function spokenSummary(plan) {
  if (!plan) return "";
  if (plan.resting) return plan.reason;
  const task = plan.task;
  if (!task) return "There is no task suggested right now.";
  return [
    `Suggested next: ${task.title}.`,
    task.subject ? `Subject: ${task.subject}.` : "",
    task.estimateMins ? `About ${task.estimateMins} minutes.` : "",
    plan.reason || "",
  ].filter(Boolean).join(" ");
}

export default function TodayCard() {
  const { energy } = useEnergy();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(null);
  const [smaller, setSmaller] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [gestureState, setGestureState] = useState("off");
  const [lastGesture, setLastGesture] = useState("");
  const [prefs, setPrefs] = useState(() => ({
    voice: readPref(PREF.voice) === "on",
    gestures: readPref(PREF.gestures) === "on",
  }));
  const videoRef = useRef(null);
  const gestureRef = useRef(null);
  const handlersRef = useRef({});

  useEffect(() => {
    const sync = () => setPrefs({ voice: readPref(PREF.voice) === "on", gestures: readPref(PREF.gestures) === "on" });
    window.addEventListener("doorway-prefs", sync);
    return () => window.removeEventListener("doorway-prefs", sync);
  }, []);

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
    const refresh = () => {
      api.get(`/planner/today?energyLevel=${energy}`)
        .then((data) => { if (!cancelled) setPlan(data); })
        .catch(() => {});
    };
    window.addEventListener("doorway-refresh", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("doorway-refresh", refresh);
    };
  }, [energy]);

  const stopCamera = useCallback(() => {
    gestureRef.current?.stop();
    gestureRef.current = null;
    setGestureState("off");
  }, []);

  useEffect(() => () => {
    gestureRef.current?.stop?.();
    if (speech.getState().owner === READ_OWNER) speech.stop();
  }, []);

  useEffect(() => {
    if (!prefs.gestures && gestureRef.current) stopCamera();
  }, [prefs.gestures, stopCamera]);

  function closePanels() {
    setPanel(null);
    setSmaller(null);
    setConfirm(null);
  }

  async function act(action, extra = {}) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await api.post("/planner/action", {
        action,
        taskId: extra.taskId || plan?.task?._id,
        energyLevel: energy,
        ...extra,
      });
      if (action === "do" && data.started) {
        navigate("/focus", { state: { taskId: extra.taskId || plan?.task?._id } });
        return;
      }
      setPlan(data);
      setMessage(data.message || "");
      setUndo(data.undo || null);
      closePanels();
    } catch (err) {
      setError(err.response?.data?.error || "That action could not be saved. You can try again.");
    } finally {
      setBusy(false);
    }
  }

  async function undoLast() {
    if (!undo) return;
    const info = undo;
    setUndo(null);
    await act("undo", { undo: info });
  }

  async function openSmaller() {
    if (!plan?.task) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.post("/planner/action", { action: "smaller", taskId: plan.task._id, preview: true });
      setConfirm(null);
      setPanel("smaller");
      setSmaller({ title: data.proposal.title, estimateMins: data.proposal.estimateMins });
    } catch (err) {
      setError(err.response?.data?.error || "A smaller step could not be suggested.");
    } finally {
      setBusy(false);
    }
  }

  function askComplete() {
    if (!plan?.task) return;
    setPanel(null);
    setConfirm({ text: `Mark “${plan.task.title}” as done?`, yes: "Mark done", run: () => act("complete") });
  }

  function askNotNow() {
    if (!plan?.task) return;
    setPanel(null);
    setConfirm({ text: `Set “${plan.task.title}” aside for now?`, yes: "Not now", run: () => act("notnow") });
  }

  function readCard() {
    if (readPref(PREF.tts, "off") === "off") {
      setMessage("Read-aloud is off. You can turn it on in Accessibility.");
      return;
    }
    speakText(spokenSummary(plan), READ_OWNER);
  }

  function stopEverything() {
    if (confirm || panel || smaller) {
      closePanels();
      setMessage("Closed.");
    } else if (speech.getState().status !== "idle") {
      speech.stop();
    }
  }

  handlersRef.current = { askComplete, askNotNow, openSmaller, stopEverything, confirm, plan };

  function onGesture(action) {
    const h = handlersRef.current;
    const label = { confirm: "Thumb up", stop: "Open palm", smaller: "Point up", change: "Victory", notnow: "Closed fist" }[action];
    setLastGesture(label || "");
    if (action === "stop") return h.stopEverything();
    if (action === "confirm") {
      if (h.confirm) return h.confirm.run();
      if (h.plan?.task) { setPanel("do"); return; }
      return;
    }
    if (!h.plan?.task || h.plan.resting) return;
    if (action === "smaller") return h.openSmaller();
    if (action === "change") { setConfirm(null); setPanel("change"); return; }
    if (action === "notnow") return h.askNotNow();
  }

  async function toggleGestures() {
    if (gestureRef.current) {
      stopCamera();
      return;
    }
    if (!videoRef.current) return;
    setGestureState("loading");
    setError("");
    const session = await startGestures({
      video: videoRef.current,
      onAction: onGesture,
      onError: (msg) => { setError(msg); setGestureState("off"); },
      onReady: () => setGestureState("on"),
    });
    if (session) gestureRef.current = session;
  }

  const task = plan?.task;

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
            {task.dueAt ? <span>Due {new Date(task.dueAt).toLocaleDateString()}</span> : null}
          </p>
          <p className="what-next-reason">{plan.reason}</p>
          {plan.inClass && (
            <p className="today-slot">In class now: {plan.inClass.title}, until {clock(plan.inClass.endMinutes)}.</p>
          )}
          {plan.suggestedSlot && (
            <p className="today-slot">
              Possible time: {formatSlot(plan.suggestedSlot)}. {plan.suggestedSlot.reason}
            </p>
          )}
          {plan.alternative && (
            <p className="today-alt">
              {(plan.alternative.estimateMins || 30) < (task.estimateMins || 30) ? "Lighter option" : "Another option"}:{" "}
              <strong>{plan.alternative.title}</strong>
              {plan.alternative.estimateMins ? ` · about ${plan.alternative.estimateMins} min` : ""}
              {" "}
              <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => act("choose", { taskId: plan.alternative._id })}>
                Show this instead
              </button>
            </p>
          )}
          <div className="today-actions">
            <button className="btn btn-primary" type="button" disabled={busy} aria-expanded={panel === "do"}
              onClick={() => { setConfirm(null); setPanel(panel === "do" ? null : "do"); }}>
              Do it
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy} aria-expanded={panel === "smaller"} onClick={openSmaller}>
              Smaller
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} aria-expanded={panel === "change"}
              onClick={() => { setConfirm(null); setPanel(panel === "change" ? null : "change"); }}>
              Change
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => act("rest")}>
              Rest
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => act("notnow")}>
              Not now
            </button>
          </div>

          {panel === "do" && (
            <div className="today-panel" role="group" aria-label="Do it options">
              <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => act("do")}>Start focus</button>
              <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={askComplete}>Mark done</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPanel(null)}>Cancel</button>
            </div>
          )}

          {panel === "smaller" && smaller && (
            <form
              className="today-panel today-panel-form"
              aria-label="Smaller step"
              onSubmit={(e) => { e.preventDefault(); act("smaller", { step: smaller }); }}
            >
              <p className="text-sm">A smaller step for this task. Change it if you like. The larger task stays on your list.</p>
              <label className="sr-only" htmlFor="smaller-title">Smaller step</label>
              <input id="smaller-title" className="input" value={smaller.title} maxLength={500} required
                onChange={(e) => setSmaller({ ...smaller, title: e.target.value })} />
              <label className="today-inline-label" htmlFor="smaller-mins">
                Minutes
                <input id="smaller-mins" className="input today-mins" type="number" min={1} max={120} required
                  value={smaller.estimateMins} onChange={(e) => setSmaller({ ...smaller, estimateMins: Number(e.target.value) })} />
              </label>
              <div className="today-panel-row">
                <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !smaller.title.trim()}>Use this step</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={closePanels}>Cancel</button>
              </div>
            </form>
          )}

          {panel === "change" && (
            <div className="today-panel" role="group" aria-label="Change options">
              <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => act("change")}>Suggest another</button>
              {(plan.options || []).filter((option) => option._id !== task._id).map((option) => (
                <button key={option._id} className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => act("choose", { taskId: option._id })}>
                  {option.subject ? `${option.subject}: ` : ""}{option.title}
                </button>
              ))}
              <span className="today-panel-label">Or move this task to</span>
              <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => act("change", { laterMins: 60 })}>In an hour</button>
              <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => act("change", { laterMins: 180 })}>Later today</button>
              <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => act("change", { laterMins: minutesUntilTomorrowMorning() })}>Tomorrow morning</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPanel(null)}>Cancel</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="what-next-task">Nothing is waiting right now</div>
          <p className="what-next-reason">Add a class task, or keep using the general task list. Either one can show up here.</p>
          <div className="today-actions">
            <Link to="/tasks" className="btn btn-primary">Add academic task</Link>
            <Link to="/todo" className="btn btn-ghost">All tasks</Link>
          </div>
        </>
      )}

      {confirm && (
        <div className="today-panel today-confirm" role="alertdialog" aria-label="Confirm">
          <span className="text-sm">{confirm.text}</span>
          <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={confirm.run}>{confirm.yes}</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      )}

      {!loading && plan && (
        <div className="today-access">
          <ReadAloud text={spokenSummary(plan)} owner={READ_OWNER} compact />
          {prefs.voice && (
            <p className="text-sm text-muted">Doorway is listening. Say what you want, for example “read today’s card”.</p>
          )}
          {prefs.gestures && (
            <button className={`btn btn-ghost btn-sm${gestureState === "on" ? " is-live" : ""}`} type="button" onClick={toggleGestures}
              aria-pressed={gestureState === "on"} disabled={gestureState === "loading"}>
              {gestureState === "on" ? "Stop camera" : gestureState === "loading" ? "Starting camera…" : "Hand gestures"}
            </button>
          )}
        </div>
      )}

      <div className={`gesture-wrap${gestureState === "on" ? " on" : ""}`}>
        <video ref={videoRef} className={`gesture-preview${gestureState === "on" ? " on" : ""}`} muted playsInline aria-label="Camera preview for hand gestures" />
        {gestureState === "on" && (
          <div className="gesture-status" role="status">
            <strong>Camera on.</strong> Only hand shapes are read, in this browser. Nothing is recorded or uploaded.
            {lastGesture ? ` Last gesture: ${lastGesture}.` : ""}
            <ul className="gesture-help">
              {GESTURE_HELP.map(([shape, does]) => <li key={shape}><strong>{shape}</strong>: {does}</li>)}
            </ul>
          </div>
        )}
      </div>

      {(message || undo) && (
        <p className="today-message" role="status">
          {message}
          {undo && (
            <button className="btn btn-ghost btn-sm today-undo" type="button" disabled={busy} onClick={undoLast}>Undo</button>
          )}
        </p>
      )}
      {error && plan && <p className="today-message today-error" role="alert">{error}</p>}
    </section>
  );
}
