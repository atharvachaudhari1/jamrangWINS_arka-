import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../utils/api.js'
import { get, set } from '../utils/storage.js'

const ENERGY_LABELS = { 1: '💀 Exhausted', 2: '😴 Low', 3: '😐 Okay', 4: '⚡ Good', 5: '🔥 Peak' }

export default function WhatNext({ taskRevision = 0 }) {
  const [task, setTask] = useState(null)
  const [reason, setReason] = useState('')
  const [energy, setEnergy] = useState(3)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [mindfulness, setMindfulness] = useState(null)

  useEffect(() => {
    get(['bbEnergy']).then(({ bbEnergy }) => {
      if (bbEnergy) setEnergy(bbEnergy)
    })
  }, [])

  const load = useCallback(async (e = energy) => {
    setLoading(true)
    try {
      const [taskRes, mindRes] = await Promise.allSettled([
        api.get(`/tasks/what-next?energyLevel=${e}`),
        api.get(`/recommendations/mindfulness?energyLevel=${e}`),
      ])
      if (taskRes.status === 'fulfilled') {
        setTask(taskRes.value.task || null)
        setReason(taskRes.value.reason || '')
      }
      if (mindRes.status === 'fulfilled' && mindRes.value.suggested) {
        setMindfulness(mindRes.value.top)
      } else {
        setMindfulness(null)
      }
    } catch {
      setTask(null)
    } finally {
      setLoading(false)
    }
  }, [energy])

  useEffect(() => { load() }, [taskRevision])

  async function changeEnergy(e) {
    setEnergy(e)
    await set({ bbEnergy: e })
    load(e)
  }

  async function logRecommendation(type, taskId) {
    try {
      await api.post('/recommendation-events', {
        type,
        taskId,
        energyLevel: energy,
        wasRecommended: true,
      })
    } catch {}
  }

  async function completeTask() {
    if (!task) return
    setCompleting(true)
    try {
      await api.put(`/tasks/${task._id}/complete`, { energyLevel: energy })
      setTask(null)
      load()
    } catch {
      setCompleting(false)
    }
  }

  async function startTask() {
    if (!task) return
    await logRecommendation('started', task._id)
  }

  async function skipTask() {
    if (!task) return
    await logRecommendation('skipped', task._id)
    load()
  }

  function fmtDue(iso) {
    const d = new Date(iso)
    const diff = Math.ceil((d - Date.now()) / 86400000)
    if (diff < 0) return `${Math.abs(diff)}d overdue`
    if (diff === 0) return 'Due today'
    if (diff === 1) return 'Due tomorrow'
    return `Due in ${diff}d`
  }

  return (
    <div>
      {/* Energy picker */}
      <div className="card mb-3">
        <div className="card-title">Current Energy</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((e) => (
            <button
              key={e}
              className={`btn btn-sm ${energy === e ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => changeEnergy(e)}
              style={{ fontSize: 11 }}
            >
              {ENERGY_LABELS[e]}
            </button>
          ))}
        </div>
      </div>

      {/* Mindfulness nudge */}
      {mindfulness && (
        <div className="card mb-3" style={{ borderLeft: '3px solid var(--violet)', background: 'var(--violet-dim)' }}>
          <div className="card-title">🧘 Mindfulness Nudge</div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{mindfulness.title}</div>
          <div className="text-sm text-muted">{mindfulness.description}</div>
        </div>
      )}

      {/* Task recommendation */}
      <div className="card-title" style={{ marginBottom: 8 }}>Recommended Task</div>

      {loading ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : task ? (
        <div className="task-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div className="task-title">{task.title}</div>
            {task.aiPriority && (
              <span className={`badge badge-${(task.aiPriority || 'medium').toLowerCase()}`}>
                {task.aiPriority}
              </span>
            )}
          </div>

          <div className="task-meta">
            {task.dueAt && <span style={{ color: new Date(task.dueAt) < new Date() ? 'var(--red)' : 'var(--muted)' }}>📅 {fmtDue(task.dueAt)}</span>}
            {task.estimateMins && <span>⏱ ~{task.estimateMins}m</span>}
          </div>

          {reason && <div className="task-reason">💡 {reason}</div>}

          <div className="task-actions">
            <button className="btn btn-primary btn-sm" onClick={startTask}>
              Start
            </button>
            <button className="btn btn-primary btn-sm" onClick={completeTask} disabled={completing}>
              {completing ? '…' : '✓ Done'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={skipTask}>
              ↺ Next
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>All clear!</div>
          <div className="text-sm">No pending tasks. Add one below.</div>
        </div>
      )}
    </div>
  )
}
