import React, { useEffect, useRef, useState } from "react";
import { categoryForDomain } from "../../utils/focusShield";
import Toggle from "./Toggle";

function RowMenu({ onEdit, onDelete, domain }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="fs-row-menu" ref={ref}>
      <button
        type="button"
        className="fs-row-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${domain}`}
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="fs-row-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>
            Edit
          </button>
          <button type="button" role="menuitem" className="fs-row-menu-danger" onClick={() => { setOpen(false); onDelete(); }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function WebsiteRow({ entry, selected, onToggleSelect, onToggleEnabled, onEdit, onDelete }) {
  const category = categoryForDomain(entry.value);
  const enabled = entry.enabled !== false;

  return (
    <div className={`fs-row${selected ? " fs-row--selected" : ""}`}>
      <input
        type="checkbox"
        className="fs-row-checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${entry.value}`}
      />
      <div className="fs-row-main">
        <div className="fs-row-domain">
          {entry.label ? <span>{entry.label}</span> : null}
          <span className={entry.label ? "fs-row-domain-sub" : ""}>{entry.value}</span>
        </div>
        <div className="fs-row-meta">
          <span className="badge badge-violet">{category}</span>
          {!enabled && <span className="badge" style={{ background: "var(--border)", color: "var(--muted)" }}>Disabled</span>}
          {entry.notes && <span className="text-xs text-muted fs-row-notes">{entry.notes}</span>}
        </div>
      </div>
      <div className="fs-row-actions">
        <Toggle checked={enabled} onChange={onToggleEnabled} label={`${enabled ? "Disable" : "Enable"} ${entry.value}`} />
        <RowMenu domain={entry.value} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}
