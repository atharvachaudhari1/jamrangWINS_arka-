import React, { useState } from "react";
import { PRESETS, mergeDomains } from "../../utils/focusShield";

// One-click presets — populate blockedSites with a recommended set of domains for a role.
// Non-destructive: merges in new domains, never removes what the user already added.
export default function PresetPicker({ blockedSites, onApply }) {
  const [appliedId, setAppliedId] = useState(null);

  function apply(preset) {
    const merged = mergeDomains(
      blockedSites,
      preset.domains.map((d) => ({ value: d, label: "" }))
    );
    onApply(merged);
    setAppliedId(preset.id);
    setTimeout(() => setAppliedId(null), 2000);
  }

  return (
    <section className="profile-settings-card">
      <div className="profile-settings-card-header">
        <h2 className="profile-settings-card-title">Smart presets</h2>
        <p className="profile-settings-card-desc">
          One click adds a recommended blocklist for your situation. You can still edit anything after.
        </p>
      </div>
      <div className="fs-preset-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="fs-preset-card"
            onClick={() => apply(preset)}
          >
            <span className="fs-preset-emoji" aria-hidden="true">{preset.emoji}</span>
            <span className="fs-preset-label">{preset.label}</span>
            <span className="fs-preset-desc">{preset.description}</span>
            <span className="fs-preset-status">
              {appliedId === preset.id ? "✓ Applied" : `${preset.domains.length} sites`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
