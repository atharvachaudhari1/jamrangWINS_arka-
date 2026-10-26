import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import { useEnergy } from "../contexts/EnergyContext";
import { PREF, readPref } from "../accessibility/prefs";
import { interpret, spokenDate, taskQuestion } from "../accessibility/agent";
import { startListening } from "../accessibility/voice";
import { recordWav } from "../accessibility/recordWav";
import { transcribeWav } from "../accessibility/transcribe";
import { speech } from "../accessibility/speech";
import { recordCheckIn } from "../services/rhythm";

function firstName(name) {
  const word = String(name || "").trim().split(/\s+/)[0];
  return word || "there";
}

function waitUntilQuiet(text) {
  const current = speech.getState();
  if (current.status === "idle" || current.status === "error") return Promise.resolve();
  const cap = Math.min(20000, 1200 + String(text || "").length * 70);
  return new Promise((resolve) => {
    const timer = setTimeout(done, cap);
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
    const unsubscribe = speech.subscribe((next) => {
      if (next.status === "idle" || next.status === "error") done();
    });
  });
}

async function say(text) {
  try {
    const mode = readPref(PREF.tts, "off") === "elevenlabs" ? "elevenlabs" : "browser";
    await speech.speak(text, { mode, owner: "doorway-agent", voiceId: readPref(PREF.ttsVoice, "") });
    await waitUntilQuiet(text);
  } catch { /* the reply is still on screen */ }
}

function micBlocked(message) {
  return /permission was blocked|no microphone was found|cannot use a microphone|not available in this browser/i.test(message || "");
}

export default function VoiceAgent() {
  const { user, updateUser } = useUser();
  const { energy, setEnergy } = useEnergy();
  const navigate = useNavigate();
  const location = useLocation();
  const [enabled, setEnabled] = useState(() => readPref(PREF.voice) === "on");
  const [paused, setPaused] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const pending = useRef(null);
  const lastAdded = useRef(null);
  const undo = useRef(null);
  const session = useRef(null);
  const stopLoop = useRef(false);
  const signedIn = Boolean(user);
  const ctx = useRef({});
  ctx.current = { updateUser, setEnergy, energy, navigate, path: location.pathname, name: user?.name };

  useEffect(() => {
    const sync = () => setEnabled(readPref(PREF.voice) === "on");
    window.addEventListener("doorway-prefs", sync);
    return () => window.removeEventListener("doorway-prefs", sync);
  }, []);

  useEffect(() => {
    if (!enabled || paused || !signedIn) return undefined;
    let cancelled = false;
    stopLoop.current = false;
    const greetedKey = "doorway-greeted";

    async function speak(text) {
      if (cancelled) return;
      setReply(text);
      await say(text);
    }

    async function currentTask(level = ctx.current.energy) {
      const plan = await api.get(`/planner/today?energyLevel=${level}`);
      return { plan, task: plan?.task || null };
    }

    function refresh() {
      window.dispatchEvent(new Event("doorway-refresh"));
    }

    async function handle(raw) {
      const here = ctx.current;
      const intent = interpret(raw, pending.current, new Date(), here.path);
      if (intent.action === "ignore") return;
      if (intent.action === "stop") {
        stopLoop.current = true;
        await speak("I'll stop listening. Press Talk to Doorway when you want me again.");
        setPaused(true);
        return;
      }
      if (intent.action === "stop-speaking") {
        speech.stop();
        setReply("Stopped.");
        return;
      }
      if (intent.action === "hello") {
        if (here.path === "/") {
          pending.current = { type: "energy" };
          await speak(`Hello ${firstName(here.name)}. How are you feeling? Low, medium, or high? I'll reorder today from that.`);
        } else {
          await speak(`Hello ${firstName(here.name)}. What should I do?`);
        }
        return;
      }
      if (intent.action === "yes" && pending.current?.type === "confirm") {
        const task = pending.current.task;
        pending.current = null;
        await api.delete(`/tasks/${task._id}`);
        refresh();
        await speak(`Deleted ${task.title}.`);
        return;
      }
      if (intent.action === "no" && pending.current?.type === "confirm") {
        pending.current = null;
        await speak("Kept it.");
        return;
      }
      if (intent.action === "ask") {
        await speak(intent.say);
        return;
      }
      if (intent.action === "about") {
        pending.current = null;
        await speak(intent.say);
        return;
      }
      if (intent.action === "navigate") {
        here.navigate(intent.path);
        if (intent.askEnergy) {
          pending.current = { type: "energy" };
          await speak(`You're on Today. How are you feeling? Low, medium, or high?`);
        } else {
          pending.current = null;
          await speak(`Opening ${intent.name}.`);
        }
        return;
      }
      if (intent.action === "shuffle") {
        here.navigate("/");
        pending.current = { type: "energy" };
        await speak("How are you feeling? Low, medium, or high? I'll reorder today's tasks from that.");
        return;
      }
      if (intent.action === "energy") {
        pending.current = null;
        here.setEnergy(intent.level);
        recordCheckIn(intent.level);
        const { task } = await currentTask(intent.level);
        refresh();
        await speak(task
          ? `Using ${intent.label} energy. Your next step is ${task.title}.`
          : `Using ${intent.label} energy. Nothing is waiting right now.`);
        return;
      }
      if (intent.action === "read") {
        const { plan, task } = await currentTask();
        if (plan?.resting) { await speak(plan.reason || "Rest is part of the plan."); return; }
        if (!task) { await speak("Nothing is waiting on Today."); return; }
        const when = plan.suggestedSlot ? " There is an open time later today." : "";
        await speak(`${task.title}. ${task.subject ? `${task.subject}. ` : ""}${task.estimateMins ? `About ${task.estimateMins} minutes. ` : ""}${plan.reason || ""}${when}`);
        return;
      }
      if (intent.action === "task-draft") {
        pending.current = { type: "task", draft: intent.draft, asking: intent.ask };
        if (here.path !== "/tasks") here.navigate("/tasks");
        window.dispatchEvent(new CustomEvent("doorway-task-draft", { detail: intent.draft }));
        await speak(intent.say);
        return;
      }
      if (intent.action === "task-save") {
        const draft = intent.draft;
        pending.current = null;
        const created = await api.post("/tasks", {
          title: draft.title,
          subject: draft.subject || "",
          kind: draft.kind || "assignment",
          priority: draft.priority || "medium",
          ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
          ...(draft.estimateMins ? { estimateMins: draft.estimateMins } : {}),
          ...(draft.notes ? { description: draft.notes } : {}),
        });
        lastAdded.current = { title: draft.title, id: created?.task?._id || created?._id || null };
        window.dispatchEvent(new CustomEvent("doorway-task-draft", { detail: null }));
        refresh();
        if (here.path !== "/tasks") here.navigate("/tasks");
        const bits = [draft.title];
        if (draft.subject) bits.push(`subject ${draft.subject}`);
        if (draft.kind) bits.push(draft.kind);
        if (draft.priority) bits.push(`${draft.priority} priority`);
        if (draft.dueAt) bits.push(`due ${spokenDate(draft.dueAt)}`);
        if (draft.estimateMins) bits.push(`${draft.estimateMins} minutes`);
        await speak(`Added ${bits.join(", ")}. It's on My Tasks.`);
        return;
      }
      if (intent.action === "calendar-draft") {
        pending.current = { type: "calendar", draft: intent.draft, asking: intent.ask };
        if (here.path !== "/calendar") here.navigate("/calendar");
        await speak(intent.say);
        return;
      }
      if (intent.action === "calendar-save") {
        const draft = intent.draft;
        pending.current = null;
        const created = await api.post("/tasks", { title: draft.title, dueAt: draft.dueAt, kind: "general" });
        lastAdded.current = { title: draft.title, id: created?.task?._id || created?._id || null };
        refresh();
        if (here.path !== "/calendar") here.navigate("/calendar");
        await speak(intent.say);
        return;
      }
      if (intent.action === "focus") {
        pending.current = null;
        sessionStorage.setItem("doorway-focus", intent.command);
        if (here.path !== "/focus") here.navigate("/focus");
        window.dispatchEvent(new CustomEvent("doorway-focus", { detail: intent.command }));
        const line = { start: "Starting the focus timer.", pause: "Pausing the focus timer.", reset: "Resetting the focus timer.", deep: "Starting deep work." };
        await speak(line[intent.command] || "Opening the focus timer.");
        return;
      }
      if (intent.action === "shield") {
        pending.current = null;
        sessionStorage.setItem("doorway-shield", intent.on ? "on" : "off");
        if (here.path !== "/blocking") here.navigate("/blocking");
        window.dispatchEvent(new CustomEvent("doorway-shield", { detail: intent.on ? "on" : "off" }));
        await speak(intent.on ? "Focus Shield is on." : "Focus Shield is off.");
        return;
      }
      if (intent.action === "mindful") {
        pending.current = null;
        sessionStorage.setItem("doorway-mindful", JSON.stringify({ command: intent.command, mode: intent.mode }));
        if (here.path !== "/mindful") here.navigate("/mindful");
        window.dispatchEvent(new CustomEvent("doorway-mindful", { detail: { command: intent.command, mode: intent.mode } }));
        await speak(intent.command === "stop" ? "Stopping mindfulness." : "Starting mindfulness.");
        return;
      }
      if (intent.action === "more") {
        pending.current = null;
        window.dispatchEvent(new Event("doorway-more"));
        await speak("More is open. You can say focus timer, focus shield, mindfulness, or deadlines.");
        return;
      }
      if (intent.action === "show-last") {
        pending.current = null;
        here.navigate("/tasks");
        await speak(lastAdded.current?.title
          ? `${lastAdded.current.title} is on My Tasks.`
          : "Opening My Tasks.");
        return;
      }
      if (intent.action === "delete") {
        let task = null;
        if (intent.title) {
          const data = await api.get(`/tasks?q=${encodeURIComponent(intent.title)}&status=open`);
          const wanted = intent.title.toLowerCase();
          task = (data.tasks || []).find((item) => item.title.toLowerCase().includes(wanted)) || data.tasks?.[0];
        } else {
          task = (await currentTask()).task;
        }
        if (!task) { await speak("I couldn't find that task."); return; }
        pending.current = { type: "confirm", task };
        await speak(`Delete ${task.title}? Say yes to confirm, or no to keep it.`);
        return;
      }
      if (intent.action === "profile") {
        const link = ["github", "linkedin", "portfolio"].includes(intent.field);
        let value = intent.value;
        if (link && value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
        const body = intent.field === "name"
          ? { name: value, publicProfile: { name: value } }
          : { publicProfile: { [intent.field]: value } };
        await here.updateUser(body);
        if (here.path !== "/settings") here.navigate("/settings");
        refresh();
        await speak(`Saved ${intent.field}.`);
        return;
      }
      if (intent.action === "study") {
        await here.updateUser({ availableStudyMins: intent.minutes });
        await speak(`Study time is ${intent.minutes} minutes.`);
        return;
      }
      if (intent.action === "theme") {
        window.dispatchEvent(new CustomEvent("doorway-theme", { detail: intent.value }));
        await here.updateUser({ preferredTheme: intent.value }).catch(() => {});
        await speak(`${intent.value === "dark" ? "Dark" : "Light"} mode is on.`);
        return;
      }
      if (intent.action === "undo" && undo.current) {
        const info = undo.current;
        undo.current = null;
        await api.post("/planner/action", { action: "undo", undo: info, energyLevel: here.energy });
        refresh();
        await speak("Undone.");
        return;
      }
      if (intent.action === "planner") {
        const { task } = await currentTask();
        if (!task) { await speak("There's no task on Today for that."); return; }
        if (intent.name === "do") {
          here.navigate("/focus", { state: { taskId: task._id } });
          await speak(`Starting ${task.title}.`);
          return;
        }
        const data = await api.post("/planner/action", { action: intent.name, taskId: task._id, energyLevel: here.energy });
        undo.current = data.undo || null;
        refresh();
        await speak(data.message || "Done.");
        return;
      }
      if (pending.current?.type === "task") {
        await speak(taskQuestion(pending.current.asking));
        return;
      }
      if (pending.current?.type === "calendar") {
        await speak(pending.current.asking === "title" ? "What's the task name?" : "What date?");
        return;
      }
      const heardText = String(intent.heard || "");
      if (!/\b(open|show|add|task|where|go|delete|read|profile|date|subject)\b/i.test(heardText)) return;
      await speak("Say that once more.");
    }

    async function loop() {
      if (!sessionStorage.getItem(greetedKey)) {
        sessionStorage.setItem(greetedKey, "1");
        await speak(`Hello ${firstName(ctx.current.name)}. I'm listening.`);
      }
      while (!cancelled && !stopLoop.current) {
        if (document.hidden) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          continue;
        }
        setListening(true);
        const result = await new Promise((resolve) => {
          let settled = false;
          const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
          session.current = startListening({
            record: () => recordWav({ maxMs: 8000, silenceMs: 800 }),
            transcribe: transcribeWav,
            onResult: (text) => finish({ text }),
            onError: (message) => finish({ error: message }),
            onEnd: () => finish({ error: "" }),
          });
        });
        session.current = null;
        setListening(false);
        if (cancelled || stopLoop.current) break;
        if (result.error) {
          if (micBlocked(result.error)) {
            stopLoop.current = true;
            await speak(result.error);
            setPaused(true);
            break;
          }
          continue;
        }
        if (!result.text) continue;
        setHeard(result.text);
        try {
          await handle(result.text);
        } catch (err) {
          await speak(err.response?.data?.error || "I couldn't do that. You can try again, or use the buttons.");
        }
      }
    }

    loop();
    return () => {
      cancelled = true;
      stopLoop.current = true;
      session.current?.stop();
      if (speech.getState().owner === "doorway-agent") speech.stop();
    };
  }, [enabled, paused, signedIn]);

  if (!signedIn || !enabled) return null;

  return (
    <div className="voice-agent">
      <span className={`voice-agent-dot${listening ? " on" : ""}`} aria-hidden="true" />
      <div className="voice-agent-copy">
        <strong>{paused ? "Voice is paused" : listening ? "Doorway is listening" : "Doorway"}</strong>
        <span>{heard ? `Heard: “${heard}”` : "Say what you want. For example, open my tasks."}</span>
        {reply && <span className="voice-agent-reply">{reply}</span>}
      </div>
      {paused ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaused(false)}>Talk to Doorway</button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { stopLoop.current = true; session.current?.stop(); setPaused(true); }}>Stop</button>
      )}
    </div>
  );
}
