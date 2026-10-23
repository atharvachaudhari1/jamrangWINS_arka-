import React, { useState } from 'react'
import { api } from '../utils/api.js'

function DreadPips({ value, onChange }) {
  return (
    <div>
      <label className="label">Dread ({value}/5)</label>
      <div className="dread-pips">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className={`dread-pip ${n <= value ? `on-${value}` : ''}`}
            onClick={() => onChange(n)}
          />
        ))}
      </div>
    </div>
  )
}

export default function QuickTaskAdd({ onAdded }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [estimate, setEstimate] = useState(30)
  const [dread, setDread] = useState(3)
  const [importance, setImportance] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setError('')
    setLoading(true)
    try {
      await api.post('/tasks', {
        title: title.trim(),
        dueAt: due || undefined,
        estimateMins: estimate,
        dreadScore: dread,
        importance,
      })
      setSuccess(true)
      setTimeout(() => {
        setTitle(''); setDue(''); setEstimate(30); setDread(3); setImportance(2); setSuccess(false)
        if (onAdded) onAdded()
      }, 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✅</div>
        <div style={{ fontWeight: 600, color: 'var(--green)' }}>Task added!</div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card-title">Add Task</div>
      {error && <div className="error-msg mb-2">{error}</div>}

      <div className="form-group">
        <label className="label">Task *</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          required
          autoFocus
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="label">Due date</label>
          <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">Estimate (min)</label>
          <input className="input" type="number" value={estimate} min={1} max={480} onChange={(e) => setEstimate(Number(e.target.value))} />
        </div>
      </div>

      <div className="form-group">
        <label className="label">Importance (1–5)</label>
        <input className="input" type="range" min={1} max={5} value={importance} onChange={(e) => setImportance(Number(e.target.value))} />
        <div className="text-sm text-muted" style={{ marginTop: 2 }}>{'★'.repeat(importance)}{'☆'.repeat(5 - importance)}</div>
      </div>

      <div className="form-group">
        <DreadPips value={dread} onChange={setDread} />
      </div>

      <button className="btn btn-primary btn-block" disabled={loading}>
        {loading ? 'Adding…' : '+ Add Task'}
      </button>
    </form>
  )
}
