import React, { useMemo, useState } from "react";
import Sheet from "./Sheet";
import { POPULAR_SITES, normalizeDomain, isValidDomain } from "../../utils/focusShield";

export default function AddWebsiteSheet({ open, onClose, existingValues, onAdd, target }) {
  const [search, setSearch] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customError, setCustomError] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return POPULAR_SITES;
    return POPULAR_SITES.filter(
      (s) => s.label.toLowerCase().includes(q) || s.domain.includes(q) || s.category.toLowerCase().includes(q)
    );
  }, [search]);

  function handleClose() {
    setSearch("");
    setCustomValue("");
    setCustomError("");
    onClose();
  }

  function addPopular(site) {
    if (existingValues.has(site.domain)) return;
    onAdd([{ value: site.domain, label: site.label, enabled: true }]);
  }

  function addCustom() {
    const domain = normalizeDomain(customValue);
    if (!isValidDomain(domain)) {
      setCustomError("Enter a valid domain, e.g. example.com");
      return;
    }
    if (existingValues.has(domain)) {
      setCustomError("That site is already on this list");
      return;
    }
    onAdd([{ value: domain, label: "", enabled: true }]);
    setCustomValue("");
    setCustomError("");
  }

  function handleCustomKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={target === "whitelist" ? "Add to whitelist" : "Add website"}
      labelledBy="fs-add-sheet-title"
    >
      <div className="profile-form-field" style={{ marginBottom: 14 }}>
        <label className="profile-form-label" htmlFor="fs-add-search">Search</label>
        <input
          id="fs-add-search"
          className="profile-form-input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search popular sites or categories…"
        />
      </div>

      <p className="profile-form-label" style={{ marginBottom: 8 }}>Popular websites</p>
      <div className="fs-popular-grid">
        {filtered.map((site) => {
          const added = existingValues.has(site.domain);
          return (
            <button
              key={site.id}
              type="button"
              className={`fs-popular-chip${added ? " fs-popular-chip--added" : ""}`}
              onClick={() => addPopular(site)}
              disabled={added}
              aria-pressed={added}
            >
              <span className="fs-popular-emoji" aria-hidden="true">{site.emoji}</span>
              <span className="fs-popular-label">{site.label}</span>
              <span className="fs-popular-status">{added ? "✓ Added" : "+ Add"}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted">No matches — try adding it as a custom domain below.</p>
        )}
      </div>

      <div className="fs-sheet-divider" />

      <p className="profile-form-label" style={{ marginBottom: 8 }}>Custom domain</p>
      <div className="fs-custom-domain-row">
        <input
          className="profile-form-input"
          type="text"
          value={customValue}
          onChange={(e) => { setCustomValue(e.target.value); setCustomError(""); }}
          onKeyDown={handleCustomKey}
          placeholder="e.g. news.ycombinator.com"
          aria-label="Custom domain"
          aria-invalid={!!customError}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={addCustom} disabled={!customValue.trim()}>
          Add
        </button>
      </div>
      {customError && <p className="text-xs" style={{ color: "var(--red)", marginTop: 6 }}>{customError}</p>}

      <div className="fs-sheet-footer">
        <button type="button" className="btn btn-secondary w-full" onClick={handleClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
