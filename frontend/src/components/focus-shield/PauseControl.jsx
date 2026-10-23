import React, { useState } from "react";
import { PAUSE_PRESETS, computePauseUntil, formatClockTime, isPaused } from "../../utils/focusShield";

// Temporary-disable control: quick presets (15m/30m/1h/tomorrow) plus a custom-minutes option.
// Pausing writes `pausedUntil` back through the normal PUT /blocking save path, so it
// propagates to the Chrome extension on its next sync — no separate endpoint needed.
export default function PauseControl({ rules, saving, onPause, onResume }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(45);

  if (!rules?.isEnabled) return null;

  if (isPaused(rules)) {
    return (
      <div className="fs-pause-banner" role="status" aria-live="polite">
        <span>⏸ Paused — resumes at {formatClockTime(rules.pausedUntil)}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onResume} disabled={saving}>
          Resume now
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="profile-form-label" style={{ marginBottom: 8 }}>Pause blocking</p>
      <div className="fs-pause-row">
        {PAUSE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => onPause(computePauseUntil(p.id))}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={saving}
          onClick={() => setCustomOpen((o) => !o)}
          aria-expanded={customOpen}
        >
          Custom…
        </button>
      </div>
      {customOpen && (
        <div className="fs-pause-custom">
          <input
            type="number"
            min={1}
            max={1440}
            className="profile-form-input"
            style={{ width: 90 }}
            value={customMinutes}
            onChange={(e) => setCustomMinutes(Number(e.target.value))}
            aria-label="Custom pause duration in minutes"
          />
          <span className="text-sm text-muted">minutes</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving || !customMinutes || customMinutes < 1}
            onClick={() => onPause(computePauseUntil("custom", customMinutes))}
          >
            Pause
          </button>
        </div>
      )}
    </div>
  );
}
