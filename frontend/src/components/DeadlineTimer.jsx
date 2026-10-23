import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

export default function DeadlineTimer(){
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]);

  useEffect(()=>{ load(); }, []);

  async function load(){
    const res = await api.get("/tasks");
    const upcoming = res.tasks.filter(t => t.dueAt);
    setTasks(upcoming);
  }

  function fmtDue(d) {
    const dt = new Date(d);
    const h = (dt - new Date()) / 3600000;
    if (h < 0) return { label: "Overdue!", color: "var(--red)" };
    if (h < 24) return { label: `Due in ~${Math.round(h)}h`, color: "var(--amber)" };
    return { label: dt.toLocaleDateString(), color: "var(--muted)" };
  }

  return (
    <div>
      <h1 className="page-title">Deadlines</h1>
      <p className="page-subtitle">Upcoming due dates from your tasks</p>

      <div className="grid-main">
        <div className="stack">
          {tasks.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              No deadlines found. Add a due date to a task to see it here.
            </div>
          ) : (
            tasks.map((t) => {
              const due = fmtDue(t.dueAt);
              return (
                <div className="card" key={t._id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold mb-1">{t.title}</div>
                      <div className="text-sm" style={{ color: due.color }}>{due.label}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate("/calendar")}
                    >
                      📅 Reschedule
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <aside className="card" style={{ alignSelf: "flex-start" }}>
          <div className="card-title">Tip</div>
          <div className="text-sm text-muted" style={{ lineHeight: 1.7 }}>
            Add due dates to tasks to see them here and on the Calendar.
            <br /><br />
            Tasks due within 24 hours show in amber. Overdue tasks show in red.
          </div>
        </aside>
      </div>
    </div>
  );
}
