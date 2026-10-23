import React, { useMemo, useState } from "react";
import WebsiteRow from "./WebsiteRow";
import AddWebsiteSheet from "./AddWebsiteSheet";
import EditRuleSheet from "./EditRuleSheet";
import { categoryForDomain } from "../../utils/focusShield";

// Generic add/edit/delete/search/bulk-action manager for one list of domains — reused for
// both "Blocked Websites" and "Whitelisted Websites" so the two sections never drift apart.
export default function WebsiteListManager({
  title,
  description,
  items,
  onChange,
  target,
  emptyIcon,
  emptyTitle,
  emptyBody,
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (e) =>
        e.value.toLowerCase().includes(q) ||
        (e.label || "").toLowerCase().includes(q) ||
        categoryForDomain(e.value).toLowerCase().includes(q)
    );
  }, [items, search]);

  const existingValues = useMemo(() => new Set(items.map((e) => e.value)), [items]);

  function toggleSelect(value) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function updateEntry(value, patch) {
    onChange(items.map((e) => (e.value === value ? { ...e, ...patch } : e)));
  }

  function deleteEntry(value) {
    onChange(items.filter((e) => e.value !== value));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(value);
      return next;
    });
  }

  function bulkSetEnabled(enabled) {
    onChange(items.map((e) => (selected.has(e.value) ? { ...e, enabled } : e)));
  }

  function bulkDelete() {
    onChange(items.filter((e) => !selected.has(e.value)));
    clearSelection();
  }

  function handleAdd(newEntries) {
    onChange([...items, ...newEntries]);
  }

  return (
    <section className="profile-settings-card">
      <div className="profile-settings-card-header fs-section-header">
        <div>
          <h2 className="profile-settings-card-title">{title}</h2>
          <p className="profile-settings-card-desc">{description}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
          + Add website
        </button>
      </div>

      {items.length > 0 && (
        <div className="fs-toolbar">
          <input
            type="search"
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Search domain, name, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Search ${title.toLowerCase()}`}
          />
          {selected.size > 0 && (
            <div className="fs-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
              <span className="text-xs text-muted">{selected.size} selected</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => bulkSetEnabled(true)}>Enable</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => bulkSetEnabled(false)}>Disable</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={bulkDelete}>Delete</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearSelection} aria-label="Clear selection">✕</button>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{emptyIcon}</div>
          <div className="empty-state-title">{emptyTitle}</div>
          <p className="empty-state-body">{emptyBody}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            + Add website
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted" style={{ padding: "12px 0" }}>
          No sites match "{search}".
        </p>
      ) : (
        <div className="fs-row-list">
          {filtered.map((entry) => (
            <WebsiteRow
              key={entry.value}
              entry={entry}
              selected={selected.has(entry.value)}
              onToggleSelect={() => toggleSelect(entry.value)}
              onToggleEnabled={(v) => updateEntry(entry.value, { enabled: v })}
              onEdit={() => setEditing(entry)}
              onDelete={() => deleteEntry(entry.value)}
            />
          ))}
        </div>
      )}

      <AddWebsiteSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingValues={existingValues}
        onAdd={handleAdd}
        target={target}
      />

      <EditRuleSheet
        open={!!editing}
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={(updated) => { updateEntry(editing.value, updated); setEditing(null); }}
        onDelete={() => { deleteEntry(editing.value); setEditing(null); }}
      />
    </section>
  );
}
