import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import { notify } from "../utils/notify";
import { scheduleDeadline, clearDeadline } from "../utils/deadlineScheduler";
import { useEnergy } from "../contexts/EnergyContext";

// ── Dread pip colours ────────────────────────────────────────────────────
function DreadMeter({ score, onChange }) {
  return (
    <div className="dread-meter" title={`Dread: ${score}/5`} role="group" aria-label={`Dread score ${score} of 5`}>
      <span className="text-xs text-muted" style={{ marginRight: 4 }}>Dread</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`dread-pip ${n <= score ? `active-${score}` : ""}`}
          onClick={() => onChange && onChange(n)}
          role="button"
          tabIndex={0}
          aria-label={`Dread level ${n}`}
          onKeyDown={(e) => e.key === "Enter" && onChange && onChange(n)}
        />
      ))}
    </div>
  );
}

function PriorityBadge({ level }) {
  if (!level) return null;
  const cls = level === "High" ? "badge-high" : level === "Medium" ? "badge-medium" : "badge-low";
  return <span className={`badge ${cls}`}>{level}</span>;
}

const SUGGESTION_STYLES = {
  priority:    { borderLeft: "3px solid var(--violet)", background: "var(--violet-dim)" },
  chunk:       { borderLeft: "3px solid var(--green)",  background: "var(--green-dim)" },
  deadline:    { borderLeft: "3px solid var(--red)",    background: "var(--red-dim)" },
  "quick-win": { borderLeft: "3px solid var(--amber)",  background: "var(--amber-dim)" },
  nudge:       { borderLeft: "3px solid var(--blue)",   background: "rgba(59,130,246,0.08)" },
};

const SUGGESTION_LABELS = {
  priority:    "Priority",
  chunk:       "Break Down",
  deadline:    "Urgent",
  "quick-win": "Quick Win",
  nudge:       "Tip",
};

// ── Simplified add-task row: one field, expand for details ───────────────
function AddTaskRow({ onAdd }) {
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [due, setDue] = useState("");
  const [estimate, setEstimate] = useState(30);
  const [dreadScore, setDreadScore] = useState(3);
  const inputRef = useRef();

  async function submit() {
    if (!title.trim()) return;
    await onAdd({ title: title.trim(), dueAt: due || null, estimateMins: Number(estimate), dreadScore: Number(dreadScore) });
    setTitle("");
    setDue("");
    setEstimate(30);
    setDreadScore(3);
    setExpanded(false);
    inputRef.current?.focus();
  }

  return (
    <div className="card card-sm add-task-row">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="input"
          style={{ flex: 1 }}
          placeholder="What do you need to do?"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Tab" && title.trim() && !expanded) { e.preventDefault(); setExpanded(true); }
          }}
          aria-label="New task title"
        />
        {title.trim() && !expanded && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(true)}
            aria-label="Show more options"
            title="Add details"
          >
            + Details
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={!title.trim()}
          aria-label="Add task"
          style={{ minWidth: 64 }}
        >
          Add
        </button>
      </div>

      {expanded && (
        <div className="add-task-details">
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="text-xs text-muted" style={{ display: "block", marginBottom: 4 }}>Due date</label>
              <input
                className="input"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                aria-label="Due date"
              />
            </div>
            <div style={{ width: 100 }}>
              <label className="text-xs text-muted" style={{ display: "block", marginBottom: 4 }}>Minutes</label>
              <input
                className="input"
                type="number"
                placeholder="30"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                min={1}
                aria-label="Estimated minutes"
              />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <DreadMeter score={dreadScore} onChange={setDreadScore} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TodoList() {
  const { energy } = useEnergy();
  const [searchParams] = useSearchParams();

  const [tasks, setTasks] = useState([]);
  const [completing, setCompleting] = useState(null);
  const [reward, setReward] = useState(null);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editEstimate, setEditEstimate] = useState(30);
  const [editDread, setEditDread] = useState(3);

  // Brain dump
  const [dumpText, setDumpText] = useState("");
  const [dumpLoading, setDumpLoading] = useState(false);
  const [view, setView] = useState(searchParams.get("tab") === "dump" ? "dump" : "tasks");

  // AI suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(new Set());

  useEffect(() => { load(); }, [energy]);

  useEffect(() => {
    tasks.forEach((task) => {
      if (task.dueAt && !task.completed) scheduleDeadline(task);
    });
    return () => { tasks.forEach((t) => clearDeadline(t._id)); };
  }, [tasks]);

  useEffect(() => {
    if (tasks.length > 0) fetchSuggestions();
    else setSuggestions([]);
  }, [tasks.length, energy]);

  async function load() {
    try {
      const res = await api.get(`/tasks?energyLevel=${energy}`);
      setTasks((res.tasks || []).filter((t) => !t.completed));
    } catch { setTasks([]); }
  }

  async function fetchSuggestions() {
    setSuggestionsLoading(true);
    try {
      const [suggestRes, mindRes] = await Promise.allSettled([
        api.get(`/tasks/ai/suggestions?energyLevel=${energy}`),
        api.get(`/recommendations/mindfulness?energyLevel=${energy}`),
      ]);

      if (suggestRes.status === "fulfilled") {
        const allSuggestions = suggestRes.value.suggestions || [];
        if (mindRes.status === "fulfilled" && mindRes.value.suggested && mindRes.value.top) {
          const m = mindRes.value.top;
          allSuggestions.unshift({
            id: "mindful_" + Date.now(),
            type: "nudge",
            title: `🧘 ${m.title}`,
            description: m.description,
            action: "mindfulness",
          });
        }
        const fresh = allSuggestions.filter((s) => !dismissedIds.has(s.id));
        setSuggestions(fresh);
      } else {
        setSuggestions([]);
      }
    } catch { setSuggestions([]); }
    finally { setSuggestionsLoading(false); }
  }

  async function add({ title, dueAt, estimateMins, dreadScore }) {
    try {
      const res = await api.post("/tasks", { title, dueAt, estimateMins, dreadScore });
      const task = res.task;
      if (task?.dueAt) {
        scheduleDeadline(task);
        notify("📅 Deadline set", `You'll be reminded when "${task.title}" is due.`);
      }
      load();
    } catch { alert("Could not add task"); }
  }

  async function complete(id) {
    setCompleting(id);
    showReward("✅");
    setTimeout(async () => {
      try {
        await api.put(`/tasks/${id}/complete`, { energyLevel: energy });
        clearDeadline(id);
        notify("✅ Task completed", "Well done. One less thing to worry about.");
        load();
      } catch {}
      setCompleting(null);
    }, 450);
  }

  async function autoChunk(t) {
    try {
      await api.post(`/tasks/${t._id}/auto-chunk`, {});
      load();
      notify("🧩 Chunked", `"${t.title}" has been broken into sub-tasks.`);
    } catch { alert("Chunk failed"); }
  }

  async function saveEdit(id) {
    try {
      await api.put(`/tasks/${id}`, {
        title: editTitle,
        dueAt: editDue || null,
        estimateMins: Number(editEstimate),
        dreadScore: Number(editDread),
      });
      setEditingId(null);
      load();
    } catch { alert("Failed to update task"); }
  }

  async function updateDread(id, score) {
    try {
      await api.put(`/tasks/${id}`, { dreadScore: score });
      setTasks((prev) => prev.map((t) => t._id === id ? { ...t, dreadScore: score } : t));
    } catch {}
  }

  async function submitDump() {
    if (!dumpText.trim()) return;
    setDumpLoading(true);
    try {
      const res = await api.post("/tasks/brain-dump", { text: dumpText, energyLevel: energy });
      const count = res.tasks?.length || 0;
      notify("🧠 Dumped!", `${count} task${count !== 1 ? "s" : ""} extracted.`);
      setDumpText("");
      setView("tasks");
      load();
    } catch { alert("Brain dump failed"); }
    finally { setDumpLoading(false); }
  }

  function acceptSuggestion(s) {
    if (s.type === "quick-win" && s.taskId) {
      complete(s.taskId);
    } else if (s.action === "mindfulness") {
      window.location.href = "/mindful";
      return;
    } else if (s.action === "prioritize" && s.taskId) {
      api.post("/recommendation-events", {
        type: "started",
        taskId: s.taskId,
        energyLevel: energy,
        wasRecommended: true,
      }).catch(() => {});
      document.getElementById(`task-${s.taskId}`)?.scrollIntoView({ behavior: "smooth" });
    }
    setSuggestions((p) => p.filter((x) => x.id !== s.id));
    setDismissedIds((p) => new Set([...p, s.id]));
  }

  function dismissSuggestion(s) {
    setSuggestions((p) => p.filter((x) => x.id !== s.id));
    setDismissedIds((p) => new Set([...p, s.id]));
  }

  function showReward(emoji) {
    setReward(emoji);
    setTimeout(() => setReward(null), 900);
  }

  function fmtDue(d) {
    if (!d) return "No due date";
    const dt = new Date(d);
    const now = new Date();
    const h = (dt - now) / 3600000;
    if (h < 0) return "Overdue!";
    if (h < 24) return `Due in ${Math.round(h)}h`;
    return dt.toLocaleDateString();
  }

  const sortedTasks = tasks;

  return (
    <div>
      {reward && <div className="reward-burst">{reward}</div>}

      <div className="flex items-center justify-between mb-4" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Brain dump, chunk, and conquer</p>
        </div>
        <div className="mode-tabs" style={{ margin: 0, width: "auto", flexShrink: 0 }}>
          <button
            className={`mode-tab ${view === "tasks" ? "active" : ""}`}
            onClick={() => setView("tasks")}
            aria-pressed={view === "tasks"}
          >
            📋 Task List
          </button>
          <button
            className={`mode-tab ${view === "dump" ? "active" : ""}`}
            onClick={() => setView("dump")}
            aria-pressed={view === "dump"}
          >
            🧠 Brain Dump
          </button>
        </div>
      </div>

      <div className="grid-main">
        {/* ── Left Panel ────────────────────────────────── */}
        <div className="stack">
          {view === "dump" ? (
            <div className="card">
              <div className="card-title">Brain Dump</div>
              <p className="text-sm text-muted mb-3">
                Type anything — thoughts, tasks, worries. AI will parse it into structured tasks.
              </p>
              <div className="brain-dump-wrap mb-3">
                <textarea
                  className="textarea"
                  style={{ minHeight: 160 }}
                  placeholder="Just type whatever's in your head...&#10;&#10;e.g. Need to finish the report by Friday, call the dentist, study chapter 4 before the exam next week, also reply to Sara's email..."
                  value={dumpText}
                  onChange={(e) => setDumpText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) submitDump(); }}
                  aria-label="Brain dump text"
                />
                <div className="brain-dump-hint">Ctrl+Enter to submit</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={submitDump}
                  disabled={dumpLoading || !dumpText.trim()}
                >
                  {dumpLoading ? "⏳ Parsing..." : "🧠 Chunk with AI"}
                </button>
                <button className="btn btn-ghost" onClick={() => setDumpText("")}>
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Simplified single-field add task */}
              <AddTaskRow onAdd={add} />

              {/* Task list */}
              <div className="stack-sm">
                {sortedTasks.map((t, idx) => (
                  <div
                    key={t._id}
                    id={`task-${t._id}`}
                    className={`task-card ${completing === t._id ? "completing" : ""}`}
                  >
                    {editingId === t._id ? (
                      <div className="stack-sm">
                        <div>
                          <label className="text-xs text-muted" style={{ display: "block", marginBottom: 4 }}>Task title</label>
                          <input
                            className="input"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            aria-label="Edit task title"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted" style={{ display: "block", marginBottom: 4 }}>Due date</label>
                          <input
                            className="input"
                            type="datetime-local"
                            value={editDue}
                            onChange={(e) => setEditDue(e.target.value)}
                            aria-label="Edit due date"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted" style={{ display: "block", marginBottom: 4 }}>Estimated minutes</label>
                          <input
                            className="input"
                            type="number"
                            value={editEstimate}
                            onChange={(e) => setEditEstimate(e.target.value)}
                            min={1}
                            aria-label="Edit estimated minutes"
                          />
                        </div>
                        <DreadMeter score={editDread} onChange={setEditDread} />
                        <div className="flex gap-2">
                          <button className="btn btn-primary btn-sm" onClick={() => saveEdit(t._id)}>Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="task-header">
                          <button
                            className="task-check"
                            onClick={() => complete(t._id)}
                            title="Mark complete"
                            aria-label={`Complete: ${t.title}`}
                          >
                            ✓
                          </button>
                          <div className="task-title-text">
                            {idx === 0 && (
                              <span className="badge badge-violet" style={{ marginRight: 6, verticalAlign: "middle" }}>
                                ⚡ Next
                              </span>
                            )}
                            {t.title}
                          </div>
                          <PriorityBadge level={t.aiPriority} />
                        </div>

                        <div className="task-meta">
                          {t.dueAt && (
                            <span style={{ color: (new Date(t.dueAt) - new Date()) / 3600000 < 24 ? "var(--red)" : "var(--muted)" }}>
                              📅 {fmtDue(t.dueAt)}
                            </span>
                          )}
                          {t.estimateMins && <span>⏱ ~{t.estimateMins}m</span>}
                          <DreadMeter score={t.dreadScore || 3} onChange={(n) => updateDread(t._id, n)} />
                        </div>

                        {t.subtasks?.length > 0 && (
                          <div className="subtask-list">
                            {t.subtasks.map((s, i) => (
                              <div key={i} className="subtask-item">
                                <div className="subtask-dot" />
                                {s.title}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="task-actions">
                          <button className="btn btn-success btn-sm" onClick={() => complete(t._id)}>✓ Done</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => autoChunk(t)}>✂ Chunk</button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setEditingId(t._id);
                              setEditTitle(t.title);
                              setEditDue(t.dueAt ? t.dueAt.slice(0, 16) : "");
                              setEditEstimate(t.estimateMins || 30);
                              setEditDread(t.dreadScore || 3);
                            }}
                          >
                            ✎ Edit
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Empty state with direct CTA */}
                {tasks.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-title">No tasks yet</div>
                    <div className="empty-state-body">
                      Try the Brain Dump — type everything on your mind and AI will turn it into tasks.
                    </div>
                    <button className="btn btn-primary" onClick={() => setView("dump")}>
                      🧠 Start Brain Dump
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right Panel: AI Suggestions ──────────────── */}
        <aside className="stack">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="card-title" style={{ margin: 0 }}>AI Suggestions</div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={fetchSuggestions}
                disabled={suggestionsLoading}
                aria-label="Refresh suggestions"
              >
                {suggestionsLoading ? "..." : "↺"}
              </button>
            </div>

            {suggestionsLoading && suggestions.length === 0 && (
              <div className="text-sm text-muted" style={{ textAlign: "center", padding: 20 }}>
                Analysing tasks...
              </div>
            )}

            {suggestions.length > 0 ? (
              <div className="stack-sm">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    style={{ borderRadius: "var(--radius-sm)", padding: "12px 14px", ...SUGGESTION_STYLES[s.type] }}
                  >
                    <div className="text-xs font-bold" style={{ textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", marginBottom: 4 }}>
                      {SUGGESTION_LABELS[s.type] || "Tip"}
                    </div>
                    <div className="font-semibold text-sm mb-1">{s.title}</div>
                    <div className="text-sm text-muted mb-3" style={{ lineHeight: 1.5 }}>{s.description}</div>
                    <div className="flex gap-2">
                      <button className="btn btn-primary btn-sm" onClick={() => acceptSuggestion(s)}>Accept</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => dismissSuggestion(s)}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !suggestionsLoading && (
                /* Empty suggestions state — don't send users elsewhere */
                <div className="empty-state" style={{ padding: "16px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
                  <div className="text-sm text-muted" style={{ textAlign: "center", lineHeight: 1.6 }}>
                    {tasks.length === 0
                      ? "Add your first task to get AI-powered suggestions."
                      : "You're all caught up. Keep going!"}
                  </div>
                </div>
              )
            )}
          </div>

          <div className="card card-sm">
            <div className="card-title">Energy context</div>
            <div className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
              Tasks are ranked for your current energy.{" "}
              <span style={{ color: "var(--amber)" }}>⚡ Next</span> shows your best match.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
