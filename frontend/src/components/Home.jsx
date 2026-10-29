import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import { useEnergy } from "../contexts/EnergyContext";
import EnergyControl from "./EnergyControl";
import TodayCard from "./TodayCard";
import ShieldStatusCard from "./focus-shield/ShieldStatusCard";
import TestDataButton from "./TestDataButton";
import { useBlockingStore } from "../stores/blockingStore";
import { TAGLINE } from "../config/brand";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 32,
      mass: 0.85,
    },
  },
};

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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="home-container-apple"
    >
      {/* ── Greeting ──────────────────────────────────── */}
      <motion.div variants={itemVariants} className="home-header-apple">
        <h1 className="page-title">
          {greeting}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="page-subtitle">{TAGLINE}</p>
      </motion.div>

      {/* ── Energy Check-in ───────── */}
      <motion.div variants={itemVariants} className="card mb-4 energy-card-apple">
        <div className="card-title">How's your energy right now?</div>
        <EnergyControl />
      </motion.div>

      <div className="grid-main">
        {/* ── Left column ───────────────────────────────── */}
        <div className="stack">
          <motion.div variants={itemVariants}>
            <TodayCard />
          </motion.div>

          {/* Today stats — Apple Health / Fitness widget styling */}
          <motion.div variants={itemVariants} className="grid-3">
            <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }} className="stat-tile stat-tile-apple">
              <div className="stat-icon-badge stat-green-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="stat-value stat-green">
                {daily.tasksCompleted > 0 ? daily.tasksCompleted : "—"}
              </div>
              <div className="stat-label">Tasks completed</div>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }} className="stat-tile stat-tile-apple">
              <div className="stat-icon-badge stat-blue-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="stat-value stat-blue">
                {daily.totalSessionMins > 0 ? daily.totalSessionMins : "—"}
              </div>
              <div className="stat-label">Focus minutes</div>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }} className="stat-tile stat-tile-apple">
              <div className="stat-icon-badge stat-amber-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
              </div>
              <div className="stat-value stat-amber">
                {activeDays > 0 ? activeDays : "—"}
              </div>
              <div className="stat-label">Days streak</div>
            </motion.div>
          </motion.div>
        </div>

        {/* ── Right column ──────────────────────────────── */}
        <div className="stack">
          <motion.div variants={itemVariants} className="card card-apple-actions">
            <div className="card-title">Quick actions</div>
            <div className="stack-sm">
              <Link to="/focus" className="btn btn-primary w-full" style={{ justifyContent: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                </svg>
                <span>Start Focus Session</span>
              </Link>
              <Link to="/tasks" className="btn btn-secondary w-full" style={{ justifyContent: "center" }}>
                Add an academic task
              </Link>
              <Link to="/notes" className="btn btn-ghost w-full" style={{ justifyContent: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                </svg>
                <span>Voice Notes</span>
              </Link>
              <Link to="/todo?tab=dump" className="btn btn-ghost w-full" style={{ justifyContent: "center" }}>
                Brain dump
              </Link>
              <Link to="/blocking" className="btn btn-ghost w-full" style={{ justifyContent: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Manage Focus Shield</span>
              </Link>
              <Link to="/dashboard" className="btn btn-ghost w-full" style={{ justifyContent: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>View Progress</span>
              </Link>
              <div style={{ paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                <TestDataButton
                  className="w-full"
                  style={{ justifyContent: "center" }}
                  onComplete={loadStats}
                />
              </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <ShieldStatusCard rules={shieldRules} loading={shieldLoading} variant="dashboard" />
          </motion.div>

          <motion.div variants={itemVariants} className="card card-apple-tip">
            <div className="card-title">Daily rhythm tip</div>
            <div className="text-sm" style={{ lineHeight: 1.6, color: "var(--text-soft)" }}>
              {energy <= 2
                ? "Low energy is valuable signal, not a deficit. One small step is plenty."
                : energy === 3
                ? "A balanced block of focus will move the needle today."
                : "Your energy is high — great time to tackle that assignment you’ve been deferring."}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
