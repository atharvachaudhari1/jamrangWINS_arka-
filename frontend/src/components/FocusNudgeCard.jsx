import React, { useCallback, useEffect, useRef, useState } from "react";
import BreathingCircle from "./BreathingCircle";
import EnergyAfterPrompt from "./EnergyAfterPrompt";
import api from "../services/api";

export default function FocusNudgeCard({ nudge, energy, onClose, onEndSession }) {
  const [step, setStep] = useState("offer");
  const stepRef = useRef("offer");
  const sessionIdRef = useRef(null);
  const elapsedSecsRef = useRef(0);
  const endedRef = useRef(false);
  const primaryRef = useRef(null);
  const plannedSecs = nudge?.practice?.plannedSecs || 64;
  const nudgeId = nudge?.nudgeId;

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const patchNudge = (body) => {
    if (!nudgeId) return Promise.resolve();
    return api.patch(`/mindfulness/nudges/${nudgeId}`, body).catch(() => {});
  };

  const endBreathing = useCallback(async ({ completed, silent = false }) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const id = sessionIdRef.current;
    const secs = elapsedSecsRef.current;

    if (completed) {
      if (id) {
        await api.patch(`/mindfulness/sessions/${id}`, {
          completedSecs: plannedSecs,
          completed: true,
        }).catch(() => {});
        await patchNudge({ outcome: "completed", mindfulnessSessionId: id });
      } else {
        await patchNudge({ outcome: "completed" });
      }
      if (!silent) setStep("after");
      return;
    }

    if (!id || secs < 30) {
      if (id) {
        await api.delete(`/mindfulness/sessions/${id}`).catch(() => {});
        sessionIdRef.current = null;
      }
      await patchNudge({ outcome: "abandoned" });
    } else {
      await api.patch(`/mindfulness/sessions/${id}`, {
        completedSecs: Math.round(secs),
        completed: false,
      }).catch(() => {});
      await patchNudge({ outcome: "abandoned", mindfulnessSessionId: id });
    }
    if (!silent) onClose();
  }, [nudgeId, onClose, plannedSecs]);

  const endBreathingRef = useRef(endBreathing);
  endBreathingRef.current = endBreathing;

  // Silent on unmount: the parent already decided what state the overlay should be in.
  useEffect(() => {
    return () => {
      if (stepRef.current === "breathing" && !endedRef.current) {
        void endBreathingRef.current({ completed: false, silent: true });
      }
    };
  }, []);

  useEffect(() => {
    if (step !== "breathing") return undefined;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        void endBreathing({ completed: false });
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [step, endBreathing]);

  async function dismiss() {
    await patchNudge({ outcome: "dismissed" });
    onClose();
  }

  async function accept() {
    await patchNudge({ outcome: "accepted" });
    try {
      const data = await api.post("/mindfulness/sessions", {
        type: "breathing",
        plannedSecs,
        energyBefore: energy,
        triggeredBy: "nudge",
      });
      sessionIdRef.current = data?.session?._id || null;
    } catch {
      sessionIdRef.current = null;
    }
    elapsedSecsRef.current = 0;
    endedRef.current = false;
    setStep("breathing");
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && step === "offer") {
      event.preventDefault();
      void dismiss();
    }
  }

  async function saveEnergyAfter(level) {
    const id = sessionIdRef.current;
    if (id) {
      await api.patch(`/mindfulness/sessions/${id}`, { energyAfter: level }).catch(() => {});
    }
    onClose();
  }

  return (
    <div
      className="focus-overlay-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-nudge-title"
      onKeyDown={handleKeyDown}
    >
      {step === "offer" && (
        <>
          <div className="focus-overlay-icon">🌬️</div>
          <div className="focus-overlay-title" id="focus-nudge-title">Want a 1-minute reset?</div>
          <div className="focus-overlay-text">{nudge?.message}</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button ref={primaryRef} className="btn btn-primary" type="button" onClick={accept}>
              Breathe for 1 minute
            </button>
            <button className="btn btn-ghost" type="button" onClick={dismiss}>
              Not now
            </button>
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={onEndSession}
            style={{ marginTop: 10, fontSize: 13 }}
          >
            End session
          </button>
        </>
      )}

      {step === "breathing" && (
        <>
          <div className="focus-overlay-title" id="focus-nudge-title">1-minute box breathing</div>
          <BreathingCircle
            running
            onTick={(secs) => { elapsedSecsRef.current = secs; }}
            onComplete={() => { void endBreathing({ completed: true }); }}
          />
          <button className="btn btn-ghost" type="button" onClick={() => void endBreathing({ completed: false })}>
            Stop
          </button>
        </>
      )}

      {step === "after" && (
        <>
          <div className="focus-overlay-title" id="focus-nudge-title">Nice pause</div>
          <EnergyAfterPrompt onPick={saveEnergyAfter} onSkip={onClose} />
        </>
      )}
    </div>
  );
}