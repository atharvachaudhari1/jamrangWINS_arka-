import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

const PHASES = [
  { name: "Inhale", scale: 1.42 },
  { name: "Hold", scale: 1.42 },
  { name: "Exhale", scale: 1 },
  { name: "Hold", scale: 1 },
];
const ROUNDS = 4;
export const BREATHING_PLANNED_SECS = ROUNDS * 16;

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function BreathingCircle({ running, onTick, onComplete }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [round, setRound] = useState(1);
  const elapsedRef = useRef(0);
  const onTickRef = useRef(onTick);
  const onCompleteRef = useRef(onComplete);
  const reduced = useMemo(prefersReducedMotion, []);

  useEffect(() => { onTickRef.current = onTick; }, [onTick]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!running) {
      setPhaseIndex(0);
      setRound(1);
      elapsedRef.current = 0;
      return undefined;
    }

    elapsedRef.current = 0;
    setPhaseIndex(0);
    setRound(1);
    const tick = setInterval(() => {
      elapsedRef.current += 1;
      onTickRef.current?.(elapsedRef.current);
      if (elapsedRef.current >= BREATHING_PLANNED_SECS) {
        clearInterval(tick);
        onCompleteRef.current?.();
      }
    }, 1000);

    const phaseTimer = setInterval(() => {
      setPhaseIndex((prev) => {
        const next = prev + 1;
        if (next % PHASES.length === 0) {
          setRound((r) => Math.min(ROUNDS, r + 1));
        }
        return next % PHASES.length;
      });
    }, 4000);

    return () => {
      clearInterval(tick);
      clearInterval(phaseTimer);
    };
  }, [running]);

  const phase = PHASES[phaseIndex];
  const scale = reduced ? 1 : phase.scale;

  return (
    <div style={{ display: "grid", placeItems: "center", padding: "28px 0 12px" }}>
      <motion.div
        animate={{ scale }}
        transition={reduced ? { duration: 0 } : { duration: 4, ease: "easeInOut" }}
        style={{
          width: 168,
          height: 168,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 30% 30%, rgba(167,139,250,0.95), var(--violet))",
          boxShadow: "0 0 40px rgba(124, 58, 237, 0.35)",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{phase.name}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>4-4-4-4</div>
        </div>
      </motion.div>
      <div className="text-xs text-muted" style={{ marginTop: 12 }}>
        Round {Math.min(round, ROUNDS)} of {ROUNDS}
      </div>
    </div>
  );
}
