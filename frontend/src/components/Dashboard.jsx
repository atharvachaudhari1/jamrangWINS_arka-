import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api";
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import TestDataButton from "./TestDataButton";

// ── Clean SVG Icons ───────────────────────────────────────────────────
const TasksIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l2 2 4-4" />
    <rect x="3" y="3" width="18" height="18" rx="3" />
  </svg>
);

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const FlameIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22c4-3 7-6 7-10a7 7 0 00-14 0c0 4 3 7 7 10z" />
    <path d="M12 22c-2-2-3-4-3-6a3 3 0 016 0c0 2-1 4-3 6z" />
  </svg>
);

const TrendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 8 14 12" />
    <path d="M2 20l6-6 4 4 10-10" />
  </svg>
);

function ChartLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      {items.map(({ label, color }) => (
        <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent }) {
  return (
    <motion.div
      className="dash-stat-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
    >
      <div className="dash-stat-icon" style={{ color: accent, background: accent + "18" }}>
        {icon}
      </div>
      <div className="dash-stat-body">
        <div className="dash-stat-label">{label}</div>
        <div className="dash-stat-value" style={{ color: accent }}>{value}</div>
        {sub && <div className="dash-stat-sub">{sub}</div>}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const [daily, setDaily] = useState({ tasksCompleted: 0, totalSessionMins: 0, tasks: [], sessions: [] });
  const [weekly, setWeekly] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [streak, setStreak] = useState(0);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [browserInsights, setBrowserInsights] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [d, w, m] = await Promise.all([
        api.get("/stats/daily"),
        api.get("/stats/weekly"),
        api.get("/stats/monthly"),
      ]);

      setDaily(d || { tasksCompleted: 0, totalSessionMins: 0 });

      const weekData = processWeekly(w.tasks || [], w.sessions || []);
      setWeekly(weekData);
      setMonthly(processMonthly(m.tasks || [], m.sessions || []));

      // Streak: consecutive days with at least 1 completed task
      const byDay = {};
      (w.tasks || []).forEach((t) => {
        const key = t.completedAt?.split("T")[0];
        if (key) byDay[key] = true;
      });
      let s = 0;
      for (let i = 0; i < 7; i++) {
        const dt = new Date();
        dt.setDate(dt.getDate() - i);
        const key = dt.toISOString().split("T")[0];
        if (byDay[key]) s++;
        else if (i > 0) break;
      }
      setStreak(s || 0);
      setTotalCompleted(weekData.reduce((acc, item) => acc + item.tasks, 0));
      setBrowserInsights(await api.get("/recommendation-events/insights"));
    } catch {}
  }

  function processWeekly(tasks, sessions) {
    const map = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en", { weekday: "short" });
      map[key] = { date: label, tasks: 0, minutes: 0 };
    }
    tasks.forEach((t) => {
      const key = t.completedAt?.split("T")[0];
      if (map[key]) map[key].tasks++;
    });
    sessions.forEach((s) => {
      const key = s.completedAt?.split("T")[0];
      if (map[key]) map[key].minutes += s.durationMins || 0;
    });
    return Object.values(map);
  }

  function processMonthly(tasks, sessions) {
    const map = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      map[key] = { date: label, tasks: 0, minutes: 0 };
    }
    tasks.forEach((t) => {
      const key = t.completedAt?.split("T")[0];
      if (map[key]) map[key].tasks++;
    });
    sessions.forEach((s) => {
      const key = s.completedAt?.split("T")[0];
      if (map[key]) map[key].minutes += s.durationMins || 0;
    });
    return Object.values(map);
  }

  const tooltipStyle = {
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text)",
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
  };

  const hasWeeklyData = weekly.some((d) => d.tasks > 0 || d.minutes > 0);
  const hasMonthlyData = monthly.some((d) => d.tasks > 0 || d.minutes > 0);

  const avgFocus = weekly.length
    ? Math.round(weekly.reduce((a, d) => a + d.minutes, 0) / weekly.length)
    : 0;
  const signalNow = browserInsights?.signalSummary?.current;
  const signalBefore = browserInsights?.signalSummary?.previous;
  const stuckShare = signalNow?.observedMinutes
    ? Math.round((signalNow.stuckMinutes / signalNow.observedMinutes) * 100)
    : null;
  const previousStuckShare = signalBefore?.observedMinutes
    ? Math.round((signalBefore.stuckMinutes / signalBefore.observedMinutes) * 100)
    : null;

  return (
    <div className="dash-container">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="dash-header">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Progress</h1>
          <p className="page-subtitle" style={{ margin: "4px 0 0" }}>Your study analytics and focus trends</p>
        </div>
        <TestDataButton onComplete={load} />
      </div>

      <section className="card" style={{ marginTop: 8, marginBottom: 20, padding: 18 }}>
        <h2 className="page-title" style={{ fontSize: 22, margin: 0 }}>Your effort is adding up</h2>
        <p className="page-subtitle">Small starts and completed resets from the last 7 days.</p>
        {!browserInsights || (browserInsights.shown === 0 && !(browserInsights.signalSummary?.current?.days > 0)) ? (
          <p className="page-subtitle">Connect Doorway in Chrome and turn on “Sync insights to my account” in More → Settings to see your small wins here. Optional sync sends daily aggregate counts and nudge outcomes, never websites, URLs, titles, or page content.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 12 }}>
            <div><strong>{browserInsights.startedCount || 0}</strong><div className="page-subtitle">first steps taken after a nudge</div></div>
            <div><strong>{browserInsights.restCompleted || 0}</strong><div className="page-subtitle">rest resets completed</div></div>
            <div><strong>{browserInsights.medianSecondsToAction == null ? "—" : `${browserInsights.medianSecondsToAction}s`}</strong><div className="page-subtitle">typical time to start</div></div>
          </div>
        )}
        {browserInsights?.shown > 0 && (
          <div style={{ marginTop: 12, color: "var(--muted)" }}>
            {browserInsights.startedCount > 0
              ? `You turned ${browserInsights.startedCount} difficult moment${browserInsights.startedCount === 1 ? "" : "s"} into a first step. That counts.`
              : "Every moment you notice is useful information. A small next step is progress too."}
            <div style={{ marginTop: 6 }}>These are rough browser signals, not a diagnosis. {browserInsights.line}</div>
          </div>
        )}
        {(signalNow?.days || 0) > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 600 }}>Browser patterns · estimate</div>
            <div className="page-subtitle" style={{ marginTop: 4 }}>
              {stuckShare == null ? "Collecting enough browser activity to show a trend." : `Stuck signals appeared in about ${stuckShare}% of observed minutes this week.`}
              {previousStuckShare != null && stuckShare != null && ` Last week: ${previousStuckShare}%.`}
            </div>
            <div className="page-subtitle" style={{ marginTop: 4 }}>
              {signalNow.idleMinutes} estimated idle min · {signalNow.switches} tab switches · {signalNow.observedMinutes} observed min
            </div>
            <div className="page-subtitle" style={{ marginTop: 4 }}>These are rough patterns, not a measure of effort or a diagnosis.</div>
          </div>
        )}
      </section>

      {/* ── Stat Cards Row ─────────────────────────────────────── */}
      <div className="dash-stats-grid">
        <StatCard
          icon={<TasksIcon />}
          label="Today's Tasks"
          value={daily.tasksCompleted || 0}
          sub="completed"
          accent="#bf5af2"
        />
        <StatCard
          icon={<ClockIcon />}
          label="Focus Time"
          value={`${daily.totalSessionMins || 0}m`}
          sub="today"
          accent="#30d158"
        />
        <StatCard
          icon={<FlameIcon />}
          label="Streak"
          value={`${streak}d`}
          sub="consecutive"
          accent="#ff9f0a"
        />
        <StatCard
          icon={<TrendIcon />}
          label="Weekly Total"
          value={totalCompleted}
          sub={`${avgFocus}m avg focus`}
          accent="#64d2ff"
        />
      </div>

      {/* ── Weekly Tasks Chart ─────────────────────────────────── */}
      <motion.div
        className="dash-chart-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
      >
        <div className="dash-chart-header">
          <div className="dash-chart-title">Tasks Completed — Last 7 Days</div>
          <ChartLegend items={[{ label: "Tasks", color: "#bf5af2" }]} />
        </div>
        {hasWeeklyData ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly} barSize={28}>
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, "auto"]}
                width={28}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "rgba(191, 90, 242, 0.08)" }}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="tasks" fill="#bf5af2" radius={[6, 6, 0, 0]} name="Tasks" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-chart-empty">
            No completed tasks logged this week. Focus sessions and completed tasks build up this graph.
          </div>
        )}
      </motion.div>

      {/* ── Focus Minutes Chart ────────────────────────────────── */}
      <motion.div
        className="dash-chart-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
      >
        <div className="dash-chart-header">
          <div className="dash-chart-title">Focus Minutes — Last 7 Days</div>
          <ChartLegend items={[{ label: "Minutes", color: "#30d158" }]} />
        </div>
        {hasWeeklyData ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly} barSize={28}>
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, "auto"]}
                width={28}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "rgba(48, 209, 88, 0.08)" }}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="minutes" fill="#30d158" radius={[6, 6, 0, 0]} name="Minutes" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-chart-empty">
            Start focus sessions to see your weekly minutes here.
          </div>
        )}
      </motion.div>

      {/* ── 30-Day Trend ───────────────────────────────────────── */}
      <motion.div
        className="dash-chart-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
      >
        <div className="dash-chart-header">
          <div className="dash-chart-title">30-Day Trend</div>
          <ChartLegend items={[
            { label: "Tasks", color: "#bf5af2" },
            { label: "Focus mins", color: "#30d158" },
          ]} />
        </div>
        {hasMonthlyData ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthly}>
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, "auto"]}
                width={28}
              />
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="tasks"
                stroke="#bf5af2"
                strokeWidth={2.2}
                dot={false}
                name="Tasks"
              />
              <Line
                type="monotone"
                dataKey="minutes"
                stroke="#30d158"
                strokeWidth={2.2}
                dot={false}
                name="Focus mins"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-chart-empty">
            Your 30-day focus velocity and task trends will appear here as you log sessions.
          </div>
        )}
      </motion.div>
    </div>
  );
}
