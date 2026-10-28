import React, { useEffect, useRef, useState } from "react";

import { tabAlertSound } from "../utils/sound";
import { notify } from "../utils/notify";
import { useEnergy } from "../contexts/EnergyContext";
import api from "../services/api";
import FocusNudgeCard from "./FocusNudgeCard";

// ── 3-State Focus FSM ────────────────────────────────────────────────────
// idle      → no session running
// focused   → session active, tab visible
// distracted → tab hidden, 800ms debounce timer started
// alert     → 800ms elapsed, show nudge overlay
//
// Transitions:
//   idle      → focused   : FocusTimer calls setFocusActive(true)
//   focused   → distracted: visibilitychange hidden
//   distracted → focused  : visibilitychange visible (cancel debounce)
//   distracted → alert    : 800ms timeout fires
//   alert     → focused   : user clicks "I'm back"
//   focused   → idle      : FocusTimer calls setFocusActive(false)
//   alert     → idle      : user clicks "End session"
//
// FocusTimer's countdown keeps running on purpose — this overlay does not pause it.

const STATES = { IDLE: "idle", FOCUSED: "focused", DISTRACTED: "distracted", ALERT: "alert" };

// Global bridge — FocusTimer calls this to start/stop a session
let _bridge = null;
export function setFocusActive(active, taskName = "") {
  if (_bridge) _bridge(active, taskName);
}

// Distraction counter accessible to FocusTimer on session complete
let _distractionCount = 0;
let _distractionCountRef = { current: 0 };
export function getDistractionCount() { return _distractionCountRef.current; }
export function resetDistractionCount() { _distractionCountRef.current = 0; }

export default function FocusOverlay() {
  const { energy } = useEnergy();
  const [state, setStateRaw] = useState(STATES.IDLE);
  const [taskName, setTaskName] = useState("");
  const [distractionCount, setDistractionCount] = useState(0);
  const [smartNudge, setSmartNudge] = useState(null);
  const stateRef = useRef(STATES.IDLE);
  const taskNameRef = useRef("");
  const debounceRef = useRef(null);
  const sessionStartRef = useRef(null);
  const distractionTimesRef = useRef([]);
  const nudgesThisSessionRef = useRef(0);
  const checkGenRef = useRef(0);
  const energyRef = useRef(energy);
  energyRef.current = energy;

  function setState(s) {
    stateRef.current = s;
    setStateRaw(s);
  }

  // Register bridge
  useEffect(() => {
    _bridge = (active, name) => {
      if (active) {
        sessionStartRef.current = Date.now();
        distractionTimesRef.current = [];
        nudgesThisSessionRef.current = 0;
        checkGenRef.current += 1;
        setSmartNudge(null);
        setState(STATES.FOCUSED);
        setTaskName(name);
        taskNameRef.current = name;
        setDistractionCount(0);
        _distractionCountRef.current = 0;
      } else {
        checkGenRef.current += 1;
        clearTimeout(debounceRef.current);
        setSmartNudge(null);
        setState(STATES.IDLE);
        setTaskName("");
      }
    };
    return () => { _bridge = null; };
  }, []);

  // Page Visibility FSM — single persistent listener using stateRef
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (stateRef.current === STATES.FOCUSED) {
          setState(STATES.DISTRACTED);
          debounceRef.current = setTimeout(() => {
            if (stateRef.current === STATES.DISTRACTED) {
              setState(STATES.ALERT);
              setSmartNudge(null);
              tabAlertSound.play();
              notify(
                "Hey, where'd you go?",
                taskNameRef.current
                  ? `You were working on "${taskNameRef.current}". Come back and finish strong.`
                  : "You switched away during a focus session. Come back and finish strong."
              );
              // Track distraction count for ML
              distractionTimesRef.current.push(Date.now());
              setDistractionCount((c) => {
                const next = c + 1;
                _distractionCountRef.current = next;
                return next;
              });
            }
          }, 800);
        }
      } else {
        // Tab came back
        if (stateRef.current === STATES.DISTRACTED) {
          clearTimeout(debounceRef.current);
          setState(STATES.FOCUSED);
        }
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(debounceRef.current);
    };
  }, []); // mount once — uses stateRef to avoid stale closures

  useEffect(() => {
    if (state !== STATES.ALERT) return undefined;
    const gen = ++checkGenRef.current;
    const started = sessionStartRef.current || Date.now();
    api.post("/mindfulness/nudges/check", {
      distractionTimes: distractionTimesRef.current.slice(),
      focusElapsedSecs: Math.max(0, Math.round((Date.now() - started) / 1000)),
      nudgesThisSession: nudgesThisSessionRef.current,
      energyLevel: energyRef.current,
    }).then((data) => {
      if (gen !== checkGenRef.current) return;
      if (stateRef.current !== STATES.ALERT) return;
      if (data && data.nudge) {
        nudgesThisSessionRef.current += 1;
        setSmartNudge(data);
      }
    }).catch(() => {
      // Fail open: the existing "I'm back" card stays.
    });
    return undefined;
    // energy is read via a ref so changing it mid-alert does not trigger a second check
  }, [state]);

  function onImBack() {
    checkGenRef.current += 1;
    setSmartNudge(null);
    if (stateRef.current === STATES.ALERT) setState(STATES.FOCUSED);
  }

  function onEndSession() {
    checkGenRef.current += 1;
    clearTimeout(debounceRef.current);
    setSmartNudge(null);
    setState(STATES.IDLE);
    setTaskName("");
  }

  if (state !== STATES.ALERT) return null;

  return (
    <div className="focus-overlay">
      {smartNudge ? (
        <FocusNudgeCard
          nudge={smartNudge}
          energy={energy}
          onClose={onImBack}
          onEndSession={onEndSession}
        />
      ) : (
        <div className="focus-overlay-card">
          <div className="focus-overlay-icon">🧘</div>
          <div className="focus-overlay-title">Hey, where'd you go?</div>
          <div className="focus-overlay-text">
            {taskName
              ? <>You were working on <strong>"{taskName}"</strong>.<br /></>
              : null}
            Take a slow breath and come back.
            <br />
            <span style={{ fontSize: 12, opacity: 0.7 }}>Try 30 seconds of belly breathing.</span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={onImBack}>
              I'm back ✓
            </button>
            <button className="btn btn-ghost" onClick={onEndSession}>
              End session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}