import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { startDictation } from "../accessibility/voice";
import { PREF, readPref } from "../accessibility/prefs";

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
};

export default function AcademicTasks() {
  const [form, setForm] = useState(EMPTY);
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [studyMins, setStudyMins] = useState(120);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [taskRes, subjectRes, profile] = await Promise.all([
        api.get("/tasks?scope=academic"),
        api.get("/subjects"),
        api.get("/profile"),
      ]);
      setTasks(taskRes.tasks || []);
      setSubjects(subjectRes.subjects || []);
      if (profile.availableStudyMins) setStudyMins(profile.availableStudyMins);
    } catch {
      setError("Academic tasks could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveStudyTime() {
    setNotice("");
    try {
      await api.put("/profile", { availableStudyMins: Number(studyMins) });
      setNotice("Available study time saved.");
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
    try {
      if (form.subject.trim()) await api.post("/subjects", { name: form.subject.trim() });
      await api.post("/tasks", {
        title: form.title.trim(),
        subject: form.subject.trim(),
        kind: form.kind,
        priority: form.priority,
        dueAt: form.dueAt || null,
        estimateMins: Number(form.estimateMins) || 30,
      });
      setForm(EMPTY);
      setNotice("Task added. It can show up on Today.");
      load();
    } catch (err) {
      setError(err.response?.data?.error || "The task could not be saved.");
    }
  }

  async function complete(task) {
    await api.put(`/tasks/${task._id}/complete`);
    load();
  }

  async function remove(task) {
    await api.delete(`/tasks/${task._id}`);
    load();
  }

  async function breakDown(task) {
    setNotice("");
    setError("");
    try {
      const data = await api.post(`/tasks/${task._id}/auto-chunk`);
      const count = data.task?.subtasks?.length || 0;
      setNotice(count
        ? `Broke “${task.title}” into ${count} steps. This uses AI when a key is configured, and a simple split otherwise.`
        : "No steps were returned.");
      load();
    } catch {
      setError("The breakdown could not be created. The task itself is unchanged.");
    }
  }

  function dictate() {
    const recognition = startDictation({
      onResult: (transcript) => update("title", transcript),
      onError: (msg) => setError(msg),
      onEnd: () => setListening(false),
    });
    if (recognition) setListening(true);
  }

  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);

  return (
    <div>
      <h1 className="page-title">My Tasks</h1>
      <p className="page-subtitle">Subjects, deadlines, and study time. General tasks stay on the existing list.</p>

      <div className="card mb-4">
        <div className="card-title">Available study time</div>
        <div className="academic-row">
          <label htmlFor="study-mins">Minutes you can use today</label>
          <input id="study-mins" className="input" type="number" min="15" max="720" value={studyMins} onChange={(e) => setStudyMins(e.target.value)} />
          <button className="btn btn-secondary btn-sm" type="button" onClick={saveStudyTime}>Save</button>
        </div>
      </div>

      <form className="card mb-4" onSubmit={submit}>
        <div className="card-title">Add an academic task</div>
        <div className="academic-grid">
          <label>
            Task
            <input className="input" value={form.title} onChange={(e) => update("title", e.target.value)} required aria-label="Task name" />
          </label>
          <label>
            Subject
            <input className="input" list="subject-names" value={form.subject} onChange={(e) => update("subject", e.target.value)} aria-label="Subject" />
            <datalist id="subject-names">
              {subjects.map((subject) => <option key={subject._id} value={subject.name} />)}
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
        <div className="today-actions">
          <button className="btn btn-primary" type="submit">Add task</button>
          {readPref(PREF.voice) === "on" && (
            <button className="btn btn-ghost" type="button" onClick={dictate}>{listening ? "Listening..." : "Voice title"}</button>
          )}
          <Link to="/todo">Open general tasks</Link>
        </div>
      </form>

      {error && <p className="today-message" role="alert">{error}</p>}
      {notice && <p className="today-message" role="status">{notice}</p>}

      <div className="card">
        <div className="card-title">Academic list</div>
        {loading ? (
          <p className="text-sm text-muted">Loading tasks...</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-muted">No open academic tasks yet. Add one above, or use the general task list.</p>
        ) : (
          <ul className="academic-list">
            {open.map((task) => (
              <li key={task._id}>
                <div>
                  <strong>{task.title}</strong>
                  <div className="text-sm text-muted">
                    {[task.subject, task.kind, task.priority, task.estimateMins ? `${task.estimateMins} min` : "", task.dueAt ? new Date(task.dueAt).toLocaleString() : ""].filter(Boolean).join(" · ")}
                  </div>
                  {task.subtasks?.length > 0 && (
                    <ul className="academic-steps">
                      {task.subtasks.map((step, index) => <li key={index}>{step.title}</li>)}
                    </ul>
                  )}
                </div>
                <div className="today-actions">
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => complete(task)}>Done</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => breakDown(task)}>Break into steps</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(task)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {done.length > 0 && <p className="text-sm text-muted">Finished: {done.length}</p>}
      </div>
    </div>
  );
}
