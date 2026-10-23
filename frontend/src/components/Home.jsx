import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import { useEnergy } from "../contexts/EnergyContext";
import EnergyControl from "./EnergyControl";
import TodayCard from "./TodayCard";
import ShieldStatusCard from "./focus-shield/ShieldStatusCard";
import { useBlockingStore } from "../stores/blockingStore";
import { TAGLINE } from "../config/brand";

export default function Home() {
  const { user } = useUser();
  const { energy } = useEnergy();
  const { rules: shieldRules, loading: shieldLoading, setRules: setShieldRules, setLoading: setShieldLoading } = useBlockingStore();
  const [daily, setDaily] = useState({ tasksCompleted: 0, totalSessionMins: 0 });
  const [activeDays, setActiveDays] = useState(0);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    loadStats();
  }, [energy]);

  useEffect(() => {
    setShieldLoading(true);
    api.get("/blocking")
      .then((data) => setShieldRules(data.rules))
      .catch(() => {})
      .finally(() => setShieldLoading(false));
  }, []);

  async function loadStats() {
    try {
      const dailyStats = await api.get("/stats/daily");
      setDaily(dailyStats ?? { tasksCompleted: 0, totalSessionMins: 0 });
      const weekly = await api.get("/stats/weekly");
      if (weekly?.tasks) {
        const byDay = {};
        weekly.tasks.forEach((t) => {
          const key = t.completedAt?.split("T")[0];
          if (key) byDay[key] = true;
        });
        let s = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split("T")[0];
          if (byDay[key]) s++;
          else if (i > 0) break;
        }
        setActiveDays(s);
      }
    } catch {}
  }

  return (
    <div>
      {/* ── Greeting ──────────────────────────────────── */}
      <h1 className="page-title">
        {greeting}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="page-subtitle">{TAGLINE}</p>

      {/* ── Energy Check-in (unified component) ───────── */}
      <div className="card mb-4">
        <div className="card-title">How's your energy right now?</div>
        <EnergyControl />
      </div>

      <div className="grid-main">
        {/* ── Left column ───────────────────────────────── */}
        <div className="stack">
          <TodayCard />

          {/* Today stats */}
          <div className="grid-3">
            <div className="stat-tile">
              <div className="stat-value stat-green">
                {daily.tasksCompleted > 0 ? daily.tasksCompleted : "—"}
              </div>
              <div className="stat-label">Tasks done</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value stat-violet">
                {daily.totalSessionMins > 0 ? daily.totalSessionMins : "—"}
              </div>
              <div className="stat-label">Focus mins</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value stat-amber">
                {activeDays > 0 ? activeDays : "—"}
              </div>
              <div className="stat-label">Days with a finish</div>
            </div>
          </div>
        </div>

        {/* ── Right column ──────────────────────────────── */}
        <div className="stack">
          <div className="card">
            <div className="card-title">Quick actions</div>
            <div className="stack-sm">
              <Link to="/focus" style={{ textDecoration: "none" }}>
                <button className="btn btn-primary w-full">
                  🎯 Start Focus Session
                </button>
              </Link>
              <Link to="/tasks" style={{ textDecoration: "none" }}>
                <button className="btn btn-secondary w-full">
                  Add an academic task
                </button>
              </Link>
              <Link to="/todo?tab=dump" style={{ textDecoration: "none" }}>
                <button className="btn btn-ghost w-full">
                  Brain dump
                </button>
              </Link>
              <Link to="/blocking" style={{ textDecoration: "none" }}>
                <button className="btn btn-ghost w-full">
                  🛡️ Manage Focus Shield
                </button>
              </Link>
              <Link to="/dashboard" style={{ textDecoration: "none" }}>
                <button className="btn btn-ghost w-full">
                  📊 View Progress
                </button>
              </Link>
            </div>
          </div>

          <ShieldStatusCard rules={shieldRules} loading={shieldLoading} variant="dashboard" />

          <div className="card">
            <div className="card-title">Daily tip</div>
            <div className="text-sm" style={{ lineHeight: 1.7, color: "var(--text-soft)" }}>
              {energy <= 2
                ? "Low energy is useful information. A short step is enough."
                : energy === 3
                ? "A medium block of time can hold one clear step."
                : "Higher energy can hold a longer task. A short one is fine too."}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
