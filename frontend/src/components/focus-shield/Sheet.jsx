import React, { useEffect } from "react";

// Bottom sheet on mobile, centered modal on desktop — same markup, responsive CSS (see
// .fs-sheet-overlay / .fs-sheet in styles.css) does the rest. Shared by every Focus Shield
// modal so we don't reimplement open/close/escape/backdrop handling per flow.
export default function Sheet({ open, onClose, title, children, labelledBy }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fs-sheet-overlay" onClick={onClose} aria-hidden="true" />
      <div className="fs-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="fs-sheet-header">
          <h2 id={labelledBy} className="fs-sheet-title">{title}</h2>
          <button type="button" className="fs-sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="fs-sheet-body">{children}</div>
      </div>
    </>
  );
}
