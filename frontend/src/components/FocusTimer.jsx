import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../services/api";
import { setFocusActive, getDistractionCount, resetDistractionCount } from "./FocusOverlay";
import Affirmations from "./Affirmations";
import ShieldStatusCard from "./focus-shield/ShieldStatusCard";
import { useBlockingStore } from "../stores/blockingStore";

const CIRCUMFERENCE = 2 * Math.PI * 90;

const MODES = [
  { id: "pomodoro", label: "Pomodoro", work: 25, brk: 5 },
  { id: "deep",     label: "Deep Work", work: 50, brk: 10 },
];

export default function FocusTimer() {
  const location = useLocation();
  const { rules: shieldRules, loading: shieldLoading, setRules: setShieldRules, setLoading: setShieldLoading } = useBlockingStore();
  const [modeIdx, setModeIdx] = useState(0);
  const [workMins, setWorkMins] = useState(25);
  const [breakMins, setBreakMins] = useState(5);
  const [isWork, setIsWork] = useState(true);
  const [seconds, setSeconds] = useState(25 * 60);
  const [active, setActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [reward, setReward] = useState(null);

  // Task linking
  const [tasks, setTasks] = useState([]);
  const [linkedTaskId, setLinkedTaskId] = useState("");
  const [tasksLoading, setTasksLoading] = useState(false);

  const affirmRef = useRef();
  const intervalRef = useRef();

  const totalSecs = (isWork ? workMins : breakMins) * 60;
  const progress = totalSecs > 0 ? 1 - seconds / totalSecs : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const linkedTask = tasks.find((t) => t._id === linkedTaskId) || null;

  useEffect(() => { loadTasks(); }, []);

  useEffect(() => {
    if (location.state?.taskId) setLinkedTaskId(location.state.taskId);
  }, [location.state]);

  useEffect(() => {
    setShieldLoading(true);
    api.get("/blocking")
      .then((data) => setShieldRules(data.rules))
      .catch(() => {})
      .finally(() => setShieldLoading(false));
  }, []);

  async function loadTasks() {
    setTasksLoading(true);
    try {
      const res = await api.get("/tasks");
      setTasks((res.tasks || []).filter((t) => !t.completed));
    } catch { setTasks([]); }
    finally { setTasksLoading(false); }
  }

  useEffect(() => {
    const m = MODES[modeIdx];
    if (m.id !== "custom") {
      setWorkMins(m.work);
      setBreakMins(m.brk);
      reset(m.work, m.brk);
    }
  }, [modeIdx]);

  useEffect(() => {
    if (active && seconds > 0) {
      intervalRef.current = setInterval(() => setSeconds((s) => s - 1), 1000);
    } else if (seconds === 0 && active) {
      clearInterval(intervalRef.current);
      setActive(false);
      setFocusActive(false);
      handleComplete();
    }
    return () => clearInterval(intervalRef.current);
  }, [active, seconds]);

  useEffect(() => {
    if (active) {
      setFocusActive(true, isWork ? MODES[modeIdx].label : "Break");
    } else {
      setFocusActive(false);
    }
    return () => { if (active) setFocusActive(false); };
  }, [active, isWork, modeIdx]);

  async function handleComplete() {
    if (isWork) {
      setSessionCount((c) => c + 1);
      showReward("🔥");
      if (affirmRef.current) affirmRef.current.messageForContext("task-complete");
      const distractionCount = getDistractionCount();
      resetDistractionCount();
      const energyLevel = parseInt(localStorage.getItem("bb-energy") || "3", 10);
      try {
        await api.post("/sessions", {
          type: MODES[modeIdx].id,
          durationMins: workMins,
          distractionCount,
          energyLevel,
          taskId: linkedTaskId || undefined,
        });
      } catch {}
    } else {
      if (affirmRef.current) affirmRef.current.messageForContext("day-start");
    }
  }

  function showReward(emoji) {
    setReward(emoji);
    setTimeout(() => setReward(null), 900);
  }

  function toggle() {
    if (!active) {
      setActive(true);
    } else {
      setActive(false);
      setFocusActive(false);
    }
  }

  function reset(w = workMins, b = breakMins) {
    clearInterval(intervalRef.current);
    setActive(false);
    setFocusActive(false);
    setIsWork(true);
    setSeconds(w * 60);
  }

  function switchPhase() {
    clearInterval(intervalRef.current);
    setActive(false);
    setFocusActive(false);
    const next = !isWork;
    setIsWork(next);
    setSeconds((next ? workMins : breakMins) * 60);
  }

  function fmt(s) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss < 10 ? "0" + ss : ss}`;
  }

  const sessionLabels = ["", "Starting out 🙂", "In the zone!", "Focus machine 🔥", "Incredible! 🤯"];
  const sessionLabel = sessionCount === 0
    ? "Start your first session"
    : sessionLabels[Math.min(sessionCount, sessionLabels.length - 1)];

  return (
    <div>
      {reward && <div className="reward-burst">{reward}</div>}

      <h1 className="page-title">Focus Timer</h1>
      <p className="page-subtitle">Pomodoro-style sessions with tab-switch protection</p>

      <div className="grid-main">
        {/* ── Timer card ────────────────────────────────── */}
        <div className="card">
          <div className="mode-tabs">
            {MODES.map((m, i) => (
              <button
                key={m.id}
                className={`mode-tab ${modeIdx === i ? "active" : ""}`}
                onClick={() => setModeIdx(i)}
                aria-pressed={modeIdx === i}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Task picker — links session to a task */}
          <div className="task-link-picker mb-4">
            <label className="text-xs text-muted" style={{ display: "block", marginBottom: 6 }}>
              Working on
            </label>
            {tasksLoading ? (
              <div className="text-sm text-muted">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="text-sm text-muted">
                No tasks yet —{" "}
                <a href="/todo" className="text-link">add some tasks</a> to link your session.
              </div>
            ) : (
              <select
                className="select"
                value={linkedTaskId}
                onChange={(e) => setLinkedTaskId(e.target.value)}
                aria-label="Select task to focus on"
              >
                <option value="">Free session (no specific task)</option>
                {tasks.map((t) => (
                  <option key={t._id} value={t._id}>{t.title}</option>
                ))}
              </select>
            )}
            {linkedTask && (
              <div className="linked-task-badge">
                <span>🎯</span>
                <span>{linkedTask.title}</span>
                {linkedTask.estimateMins && (
                  <span className="text-xs text-muted">~{linkedTask.estimateMins}m</span>
                )}
              </div>
            )}
          </div>

          {/* Ring Timer */}
          <div className="ring-container">
            <svg className="ring-svg" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
              <circle className="ring-track" cx="110" cy="110" r="90" />
              <circle
                className={`ring-progress ${isWork ? "work" : "brk"}`}
                cx="110" cy="110" r="90"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="ring-text" role="timer" aria-label={`${fmt(seconds)} ${isWork ? "work" : "break"}`}>
              <div className="ring-time">{fmt(seconds)}</div>
              <div className="ring-label">{isWork ? "Work" : "Break"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              className={`btn btn-lg ${active ? "btn-secondary" : "btn-primary"}`}
              onClick={toggle}
              style={{ minWidth: 130 }}
              aria-label={active ? "Pause timer" : "Start timer"}
            >
              {active ? "⏸ Pause" : "▶ Start"}
            </button>
            <button className="btn btn-ghost" onClick={() => reset()} aria-label="Reset timer">↺ Reset</button>
            <button className="btn btn-ghost" onClick={switchPhase} aria-label="Switch phase">
              {isWork ? "→ Break" : "→ Work"}
            </button>
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────── */}
        <div className="stack">
          <div className="card">
            <div className="card-title">Today's Sessions</div>
            <div className="stat-value stat-violet" style={{ fontSize: 42, marginBottom: 4 }}>
              {sessionCount}
            </div>
            <div className="text-sm text-muted">{sessionLabel}</div>
            {sessionCount >= 2 && (
              <div className="streak-badge" style={{ marginTop: 10, alignSelf: "flex-start" }}>
                🔥 {sessionCount} sessions
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Focus Guard</div>
            <div
              className="focus-status"
              style={{
                background: active ? "var(--green-dim)" : "var(--border)",
                color: active ? "var(--green)" : "var(--muted)",
                marginBottom: 10,
              }}
              role="status"
              aria-live="polite"
            >
              <span className="focus-status-dot" />
              {active ? "Active — guarding focus" : "Inactive"}
            </div>
            <div className="text-sm text-muted" style={{ lineHeight: 1.7 }}>
              When you switch tabs during a session, you'll get a gentle nudge.{" "}
              <span style={{ color: "var(--violet-light)" }}>800ms debounce</span> — quick reference
              checks won't trigger it.
            </div>
          </div>

          <ShieldStatusCard
            rules={shieldRules}
            loading={shieldLoading}
            sessionActive={active && isWork}
            variant="session"
          />

          <div className="card">
            <div className="card-title">Affirmation</div>
            <Affirmations ref={affirmRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
