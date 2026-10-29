import React from "react";
import { motion } from "framer-motion";
import { useEnergy } from "../contexts/EnergyContext";
import { recordCheckIn } from "../services/rhythm";

const ENERGY_LEVELS = [
  { level: 1, label: "Exhausted", color: "var(--muted)", bars: 1 },
  { level: 2, label: "Low",       color: "var(--blue)",  bars: 2 },
  { level: 3, label: "Okay",      color: "var(--amber)", bars: 3 },
  { level: 4, label: "Good",      color: "var(--green)", bars: 4 },
  { level: 5, label: "Peak",      color: "var(--violet)", bars: 5 },
];

function EnergyMeterIcon({ bars, activeColor, isSelected }) {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((idx) => {
        const height = 4 + idx * 2; // stepped heights: 6, 8, 10, 12, 14
        const y = 14 - height;
        const x = (idx - 1) * 4.2;
        const filled = idx <= bars;
        return (
          <rect
            key={idx}
            x={x}
            y={y}
            width="2.8"
            height={height}
            rx="1.2"
            fill={filled ? (isSelected ? activeColor : "var(--muted)") : "rgba(255, 255, 255, 0.12)"}
          />
        );
      })}
    </svg>
  );
}

export default function EnergyControl({ compact = false }) {
  const { energy, setEnergy } = useEnergy();

  const handleSelect = (n) => {
    setEnergy(n);
    recordCheckIn(n);
  };

  if (compact) {
    return (
      <div className="energy-control-compact-apple" role="radiogroup" aria-label="Energy level selector">
        {ENERGY_LEVELS.map((lvl) => {
          const n = lvl.level;
          const isSelected = energy === n;
          return (
            <motion.button
              key={n}
              type="button"
              className={`energy-dot-apple ${isSelected ? "selected" : ""}`}
              onClick={() => handleSelect(n)}
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
              title={`Level ${n}: ${lvl.label}`}
              aria-label={`Set energy to ${lvl.label}`}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <motion.div
                  layoutId="compact-energy-pill"
                  className="energy-dot-pill"
                  style={{ backgroundColor: lvl.color }}
                  transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
                />
              )}
              <span className="energy-dot-label" style={{ opacity: isSelected ? 1 : 0.65, fontSize: 11, fontWeight: 700 }}>
                {n}
              </span>
            </motion.button>
          );
        })}
      </div>
    );
  }

  const currentLevel = ENERGY_LEVELS[energy - 1] || ENERGY_LEVELS[2];

  return (
    <div className="energy-control-apple" role="radiogroup" aria-label="Energy check-in">
      <div className="energy-segmented-track">
        {ENERGY_LEVELS.map((lvl) => {
          const n = lvl.level;
          const isSelected = energy === n;
          return (
            <motion.button
              key={n}
              type="button"
              className={`energy-segment-btn ${isSelected ? "selected" : ""}`}
              onClick={() => handleSelect(n)}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
              aria-label={`Set energy level to ${lvl.label}`}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <motion.div
                  layoutId="energy-segmented-pill"
                  className="energy-segmented-pill-bg"
                  style={{
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
                />
              )}
              <span className="energy-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                <EnergyMeterIcon bars={lvl.bars} activeColor={lvl.color} isSelected={isSelected} />
              </span>
              <span className="energy-btn-label" style={{ fontWeight: isSelected ? 600 : 500 }}>
                {lvl.label}
              </span>
            </motion.button>
          );
        })}
      </div>
      <motion.div
        key={energy}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="energy-status-caption"
      >
        <span
          className="energy-status-indicator"
          style={{ backgroundColor: currentLevel.color }}
        />
        <span>Current rhythm: <strong>{currentLevel.label}</strong> — tasks are adapted to your capacity.</span>
      </motion.div>
    </div>
  );
}
