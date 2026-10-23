import React, { useEffect, useState } from "react";
import Sheet from "./Sheet";
import Toggle from "./Toggle";
import { normalizeDomain, isValidDomain } from "../../utils/focusShield";

export default function EditRuleSheet({ open, entry, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && entry) {
      setForm({ ...entry });
      setError("");
    }
  }, [open, entry]);

  if (!open || !form) return null;

  function handleSave() {
    const domain = normalizeDomain(form.value);
    if (!isValidDomain(domain)) {
      setError("Enter a valid domain, e.g. example.com");
      return;
    }
    onSave({ ...form, value: domain });
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit rule" labelledBy="fs-edit-sheet-title">
      <div className="profile-form" style={{ gap: 14 }}>
        <div className="profile-form-field">
          <label className="profile-form-label" htmlFor="fs-edit-label">Rule name (optional)</label>
          <input
            id="fs-edit-label"
            className="profile-form-input"
            type="text"
            value={form.label || ""}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Work Twitter"
            maxLength={100}
          />
        </div>

        <div className="profile-form-field">
          <label className="profile-form-label" htmlFor="fs-edit-domain">Domain</label>
          <input
            id="fs-edit-domain"
            className="profile-form-input"
            type="text"
            value={form.value}
            onChange={(e) => { setForm((f) => ({ ...f, value: e.target.value })); setError(""); }}
            placeholder="e.g. twitter.com"
            aria-invalid={!!error}
          />
          {error && <p className="text-xs" style={{ color: "var(--red)", marginTop: 4 }}>{error}</p>}
        </div>

        <div className="profile-form-field">
          <label className="profile-form-label" htmlFor="fs-edit-notes">Notes (optional)</label>
          <textarea
            id="fs-edit-notes"
            className="textarea profile-form-input"
            value={form.notes || ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Why is this rule here?"
            maxLength={300}
            rows={2}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="profile-form-label" style={{ textTransform: "none" }}>Enabled</span>
          <Toggle
            checked={form.enabled !== false}
            onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            label="Rule enabled"
          />
        </div>
      </div>

      <div className="fs-sheet-footer fs-sheet-footer--split">
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          Delete
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
