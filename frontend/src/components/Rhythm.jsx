import { useEffect, useState } from "react";
import api from "../services/api";
import { useEnergy } from "../contexts/EnergyContext";
import { recordCheckIn } from "../services/rhythm";

function hourLabel(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric" });
}

export default function Rhythm() {
  const { energy } = useEnergy();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setData(await api.get("/rhythm"));
      setError("");
    } catch {
      setError("Your Rhythm could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function setEnabled(enabled) {
    await api.put("/rhythm", { enabled });
    if (enabled) recordCheckIn(energy);
    load();
  }

  async function remove(id) {
    await api.delete(`/rhythm/checkins/${id}`);
    load();
  }

  async function removeAll() {
    await api.delete("/rhythm");
    load();
  }

  async function saveEdit(event) {
    event.preventDefault();
    await api.put(`/rhythm/checkins/${edit.id}`, { level: Number(edit.level) });
    setEdit(null);
    load();
  }

  return (
    <div>
      <h1 className="page-title">Your Rhythm</h1>
      <p className="page-subtitle">Optional. This only stores energy check-ins you choose to save.</p>

      {loading ? <p className="text-sm text-muted">Loading...</p> : null}
      {error && <p className="today-message" role="alert">{error}</p>}

      {data && (
        <>
          <div className="card mb-4">
            <div className="card-title">{data.enabled ? "Saving check-ins" : "Turned off"}</div>
            <p className="text-sm">{data.note}</p>
            <div className="today-actions">
              <button className="btn btn-primary" type="button" onClick={() => setEnabled(!data.enabled)}>
                {data.enabled ? "Turn off" : "Turn on"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={removeAll}>Delete all check-ins</button>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-title">Suggested windows</div>
            {!data.enough ? (
              <p className="text-sm text-muted">Fewer than three check-ins are saved, so there is not enough of your own input to suggest a window.</p>
            ) : data.suggested?.length ? (
              <ul className="academic-list">
                {data.suggested.map((window) => (
                  <li key={window.hour}>
                    <div>
                      <strong>Around {hourLabel(window.hour)}</strong>
                      <div className="text-sm text-muted">
                        You reported {window.band} energy in {window.count} check-in{window.count === 1 ? "" : "s"}. This is a pattern in those entries, not a diagnosis.
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Your saved check-ins are mostly low energy. A short step is still a valid plan.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">Saved check-ins</div>
            {data.checkins?.length ? (
              <ul className="academic-list">
                {data.checkins.map((checkin) => (
                  <li key={checkin._id}>
                    <div>
                      <strong>{checkin.band}</strong>
                      <div className="text-sm text-muted">
                        Level {checkin.level} · {new Date(checkin.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="today-actions">
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEdit({ id: checkin._id, level: checkin.level })}>Edit</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(checkin._id)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No check-ins saved. Turn this on, then choose Low, Medium, or High.</p>
            )}
          </div>

          {edit && (
            <form className="card" onSubmit={saveEdit}>
              <div className="card-title">Edit check-in</div>
              <label>
                Level 1–5
                <input className="input" type="number" min="1" max="5" value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value })} />
              </label>
              <div className="today-actions">
                <button className="btn btn-primary btn-sm" type="submit">Save</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEdit(null)}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
