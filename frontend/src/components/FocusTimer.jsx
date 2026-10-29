import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api";
import { setFocusActive, getDistractionCount, resetDistractionCount } from "./FocusOverlay";
import Affirmations from "./Affirmations";
import ShieldStatusCard from "./focus-shield/ShieldStatusCard";
import { useBlockingStore } from "../stores/blockingStore";
import DayClock, { clockwise, formatClock, formatSpan } from "./DayClock";

function minutesNow() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.round(mins / 5) * 5 % 1440;
}

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
  const [windowStart, setWindowStart] = useState(minutesNow);
  const [active, setActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [reward, setReward] = useState(null);

  // Task linking
  const [tasks, setTasks] = useState([]);
  const [linkedTaskId, setLinkedTaskId] = useState("");
  const [tasksLoading, setTasksLoading] = useState(false);
  const autoStartedRef = useRef(false);

  const affirmRef = useRef();
  const intervalRef = useRef();

  const totalSecs = (isWork ? workMins : breakMins) * 60;
  const windowEnd = (windowStart + (isWork ? workMins : breakMins)) % 1440;

  const linkedTask = tasks.find((t) => t._id === linkedTaskId) || null;

  useEffect(() => { loadTasks(); }, []);

  useEffect(() => {
    function run(command) {
      if (command === "pause") { setActive(false); setFocusActive(false); return; }
      if (command === "reset") { reset(); return; }
      if (command === "deep") {
        setModeIdx(1); setWorkMins(50); setBreakMins(10); setIsWork(true); setWindowStart(minutesNow()); setSeconds(50 * 60); setActive(true); return;
      }
      setModeIdx(0); setWorkMins(25); setBreakMins(5); setIsWork(true); setWindowStart(minutesNow()); setSeconds(25 * 60); setActive(true);
    }
    const queued = sessionStorage.getItem("doorway-focus");
    if (queued) { sessionStorage.removeItem("doorway-focus"); run(queued); }
    const onVoice = (event) => run(event.detail);
    window.addEventListener("doorway-focus", onVoice);
    return () => window.removeEventListener("doorway-focus", onVoice);
  }, []);

  useEffect(() => {
    const taskId = new URLSearchParams(location.search).get("taskId") || location.state?.taskId;
    if (taskId) setLinkedTaskId(taskId);
  }, [location.search, location.state]);

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
      setWindowStart(minutesNow());
      reset(m.work, m.brk);
    }
  }, [modeIdx]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("autostart") !== "1" || autoStartedRef.current) return;
    const requested = Number.parseInt(params.get("minutes") || "2", 10);
    const minutes = Number.isFinite(requested) ? Math.max(1, Math.min(120, requested)) : 2;
    autoStartedRef.current = true;
    setWorkMins(minutes);
    setBreakMins(5);
    setIsWork(true);
    setWindowStart(minutesNow());
    setSeconds(minutes * 60);
    setActive(true);
  }, [location.search]);

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
    setWindowStart(next ? minutesNow() : (windowStart + workMins) % 1440);
    setIsWork(next);
    setSeconds((next ? workMins : breakMins) * 60);
  }

  function onWindowChange({ startMinutes, endMinutes }) {
    if (active || seconds !== totalSecs) return;
    const span = Math.min(180, Math.max(5, clockwise(startMinutes, endMinutes)));
    setWindowStart(startMinutes);
    if (isWork) setWorkMins(span);
    else setBreakMins(span);
    setSeconds(span * 60);
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
          <div className="energy-segmented-track mb-4" role="tablist" aria-label="Timer mode">
            {MODES.map((m, i) => {
              const isSelected = modeIdx === i;
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  className={`energy-segment-btn ${isSelected ? "selected" : ""}`}
                  onClick={() => setModeIdx(i)}
                  whileTap={{ scale: 0.96 }}
                  role="tab"
                  aria-selected={isSelected}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="timer-mode-pill"
                      className="energy-segmented-pill-bg"
                      transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
                    />
                  )}
                  <span className="energy-btn-label" style={{ fontWeight: isSelected ? 600 : 500 }}>
                    {m.label} ({m.work}m)
                  </span>
                </motion.button>
              );
            })}
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
              <div className="linked-task-badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                </svg>
                <span>{linkedTask.title}</span>
                {linkedTask.estimateMins && (
                  <span className="text-xs text-muted">~{linkedTask.estimateMins}m</span>
                )}
              </div>
            )}
          </div>

          <div className="study-clock">
            <div className="study-clock-dial">
              <DayClock
                startMinutes={windowStart}
                endMinutes={windowEnd}
                onChange={onWindowChange}
                locked={active || seconds !== totalSecs}
                minSpan={5}
                maxSpan={180}
                startLabel={isWork ? "Focus start" : "Break start"}
                endLabel={isWork ? "Focus end" : "Break end"}
                caption={isWork ? "Focus session" : "Break"}
              />
            </div>
            <div className="study-clock-side">
              <div className="study-clock-times">
                <div>
                  <div className="study-clock-kicker">Start</div>
                  <div className="study-clock-time">{formatClock(windowStart)}</div>
                  <div className="study-clock-when">Today</div>
                </div>
                <div>
                  <div className="study-clock-kicker">End</div>
                  <div className="study-clock-time">{formatClock(windowEnd)}</div>
                  <div className="study-clock-when">{windowEnd < windowStart ? "Tomorrow" : "Today"}</div>
                </div>
              </div>
              <div className="study-clock-duration" role="timer" aria-label={`${fmt(seconds)} ${isWork ? "focus" : "break"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(seconds)}
              </div>
              <p className="study-clock-note text-sm text-muted">
                {isWork ? "Focus" : "Rest"} · {formatSpan(isWork ? workMins : breakMins)}. Drag the marks to change the length before you start.
              </p>
              <div className="today-actions">
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
              className={`btn btn-lg ${active ? "btn-secondary" : "btn-primary"}`}
              onClick={toggle}
              style={{ minWidth: 140, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              aria-label={active ? "Pause timer" : "Start timer"}
            >
              {active ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1.5" />
                    <rect x="14" y="4" width="4" height="16" rx="1.5" />
                  </svg>
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Start focus</span>
                </>
              )}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
              className="btn btn-ghost btn-lg"
              onClick={() => reset()}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              aria-label="Reset timer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>Reset</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
              className="btn btn-ghost btn-lg"
              onClick={switchPhase}
              aria-label="Switch phase"
            >
              {isWork ? "Take Break" : "Back to Focus"}
            </motion.button>
              </div>
            </div>
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
              <div className="streak-badge" style={{ marginTop: 10, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
                <span>{sessionCount} sessions</span>
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
