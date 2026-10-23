import React from "react";
import { Link } from "react-router-dom";
import { getShieldStatus } from "../../utils/focusShield";

// Reusable "how is Focus Shield doing right now" card.
// variant="dashboard" -> compact card for the Today screen
// variant="session"   -> panel shown inside an active Focus Session
export default function ShieldStatusCard({ rules, sessionActive = false, variant = "dashboard", loading = false }) {
  if (loading || !rules) {
    return (
      <div className="card fs-status-card">
        <div className="card-title">🛡️ Focus Shield</div>
        <p className="text-sm text-muted">Loading shield status…</p>
      </div>
    );
  }

  const status = getShieldStatus(rules, sessionActive);
  const blockedCount = rules.blockedSites?.length || 0;
  const whitelistCount = rules.whitelist?.length || 0;
  const topBlocked = (rules.blockedSites || []).filter((s) => s.enabled !== false).slice(0, 5);

  return (
    <div className="card fs-status-card">
      <div className="fs-status-card-header">
        <div className="card-title" style={{ marginBottom: 0 }}>🛡️ Focus Shield</div>
        <span className={`fs-status-pill fs-status-pill--${status.level}`}>
          <span className="fs-status-dot" />
          {status.label}
        </span>
      </div>
      <p className="text-sm text-muted" style={{ marginTop: 4, marginBottom: variant === "session" ? 12 : 14 }}>
        {status.description}
      </p>

      {variant === "session" ? (
        blockedCount > 0 ? (
          <ul className="fs-session-site-list" aria-label="Blocked websites">
            {topBlocked.map((s) => (
              <li key={s.value}>{s.label || s.value}</li>
            ))}
            {blockedCount > topBlocked.length && (
              <li className="text-muted">+{blockedCount - topBlocked.length} more</li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            No sites blocked yet — add some so the shield has something to guard.
          </p>
        )
      ) : (
        <div className="fs-dashboard-counts">
          <div>
            <div className="stat-value stat-violet" style={{ fontSize: 22 }}>{blockedCount}</div>
            <div className="stat-label">Blocked</div>
          </div>
          <div>
            <div className="stat-value stat-green" style={{ fontSize: 22 }}>{whitelistCount}</div>
            <div className="stat-label">Whitelisted</div>
          </div>
        </div>
      )}

      <Link to="/blocking" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
        Manage Rules
      </Link>
    </div>
  );
}
