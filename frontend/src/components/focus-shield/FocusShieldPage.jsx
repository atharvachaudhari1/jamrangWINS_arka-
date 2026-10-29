import React, { useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { useBlockingStore } from "../../stores/blockingStore";
import Toggle from "./Toggle";
import PauseControl from "./PauseControl";
import PresetPicker from "./PresetPicker";
import WebsiteListManager from "./WebsiteListManager";
import { getShieldStatus } from "../../utils/focusShield";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AppEntryList({ items, onRemove, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.length === 0 && (
        <p className="text-xs text-muted" style={{ margin: 0 }}>{placeholder}</p>
      )}
      {items.map((item, idx) => (
        <div key={item._id || idx} className="fs-app-row">
          <span className="fs-row-domain">
            {item.value}
            {item.label && <span className="fs-row-domain-sub"> {item.label}</span>}
          </span>
          <button type="button" onClick={() => onRemove(idx)} className="fs-app-remove" aria-label={`Remove ${item.value}`}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function AppAddRow({ onAdd }) {
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");

  function handleAdd() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd({ value: trimmed, label: label.trim(), enabled: true });
    setValue("");
    setLabel("");
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <input
        className="profile-form-input"
        style={{ flex: "2 1 160px", minWidth: 0 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        placeholder="e.g. Instagram"
        maxLength={100}
      />
      <input
        className="profile-form-input"
        style={{ flex: "1 1 100px", minWidth: 0 }}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        placeholder="Package name (optional)"
        maxLength={100}
      />
      <button type="button" className="profile-save-btn" style={{ flexShrink: 0, padding: "0 16px" }} onClick={handleAdd} disabled={!value.trim()}>
        Add
      </button>
    </div>
  );
}

export default function FocusShieldPage() {
  const { loading, setRules, setLoading } = useBlockingStore();
  const [local, setLocal] = useState(null);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [statsSessions, setStatsSessions] = useState([]);
  const fileInputRef = useRef(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    setLoading(true);
    api.get("/blocking")
      .then((data) => {
        skipNextSave.current = true;
        setRules(data.rules);
        setLocal(data.rules);
      })
      .catch(() => setSaveState("error"))
      .finally(() => setLoading(false));

    api.get("/stats/weekly").then((d) => setStatsSessions(d?.sessions || [])).catch(() => {});
  }, []);

  // Autosave — every mutation (toggle, add, delete, pause, preset, schedule edit) flows
  // through `local` and lands here debounced, so the page never needs an explicit Save button.
  useEffect(() => {
    if (!local) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const data = await api.put("/blocking", local);
        setRules(data.rules);
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [local]);

  useEffect(() => {
    if (!local) return undefined;
    function run(value) {
      if (value === "on") setLocal((prev) => (prev ? { ...prev, isEnabled: true } : prev));
      if (value === "off") setLocal((prev) => (prev ? { ...prev, isEnabled: false } : prev));
    }
    const queued = sessionStorage.getItem("doorway-shield");
    if (queued) { sessionStorage.removeItem("doorway-shield"); run(queued); }
    const onVoice = (event) => run(event.detail);
    window.addEventListener("doorway-shield", onVoice);
    return () => window.removeEventListener("doorway-shield", onVoice);
  }, [local]);

  if (loading || !local) {
    return (
      <div className="profile-settings-page">
        <div className="profile-settings-container profile-settings-dashboard">
          <p className="text-sm text-muted">Loading Focus Shield…</p>
        </div>
      </div>
    );
  }

  function update(patch) {
    setLocal((prev) => ({ ...prev, ...patch }));
  }

  function updateSchedule(patch) {
    setLocal((prev) => ({ ...prev, schedule: { ...prev.schedule, ...patch } }));
  }

  function toggleDay(day) {
    const days = local.schedule.days.includes(day)
      ? local.schedule.days.filter((d) => d !== day)
      : [...local.schedule.days, day].sort((a, b) => a - b);
    updateSchedule({ days });
  }

  function addApp(entry) {
    update({ blockedApps: [...local.blockedApps, entry] });
  }

  function removeApp(idx) {
    update({ blockedApps: local.blockedApps.filter((_, i) => i !== idx) });
  }

  function handleExport() {
    const payload = {
      exportedAt: new Date().toISOString(),
      blockedSites: local.blockedSites,
      whitelist: local.whitelist,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "doorway-focus-shield-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const importedBlocked = Array.isArray(parsed.blockedSites) ? parsed.blockedSites : [];
        const importedWhitelist = Array.isArray(parsed.whitelist) ? parsed.whitelist : [];
        const haveBlocked = new Set(local.blockedSites.map((s) => s.value));
        const haveWhite = new Set(local.whitelist.map((s) => s.value));
        const newBlocked = importedBlocked.filter((s) => s?.value && !haveBlocked.has(s.value));
        const newWhite = importedWhitelist.filter((s) => s?.value && !haveWhite.has(s.value));
        update({
          blockedSites: [...local.blockedSites, ...newBlocked],
          whitelist: [...local.whitelist, ...newWhite],
        });
      } catch {
        setSaveState("error");
      }
    };
    reader.readAsText(file);
  }

  const status = getShieldStatus(local);
  const todaySessions = statsSessions.filter((s) => {
    const d = s.completedAt ? new Date(s.completedAt) : null;
    if (!d) return false;
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const distractionsToday = todaySessions.reduce((a, s) => a + (s.distractionCount || 0), 0);
  const distractionsWeek = statsSessions.reduce((a, s) => a + (s.distractionCount || 0), 0);

  return (
    <div className="profile-settings-page">
      <div className="profile-settings-container profile-settings-dashboard">
        <div className="profile-settings-header fs-page-header">
          <div>
            <h1 className="page-title">Focus Shield</h1>
            <p className="page-subtitle">
              Block distracting sites during focus sessions, and keep the ones you need.
            </p>
          </div>
          <span className="fs-save-indicator" aria-live="polite">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "✓ Saved"}
            {saveState === "error" && "⚠ Couldn't save"}
          </span>
        </div>

        <div className="profile-settings-split">
        <section className="profile-settings-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="profile-settings-card-title" style={{ marginBottom: 2 }}>Focus Shield</div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Enforcement runs in the Chrome extension (desktop) or native app (mobile).
              </p>
            </div>
            <Toggle checked={local.isEnabled} onChange={(v) => update({ isEnabled: v })} label="Focus Shield enabled" />
          </div>

          <div className={`fs-status-pill fs-status-pill--${status.level}`} style={{ marginTop: 14 }}>
            <span className="fs-status-dot" />
            {status.label} — {status.description}
          </div>

          <div style={{ marginTop: 16 }}>
            <PauseControl
              rules={local}
              saving={saveState === "saving"}
              onPause={(date) => update({ pausedUntil: date.toISOString() })}
              onResume={() => update({ pausedUntil: null })}
            />
          </div>
        </section>

        <section className="profile-settings-card">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Right now</h2>
          </div>
          <div className="grid-3">
            <div className="stat-tile">
              <div className="stat-value stat-violet">{local.blockedSites.length || "—"}</div>
              <div className="stat-label">Blocked sites</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value stat-green">{local.whitelist.length || "—"}</div>
              <div className="stat-label">Whitelisted</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value stat-amber">{distractionsToday > 0 ? distractionsToday : "—"}</div>
              <div className="stat-label">Distractions today</div>
            </div>
          </div>
          {distractionsWeek > 0 && (
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              {distractionsWeek} tab-switch distractions logged during focus sessions this week.
            </p>
          )}
        </section>
        </div>

        <PresetPicker blockedSites={local.blockedSites} onApply={(merged) => update({ blockedSites: merged })} />

        <div className="profile-settings-split">
        <WebsiteListManager
          title="Blocked Websites"
          description="Blocked during active focus sessions and any scheduled block window."
          items={local.blockedSites}
          onChange={(items) => update({ blockedSites: items })}
          target="blocked"
          emptyIcon="🚫"
          emptyTitle="No blocked websites yet"
          emptyBody="Protect your focus by blocking distracting websites — pick a popular one or add your own."
        />

        <WebsiteListManager
          title="Whitelisted Websites"
          description="Always allowed, even while the shield is blocking."
          items={local.whitelist}
          onChange={(items) => update({ whitelist: items })}
          target="whitelist"
          emptyIcon="✅"
          emptyTitle="No whitelisted websites yet"
          emptyBody="Add sites you always need — like docs or your work tools — so they're never blocked by mistake."
        />
        </div>

        <div className="profile-settings-split">
        <section className="profile-settings-card">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Blocked Apps</h2>
            <p className="profile-settings-card-desc">
              Add app names to block on mobile. Enforcement requires the native app.
            </p>
          </div>
          <div className="fs-notice">
            <span aria-hidden="true">⚠️</span>
            <p className="text-xs text-soft" style={{ margin: 0 }}>
              App blocking on Android requires <strong>Accessibility Service</strong> permissions. iOS requires{" "}
              <strong>FamilyControls</strong>. Rules saved here will be used once the native app is available.
            </p>
          </div>
          <AppEntryList items={local.blockedApps} onRemove={removeApp} placeholder="No blocked apps yet — add one below" />
          <AppAddRow onAdd={addApp} />
        </section>

        <section className="profile-settings-card">
          <div className="flex items-center justify-between gap-3" style={{ marginBottom: local.schedule.enabled ? 16 : 0 }}>
            <div>
              <div className="profile-settings-card-title" style={{ marginBottom: 2 }}>Scheduled blocking</div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>Block during specific hours and days, even without a focus session running.</p>
            </div>
            <Toggle checked={local.schedule.enabled} onChange={(v) => updateSchedule({ enabled: v })} label="Scheduled blocking enabled" />
          </div>

          {local.schedule.enabled && (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div className="profile-form-field" style={{ flex: "1 1 120px" }}>
                  <label className="profile-form-label">Start time</label>
                  <input className="profile-form-input" type="time" value={local.schedule.startTime} onChange={(e) => updateSchedule({ startTime: e.target.value })} />
                </div>
                <div className="profile-form-field" style={{ flex: "1 1 120px" }}>
                  <label className="profile-form-label">End time</label>
                  <input className="profile-form-input" type="time" value={local.schedule.endTime} onChange={(e) => updateSchedule({ endTime: e.target.value })} />
                </div>
              </div>
              <div>
                <p className="profile-form-label" style={{ marginBottom: 8 }}>Active days</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DAY_LABELS.map((d, i) => {
                    const active = local.schedule.days.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`fs-day-pill${active ? " fs-day-pill--active" : ""}`}
                        aria-pressed={active}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
        </div>

        <section className="profile-settings-card">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Import / Export</h2>
            <p className="profile-settings-card-desc">Back up your rules or move them to another device.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport}>
              ⭳ Export rules
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>
              ⭱ Import rules
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
          </div>
        </section>
      </div>
    </div>
  );
}
