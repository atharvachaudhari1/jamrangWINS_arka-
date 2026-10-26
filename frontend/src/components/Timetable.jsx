import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EMPTY = { title: "", location: "", dayOfWeek: "1", start: "09:00", end: "10:00" };

function clock(mins) {
  const date = new Date();
  date.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hhmm(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export default function Timetable() {
  const [blocks, setBlocks] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const [data, free] = await Promise.all([api.get("/timetable"), api.get("/timetable/slots")]);
      setBlocks(data.blocks || []);
      setConflicts(data.conflicts || []);
      setSlots(free.slots || []);
    } catch {
      setError("The timetable could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveClass(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      if (editingId) {
        await api.put(`/timetable/${editingId}`, form);
        setNotice("Class updated.");
      } else {
        await api.post("/timetable", form);
        setNotice("Class added.");
      }
      setEditingId(null);
      setForm({ ...EMPTY, dayOfWeek: form.dayOfWeek, start: form.start, end: form.end });
      load();
    } catch (err) {
      setError(err.response?.data?.error || "That class could not be saved.");
    }
  }

  function startEdit(block) {
    setEditingId(block._id);
    setForm({
      title: block.title,
      location: block.location || "",
      dayOfWeek: String(block.dayOfWeek),
      start: hhmm(block.startMinutes),
      end: hhmm(block.endMinutes),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id) {
    setConfirmDelete(null);
    try {
      await api.delete(`/timetable/${id}`);
      setNotice("Class removed.");
      if (editingId === id) { setEditingId(null); setForm(EMPTY); }
      load();
    } catch {
      setError("That class could not be removed.");
    }
  }

  async function importCalendar() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data = await api.post("/timetable/import-calendar", { timeZone });
      const skipped = data.skipped ? ` ${data.skipped} all-day or incomplete events were skipped.` : "";
      setNotice(`Synced ${data.imported || 0} events from the next 7 days.${skipped} ${data.message || ""}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Calendar import is unavailable until Google Calendar is connected.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    if (file.size > 100 * 1024) {
      setError("That file is larger than 100 KB. Split it into smaller files.");
      return;
    }
    try {
      const text = await file.text();
      const data = await api.post("/timetable/upload/preview", { text });
      setPreview({ ...data, fileName: file.name });
    } catch (err) {
      setError(err.response?.data?.error || "That file could not be read. Use CSV columns title, day, start, end, location.");
    }
  }

  async function confirmImport() {
    const rows = preview.rows.filter((row) => row.status === "new");
    setBusy(true);
    try {
      const data = await api.post("/timetable/upload", { blocks: rows });
      setNotice(`Added ${data.blocks?.length || 0} classes.${data.skippedDuplicates ? ` ${data.skippedDuplicates} duplicates were skipped.` : ""}`);
      setPreview(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "The classes could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const conflictIds = new Set(conflicts.flatMap((c) => [c.a, c.b]));

  return (
    <div>
      <h1 className="page-title">Timetable</h1>
      <p className="page-subtitle">Classes you add, or events imported from Google Calendar. Imported events are not tasks.</p>

      <form className="card mb-4" onSubmit={saveClass} aria-label={editingId ? "Edit class" : "Add a class"}>
        <div className="card-title">{editingId ? "Edit class" : "Add a weekly class"}</div>
        <div className="academic-grid">
          <label>
            Class
            <input className="input" value={form.title} maxLength={140} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label>
            Location (optional)
            <input className="input" value={form.location} maxLength={140} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label>
            Day
            <select className="input" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
              {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <label>
            Start
            <input className="input" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
          </label>
          <label>
            End
            <input className="input" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
          </label>
        </div>
        <div className="today-actions">
          <button className="btn btn-primary" type="submit">{editingId ? "Save changes" : "Add class"}</button>
          {editingId && <button className="btn btn-ghost" type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>}
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={importCalendar}>Sync Google Calendar</button>
          <label className="btn btn-ghost">
            Upload CSV or JSON
            <input type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={chooseFile} />
          </label>
        </div>
        <p className="text-sm text-muted">CSV columns: title, day, start, end, location. Example: Biology, mon, 09:00, 10:30, Lab 2. You see a preview before anything is saved.</p>
      </form>

      {error && <p className="today-message today-error" role="alert">{error}</p>}
      {notice && <p className="today-message" role="status">{notice}</p>}

      {preview && (
        <div className="card mb-4" role="region" aria-label="Import preview">
          <div className="card-title">Preview of {preview.fileName}</div>
          <p className="text-sm">
            {preview.newCount} new · {preview.duplicateCount} already saved or repeated · {preview.conflictCount} overlapping another class
            {preview.warnings?.length ? ` · ${preview.warnings.length} rows could not be read` : ""}
          </p>
          <table className="import-preview">
            <thead><tr><th>Class</th><th>Day</th><th>Time</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>
              {preview.rows.map((row, i) => (
                <tr key={i} className={row.status === "duplicate" ? "is-dup" : row.conflictWith ? "is-clash" : ""}>
                  <td>{row.title}</td>
                  <td>{DAYS[row.dayOfWeek]}</td>
                  <td>{clock(row.startMinutes)}–{clock(row.endMinutes)}</td>
                  <td>{row.location || "—"}</td>
                  <td>{row.status === "duplicate" ? "Skipped: duplicate" : row.conflictWith ? `New, overlaps ${row.conflictWith}` : "New"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.warnings?.length > 0 && (
            <ul className="task-steps">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="today-actions mt-3">
            <button className="btn btn-primary btn-sm" type="button" disabled={busy || !preview.newCount} onClick={confirmImport}>
              Add {preview.newCount} classes
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {slots.length > 0 && (
        <div className="card mb-4">
          <div className="card-title">Free time left today</div>
          <p className="text-sm">{slots.map((s) => `${clock(s.startMinutes)}–${clock(s.endMinutes)}`).join(" · ")}</p>
          <p className="text-sm text-muted">Today uses these gaps when it suggests a time to study.</p>
        </div>
      )}

      <div className="card">
        <div className="card-title">Week</div>
        <p className="text-sm text-muted">
          <span className="source-pill manual">Class you added</span>
          <span className="source-pill imported">Imported calendar event</span>
          {" "}
          <Link to="/calendar">Task calendar</Link>
          {" · "}
          <Link to="/connectors">Integrations</Link>
        </p>
        {conflicts.length > 0 && (
          <p className="text-sm is-clash" role="status">
            {conflicts.length} overlapping {conflicts.length === 1 ? "pair" : "pairs"}: {conflicts.map((c) => c.titles.join(" and ")).join("; ")}.
          </p>
        )}
        {loading ? (
          <p className="text-sm text-muted">Loading timetable...</p>
        ) : blocks.length === 0 ? (
          <p className="text-sm text-muted">No classes yet. Add one, upload a file, or connect Google Calendar.</p>
        ) : (
          DAYS.map((day, index) => {
            const items = blocks.filter((block) => block.dayOfWeek === index);
            if (!items.length) return null;
            return (
              <div key={day} className="timetable-day">
                <h2>{day}</h2>
                <ul className="academic-list">
                  {items.map((block) => (
                    <li key={block._id}>
                      <div>
                        <strong>{block.title}</strong>
                        <div className="text-sm text-muted">
                          {clock(block.startMinutes)}–{clock(block.endMinutes)}
                          {block.location ? ` · ${block.location}` : ""}
                          {block.date ? ` · ${new Date(block.date).toLocaleDateString()}` : " · weekly"}
                          {conflictIds.has(String(block._id)) ? " · overlaps another class" : ""}
                        </div>
                        <span className={`source-pill ${block.source === "gcal" ? "imported" : "manual"}`}>
                          {block.source === "gcal" ? "Imported calendar event" : "Class you added"}
                        </span>
                      </div>
                      <div className="today-actions">
                        {confirmDelete === block._id ? (
                          <>
                            <span className="text-sm">Remove this class?</span>
                            <button className="btn btn-primary btn-sm" type="button" onClick={() => remove(block._id)}>Remove</button>
                            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmDelete(null)}>Keep</button>
                          </>
                        ) : (
                          <>
                            {block.source !== "gcal" && <button className="btn btn-ghost btn-sm" type="button" onClick={() => startEdit(block)}>Edit</button>}
                            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmDelete(block._id)}>Remove</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
