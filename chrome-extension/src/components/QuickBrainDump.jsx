import React, { useState } from 'react'
import { api } from '../utils/api.js'

export default function QuickBrainDump() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleProcess() {
    if (!text.trim()) return
    setError('')
    setLoading(true)
    try {
      const data = await api.post('/tasks/brain-dump', { text })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    const tasks = result.tasks || []
    return (
      <div>
        <div className="card-title">Brain Dump Processed</div>
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--green)' }}>
          ✅ {tasks.length} task{tasks.length !== 1 ? 's' : ''} created
        </div>
        {tasks.slice(0, 5).map((t, i) => (
          <div key={i} className="task-card mb-2" style={{ marginBottom: 8 }}>
            <div className="task-title" style={{ fontSize: 13 }}>{t.title}</div>
            {t.estimateMins && <span className="text-sm text-muted">⏱ ~{t.estimateMins}m</span>}
          </div>
        ))}
        <button
          className="btn btn-ghost btn-block"
          style={{ marginTop: 8 }}
          onClick={() => { setResult(null); setText('') }}
        >
          ↩ New dump
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="card-title">Brain Dump</div>
      <p className="text-sm text-muted mb-3">
        Type everything on your mind — tasks, worries, ideas. AI will parse it into tasks.
      </p>
      {error && <div className="error-msg mb-2">{error}</div>}

      <textarea
        className="input textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Just type whatever's in your head…&#10;e.g. Need to call dentist, finish report by Friday, buy groceries…"
        style={{ marginBottom: 10 }}
        autoFocus
      />

      <button
        className="btn btn-primary btn-block"
        onClick={handleProcess}
        disabled={loading || !text.trim()}
      >
        {loading ? 'Processing…' : '🧠 Process with AI'}
      </button>
    </div>
  )
}
