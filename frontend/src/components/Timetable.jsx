import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clock(mins) {
  const date = new Date();
  date.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Timetable() {
  const [blocks, setBlocks] = useState([]);
  const [form, setForm] = useState({ title: "", dayOfWeek: "1", start: "09:00", end: "10:00" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/timetable");
      setBlocks(data.blocks || []);
      setError("");
    } catch {
      setError("The timetable could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function addClass(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.post("/timetable", form);
      setForm({ title: "", dayOfWeek: form.dayOfWeek, start: form.start, end: form.end });
      setNotice("Class added.");
      load();
    } catch (err) {
      setError(err.response?.data?.error || "That class could not be saved.");
    }
  }

  async function remove(id) {
    await api.delete(`/timetable/${id}`);
    load();
  }

  async function importCalendar() {
    setError("");
    setNotice("");
    try {
      const data = await api.post("/timetable/import-calendar");
      setNotice(data.message || `Imported ${data.imported || 0} events.`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Calendar import is unavailable until Google Calendar is connected.");
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    try {
      const text = await file.text();
      const data = await api.post("/timetable/upload", { text });
      const warning = data.warnings?.length ? ` ${data.warnings.length} row(s) were skipped.` : "";
      setNotice(`Added ${data.blocks?.length || 0} classes.${warning}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "That file could not be read. Use CSV columns title, day, start, end.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Timetable</h1>
      <p className="page-subtitle">Classes you add, or events imported from Google Calendar. Imported events are not tasks.</p>

      <form className="card mb-4" onSubmit={addClass}>
        <div className="card-title">Add a class</div>
        <div className="academic-grid">
          <label>
            Class
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
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
          <button className="btn btn-primary" type="submit">Add class</button>
          <button className="btn btn-secondary" type="button" onClick={importCalendar}>Import Google Calendar</button>
          <label className="btn btn-ghost">
            Upload CSV or JSON
            <input type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={upload} />
          </label>
        </div>
        <p className="text-sm text-muted">CSV columns: title, day, start, end. Example: Biology, mon, 09:00, 10:30. Calendar sync stays optional.</p>
      </form>

      {error && <p className="today-message" role="alert">{error}</p>}
      {notice && <p className="today-message" role="status">{notice}</p>}

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
                          {block.date ? ` · ${new Date(block.date).toLocaleDateString()}` : " · weekly"}
                        </div>
                        <span className={`source-pill ${block.source === "gcal" ? "imported" : "manual"}`}>
                          {block.source === "gcal" ? "Imported calendar event" : "Class you added"}
                        </span>
                      </div>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(block._id)}>Remove</button>
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
