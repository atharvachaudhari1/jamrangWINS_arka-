import React from "react";
import { useEnergy } from "../contexts/EnergyContext";
import { recordCheckIn } from "../services/rhythm";

const ENERGY_LEVELS = [
  { emoji: "💀", label: "Exhausted", color: "var(--muted)" },
  { emoji: "😔", label: "Low",       color: "var(--blue)" },
  { emoji: "😐", label: "Okay",      color: "var(--amber)" },
  { emoji: "⚡", label: "Good",      color: "var(--green)" },
  { emoji: "🔥", label: "Peak",      color: "var(--violet-light)" },
];

export default function EnergyControl({ compact = false }) {
  const { energy, setEnergy } = useEnergy();

  if (compact) {
    return (
      <div className="energy-control-compact">
        {ENERGY_LEVELS.map((lvl, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              className={`energy-dot ${n <= energy ? "filled" : ""}`}
              onClick={() => { setEnergy(n); recordCheckIn(n); }}
              title={`${lvl.emoji} ${lvl.label}`}
              aria-label={`Set energy to ${lvl.label}`}
              aria-pressed={n === energy}
              style={n <= energy ? { borderColor: ENERGY_LEVELS[energy - 1].color, background: ENERGY_LEVELS[energy - 1].color + "25" } : {}}
            >
              {n <= energy ? lvl.emoji : ""}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="energy-control">
      <div className="energy-control-row">
        {ENERGY_LEVELS.map((lvl, i) => {
          const n = i + 1;
          const isSelected = energy === n;
          return (
            <button
              key={n}
              className={`energy-btn ${isSelected ? "selected" : ""}`}
              onClick={() => { setEnergy(n); recordCheckIn(n); }}
              title={`${lvl.emoji} ${lvl.label}`}
              aria-label={`Set energy to ${lvl.label}`}
              aria-pressed={isSelected}
            >
              {lvl.emoji}
            </button>
          );
        })}
        <span className="energy-current-label">
          {ENERGY_LEVELS[energy - 1].label}
        </span>
      </div>
    </div>
  );
}
