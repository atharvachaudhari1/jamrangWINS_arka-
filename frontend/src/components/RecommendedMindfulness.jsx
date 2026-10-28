import React from "react";

const SOURCE_LABEL = {
  "ml-service": "ML",
  rules: "Smart rules",
};

export default function RecommendedMindfulness({ rec, loading, onStart }) {
  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 16, minHeight: 96 }}>
        <div className="text-xs text-muted">Finding a kind next step…</div>
      </div>
    );
  }

  if (!rec?.top) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Recommended for you</div>
        <p className="text-sm text-muted" style={{ marginBottom: 0 }}>
          No strong signal right now. Pick whichever practice feels gentlest.
        </p>
      </div>
    );
  }

  const { top, reasons = [], source, personalized } = rec;
  const badge = SOURCE_LABEL[source] || "Smart rules";

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        background:
          "linear-gradient(135deg, var(--violet-dim), var(--indigo-dim, rgba(99,102,241,0.12)))",
        border: "1px solid rgba(124, 58, 237, 0.28)",
      }}
    >
      <div className="flex gap-2" style={{ alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Recommended for you</div>
        <span className="badge badge-violet">{badge}</span>
        {personalized && <span className="badge badge-low">Personalized</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{top.title}</div>
      <p className="text-sm text-muted" style={{ marginBottom: 10 }}>
        {reasons[0] || top.description}
      </p>
      <button className="btn btn-primary" type="button" onClick={() => onStart(top)}>
        Start this practice
      </button>
    </div>
  );
}
