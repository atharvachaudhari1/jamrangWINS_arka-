import React, { useEffect, useRef, useState } from "react";

import { tabAlertSound } from "../utils/sound";
import { notify } from "../utils/notify";

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
  const [state, setStateRaw] = useState(STATES.IDLE);
  const [taskName, setTaskName] = useState("");
  const [distractionCount, setDistractionCount] = useState(0);
  const stateRef = useRef(STATES.IDLE);
  const taskNameRef = useRef("");
  const debounceRef = useRef(null);

  function setState(s) {
    stateRef.current = s;
    setStateRaw(s);
  }

  // Register bridge
  useEffect(() => {
    _bridge = (active, name) => {
      if (active) {
        setState(STATES.FOCUSED);
        setTaskName(name);
        taskNameRef.current = name;
        setDistractionCount(0);
        _distractionCountRef.current = 0;
      } else {
        clearTimeout(debounceRef.current);
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
              tabAlertSound.play();
              notify(
                "Hey, where'd you go?",
                taskNameRef.current
                  ? `You were working on "${taskNameRef.current}". Come back and finish strong.`
                  : "You switched away during a focus session. Come back and finish strong."
              );
              // Track distraction count for ML
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

  function onImBack() {
    setState(STATES.FOCUSED);
  }

  function onEndSession() {
    clearTimeout(debounceRef.current);
    setState(STATES.IDLE);
    setTaskName("");
  }

  if (state !== STATES.ALERT) return null;

  return (
    <div className="focus-overlay">
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
    </div>
  );
}
