import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { startListening } from "../accessibility/voice";
import { recordWav } from "../accessibility/recordWav";
import { transcribeWav } from "../accessibility/transcribe";
import { PREF, readPref } from "../accessibility/prefs";
import ReadAloud from "./ReadAloud";
import DayClock, { clockwise, formatClock, formatSpan } from "./DayClock";

const KINDS = [
  { id: "assignment", label: "Assignment" },
  { id: "project", label: "Project" },
  { id: "reading", label: "Reading" },
  { id: "revision", label: "Revision" },
];

const EMPTY = {
  title: "",
  subject: "",
  kind: "assignment",
  priority: "medium",
  dueAt: "",
  estimateMins: 45,
  description: "",
};

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function StudyWindow({ startMinutes, endMinutes, onChange, onSave }) {
  const span = clockwise(startMinutes, endMinutes);
  const endsTomorrow = endMinutes < startMinutes;
  return (
    <div className="study-clock">
      <div className="study-clock-dial">
        <DayClock startMinutes={startMinutes} endMinutes={endMinutes} onChange={onChange} />
      </div>
      <div className="study-clock-side">
        <div className="study-clock-times">
          <div>
            <div className="study-clock-kicker">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.5 3.2h5.2v9.6H1.5zM9.3 3.2H14.5v9.6H9.3z" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              Start
            </div>
            <div className="study-clock-time">{formatClock(startMinutes)}</div>
            <div className="study-clock-when">Today</div>
          </div>
          <div>
            <div className="study-clock-kicker">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.2 2.2v11.6M3.2 3h9.2L10 6l2.4 3H3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              End
            </div>
            <div className="study-clock-time">{formatClock(endMinutes)}</div>
            <div className="study-clock-when">{endsTomorrow ? "Tomorrow" : "Today"}</div>
          </div>
        </div>
        <div className="study-clock-duration">{formatSpan(span)}</div>
        <p className="study-clock-note text-sm text-muted">Drag the marks around the day. Today uses this much time when it picks a task.</p>
        {span < 45 && (
          <p className="study-clock-warn">
            <span aria-hidden="true">!</span>
            This window is shorter than a typical task.
          </p>
        )}
        <button className="btn btn-primary" type="button" onClick={onSave}>Save study window</button>
      </div>
    </div>
  );
}

function summary(task) {
  return [
    task.title,
    task.subject ? `Subject ${task.subject}.` : "",
    task.estimateMins ? `About ${task.estimateMins} minutes.` : "",
    task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString()}.` : "",
    task.description || "",
    task.subtasks?.length ? `Steps: ${task.subtasks.map((s) => s.title).join(". ")}.` : "",
  ].filter(Boolean).join(" ");
}

export default function AcademicTasks() {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [studyStart, setStudyStart] = useState(9 * 60);
  const [studyEnd, setStudyEnd] = useState(11 * 60);
  const [filters, setFilters] = useState({ q: "", subject: "", kind: "", status: "open" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const voiceRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [review, setReview] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ scope: "academic" });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.subject) params.set("subject", filters.subject);
      if (filters.kind) params.set("kind", filters.kind);
      if (filters.status !== "all") params.set("status", filters.status);
      const taskRes = await api.get(`/tasks?${params}`);
      setTasks(taskRes.tasks || []);
    } catch {
      setError("Academic tasks could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    Promise.all([api.get("/subjects"), api.get("/profile")])
      .then(([subjectRes, profile]) => {
        setSubjects(subjectRes.subjects || []);
        if (profile.availableStudyMins) {
          let stored = NaN;
          try {
            const raw = localStorage.getItem("doorway-study-start");
            stored = raw == null || raw === "" ? NaN : Number(raw);
          } catch { stored = NaN; }
          const start = Number.isFinite(stored) && stored >= 0 && stored < 1440 ? Math.round(stored) : 9 * 60;
          setStudyStart(start);
          setStudyEnd((start + Number(profile.availableStudyMins)) % 1440);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDraft = (event) => {
      const draft = event.detail;
      if (!draft) {
        setEditingId(null);
        setForm(EMPTY);
        return;
      }
      setForm((current) => ({
        ...current,
        ...(draft.title != null ? { title: draft.title } : {}),
        ...(draft.subject != null ? { subject: draft.subject } : {}),
        ...(draft.kind ? { kind: draft.kind } : {}),
        ...(draft.priority ? { priority: draft.priority } : {}),
        ...(draft.dueAt ? { dueAt: toLocalInput(draft.dueAt) } : {}),
        ...(draft.estimateMins ? { estimateMins: draft.estimateMins } : {}),
        ...(draft.notes != null ? { description: draft.notes } : {}),
      }));
    };
    window.addEventListener("doorway-task-draft", onDraft);
    return () => window.removeEventListener("doorway-task-draft", onDraft);
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    const refresh = () => load();
    window.addEventListener("doorway-refresh", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("doorway-refresh", refresh);
    };
  }, [load]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveStudyTime() {
    setNotice("");
    setError("");
    const availableStudyMins = clockwise(studyStart, studyEnd);
    try {
      await api.put("/profile", { availableStudyMins });
      try { localStorage.setItem("doorway-study-start", String(studyStart)); } catch { /* private mode */ }
      setNotice("Available study time saved. Today will use it.");
    } catch (err) {
      setError(err.response?.data?.error || "Study time could not be saved.");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!form.title.trim()) {
      setError("Add a task name.");
      return;
    }
    const body = {
      title: form.title.trim(),
      subject: form.subject.trim(),
      kind: form.kind,
      priority: form.priority,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      estimateMins: Number(form.estimateMins) || 30,
      description: form.description,
    };
    try {
      if (form.subject.trim() && !subjects.some((s) => s.name.toLowerCase() === form.subject.trim().toLowerCase())) {
        const created = await api.post("/subjects", { name: form.subject.trim() }).catch(() => null);
        if (created?.subject) setSubjects((list) => [...list, created.subject]);
      }
      if (editingId) {
        await api.put(`/tasks/${editingId}`, body);
        setNotice("Changes saved.");
      } else {
        await api.post("/tasks", body);
        setNotice("Task added. It can show up on Today.");
      }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "The task could not be saved.");
    }
  }

  function startEdit(task) {
    setEditingId(task._id);
    setForm({
      title: task.title || "",
      subject: task.subject || "",
      kind: KINDS.some((k) => k.id === task.kind) ? task.kind : "assignment",
      priority: task.priority || "medium",
      dueAt: toLocalInput(task.dueAt),
      estimateMins: task.estimateMins || 30,
      description: task.description || "",
    });
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function complete(task) {
    setError("");
    try {
      await api.put(`/tasks/${task._id}/complete`);
      setNotice(`Marked “${task.title}” done.`);
      load();
    } catch {
      setError("That task could not be updated.");
    }
  }

  async function reopen(task) {
    setError("");
    try {
      await api.put(`/tasks/${task._id}/reopen`);
      setNotice(`Reopened “${task.title}”.`);
      load();
    } catch {
      setError("That task could not be reopened.");
    }
  }

  async function remove(task) {
    setConfirmDelete(null);
    setError("");
    try {
      await api.delete(`/tasks/${task._id}`);
      setNotice(`Deleted “${task.title}”.`);
      if (editingId === task._id) cancelEdit();
      load();
    } catch {
      setError("That task could not be deleted.");
    }
  }

  async function breakDown(task) {
    setNotice("");
    setError("");
    setReview({ task, steps: [], loading: true });
    try {
      const data = await api.post(`/tasks/${task._id}/breakdown`);
      setReview({ task, steps: data.steps || [], source: data.source, warning: data.warning, loading: false });
    } catch (err) {
      setReview(null);
      setError(err.response?.data?.error || "A breakdown could not be suggested. The task itself is unchanged.");
    }
  }

  function editStep(index, field, value) {
    setReview((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, [field]: value } : step)),
    }));
  }

  async function saveSteps() {
    const steps = review.steps
      .map((step) => ({ title: String(step.title).trim(), estimateMins: Number(step.estimateMins) || 15 }))
      .filter((step) => step.title);
    if (steps.length < 2) {
      setError("Keep at least two named steps, or cancel.");
      return;
    }
    try {
      await api.put(`/tasks/${review.task._id}/subtasks`, { steps });
      setNotice(`Saved ${steps.length} steps for “${review.task.title}”.`);
      setReview(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "The steps could not be saved.");
    }
  }

  function dictate() {
    if (listening) {
      voiceRef.current?.stop();
      setListening(false);
      return;
    }
    setListening(true);
    voiceRef.current = startListening({
      record: recordWav,
      transcribe: transcribeWav,
      onResult: (transcript) => update("title", transcript.trim()),
      onError: (msg) => setError(msg),
      onEnd: () => setListening(false),
    });
  }

  const subjectNames = [...new Set([...subjects.map((s) => s.name), ...tasks.map((t) => t.subject).filter(Boolean)])];

  return (
    <div>
      <h1 className="page-title">My Tasks</h1>
      <p className="page-subtitle">Subjects, deadlines, and study time. General tasks stay on the existing list.</p>

      <div className="card mb-4">
        <div className="card-title">Available study time</div>
        <StudyWindow
          startMinutes={studyStart}
          endMinutes={studyEnd}
          onChange={({ startMinutes, endMinutes }) => {
            setStudyStart(startMinutes);
            setStudyEnd(endMinutes);
          }}
          onSave={saveStudyTime}
        />
      </div>

      <form className="card mb-4" onSubmit={submit} aria-label={editingId ? "Edit task" : "Add an academic task"}>
        <div className="card-title">{editingId ? "Edit task" : "Add an academic task"}</div>
        <div className="academic-grid">
          <label>
            Task
            <input className="input" value={form.title} maxLength={500} onChange={(e) => update("title", e.target.value)} required aria-label="Task name" />
          </label>
          <label>
            Subject
            <input className="input" list="subject-names" value={form.subject} maxLength={120} onChange={(e) => update("subject", e.target.value)} aria-label="Subject" />
            <datalist id="subject-names">
              {subjectNames.map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
          <label>
            Type
            <select className="input" value={form.kind} onChange={(e) => update("kind", e.target.value)}>
              {KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select className="input" value={form.priority} onChange={(e) => update("priority", e.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            Deadline
            <input className="input" type="datetime-local" value={form.dueAt} onChange={(e) => update("dueAt", e.target.value)} />
          </label>
          <label>
            Estimated minutes
            <input className="input" type="number" min="1" max="1440" value={form.estimateMins} onChange={(e) => update("estimateMins", e.target.value)} />
          </label>
        </div>
        <label className="block mb-4">
          Notes (optional)
          <textarea className="input" rows={2} maxLength={2000} value={form.description} onChange={(e) => update("description", e.target.value)} aria-label="Notes" />
        </label>
        <div className="today-actions">
          <button className="btn btn-primary" type="submit">{editingId ? "Save changes" : "Add task"}</button>
          {editingId && <button className="btn btn-ghost" type="button" onClick={cancelEdit}>Cancel</button>}
          {readPref(PREF.voice) === "on" ? (
            <span className="text-sm text-muted">Say “add task …” and Doorway will add it.</span>
          ) : (
            <button className="btn btn-ghost" type="button" onClick={dictate} aria-pressed={listening}>{listening ? "Listening… tap to stop" : "Say the task name"}</button>
          )}
          <Link to="/todo">Open general tasks</Link>
        </div>
      </form>

      {error && <p className="today-message today-error" role="alert">{error}</p>}
      {notice && <p className="today-message" role="status">{notice}</p>}

      {review && (
        <div className="card mb-4" role="region" aria-label="Review suggested steps">
          <div className="card-title">Suggested steps for “{review.task.title}”</div>
          {review.loading ? (
            <p className="text-sm text-muted">Working out some steps…</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                {review.source === "openai" ? "Suggested by AI from the task name and notes. " : "A simple template, because AI is not configured or did not respond. "}
                Nothing is saved until you choose Save steps. Edit, remove, or add steps first.
              </p>
              {review.warning && <p className="text-sm text-muted">{review.warning}</p>}
              <div className="step-editor">
                {review.steps.map((step, index) => (
                  <div className="step-editor-row" key={index}>
                    <input className="input" aria-label={`Step ${index + 1}`} value={step.title} maxLength={200} onChange={(e) => editStep(index, "title", e.target.value)} />
                    <input className="input step-mins" aria-label={`Minutes for step ${index + 1}`} type="number" min={5} max={90} value={step.estimateMins} onChange={(e) => editStep(index, "estimateMins", e.target.value)} />
                    <button className="btn btn-ghost btn-sm" type="button" aria-label={`Remove step ${index + 1}`}
                      onClick={() => setReview((r) => ({ ...r, steps: r.steps.filter((_, i) => i !== index) }))}>Remove</button>
                  </div>
                ))}
              </div>
              <div className="today-actions mt-3">
                <button className="btn btn-ghost btn-sm" type="button" disabled={review.steps.length >= 8}
                  onClick={() => setReview((r) => ({ ...r, steps: [...r.steps, { title: "", estimateMins: 15 }] }))}>Add a step</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveSteps}>Save steps</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setReview(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">Academic list</div>
        <div className="task-filters" role="search">
          <label className="sr-only" htmlFor="task-search">Search tasks</label>
          <input id="task-search" className="input" placeholder="Search tasks" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <label className="sr-only" htmlFor="task-subject">Subject</label>
          <select id="task-subject" className="input" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })}>
            <option value="">All subjects</option>
            {subjectNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <label className="sr-only" htmlFor="task-kind">Type</label>
          <select id="task-kind" className="input" value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
            <option value="">All types</option>
            {KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="task-status">Status</label>
          <select id="task-status" className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="all">All</option>
          </select>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted">
            {filters.q || filters.subject || filters.kind || filters.status !== "open"
              ? "No tasks match these filters."
              : "No open academic tasks yet. Add one above, or use the general task list."}
          </p>
        ) : (
          <ul className="academic-list">
            {tasks.map((task) => (
              <li key={task._id}>
                <div>
                  <strong className={task.completed ? "text-muted" : ""}>{task.completed ? `Done: ${task.title}` : task.title}</strong>
                  <div className="text-sm text-muted">
                    {[task.subject, task.kind, task.priority, task.estimateMins ? `${task.estimateMins} min` : "", task.dueAt ? `due ${new Date(task.dueAt).toLocaleString()}` : ""].filter(Boolean).join(" · ")}
                  </div>
                  {task.description && <p className="task-desc">{task.description}</p>}
                  {task.subtasks?.length > 0 && (
                    <ol className="task-steps">
                      {task.subtasks.map((step, index) => <li key={index}>{step.title}{step.estimateMins ? ` (${step.estimateMins} min)` : ""}</li>)}
                    </ol>
                  )}
                </div>
                <div className="today-actions">
                  {confirmDelete === task._id ? (
                    <>
                      <span className="text-sm">Delete this task?</span>
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => remove(task)}>Delete</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmDelete(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      {task.completed
                        ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => reopen(task)}>Reopen</button>
                        : <button className="btn btn-secondary btn-sm" type="button" onClick={() => complete(task)}>Done</button>}
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => startEdit(task)}>Edit</button>
                      {!task.completed && <button className="btn btn-ghost btn-sm" type="button" onClick={() => breakDown(task)}>Break into steps</button>}
                      <ReadAloud text={summary(task)} compact />
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmDelete(task._id)}>Delete</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
