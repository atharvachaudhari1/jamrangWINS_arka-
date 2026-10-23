import React from "react";

// Shared on/off switch — used by the Focus Shield master toggle and per-row enable switches.
export default function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="fs-toggle"
      data-checked={checked || undefined}
    >
      <span className="fs-toggle-knob" />
    </button>
  );
}
