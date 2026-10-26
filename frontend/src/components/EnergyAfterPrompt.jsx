import React from "react";

export default function EnergyAfterPrompt({ onPick, onSkip }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">How’s your energy now?</div>
      <p className="text-sm text-muted">Optional — this just helps tailor the next suggestion.</p>
      <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className="btn btn-secondary" onClick={() => onPick(n)}>
            {n}
          </button>
        ))}
        <button type="button" className="btn btn-ghost" onClick={onSkip}>Skip</button>
      </div>
    </div>
  );
}
