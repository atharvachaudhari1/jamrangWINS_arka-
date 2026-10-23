import React, { useEffect, useRef, useState } from 'react'

const MODES = [
  { id: 'pomodoro',  label: 'Pomodoro',  work: 25, brk: 5 },
  { id: 'deep',      label: 'Deep Work', work: 50, brk: 10 },
]

const CIRCUMFERENCE = 2 * Math.PI * 50

function msg(type, payload) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, resolve))
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss < 10 ? '0' + ss : ss}`
}

export default function QuickTimer() {
  const [modeIdx, setModeIdx] = useState(0)
  const [state, setState] = useState(null)
  const [remaining, setRemaining] = useState(25 * 60)
  const tickRef = useRef(null)

  async function syncState() {
    const s = await msg('GET_TIMER')
    setState(s)
    setRemaining(s.remainingSeconds ?? (s.isWork ? s.workMins : s.breakMins) * 60)
  }

  useEffect(() => {
    syncState()
  }, [])

  // Local tick while popup is open
  useEffect(() => {
    clearInterval(tickRef.current)
    if (state?.active) {
      tickRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) { clearInterval(tickRef.current); syncState(); return 0 }
          return r - 1
        })
      }, 1000)
    }
    return () => clearInterval(tickRef.current)
  }, [state?.active, state?.endsAt])

  async function start() {
    const mode = MODES[modeIdx]
    await msg('START_TIMER', {
      mode: mode.id,
      workMins: mode.work,
      breakMins: mode.brk,
      isWork: true,
      sessionCount: state?.sessionCount || 0,
      distractionCount: 0,
    })
    syncState()
  }

  async function pause() {
    await msg('PAUSE_TIMER')
    syncState()
  }

  async function resume() {
    await msg('RESUME_TIMER')
    syncState()
  }

  async function reset() {
    await msg('RESET_TIMER')
    syncState()
  }

  const isWork = state?.isWork ?? true
  const workMins = state?.workMins ?? MODES[modeIdx].work
  const breakMins = state?.breakMins ?? MODES[modeIdx].brk
  const totalSecs = (isWork ? workMins : breakMins) * 60
  const progress = totalSecs > 0 ? 1 - remaining / totalSecs : 0
  const dashOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <div>
      {!state?.active && (
        <div className="mode-tabs">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              className={`mode-tab ${modeIdx === i ? 'active' : ''}`}
              onClick={() => setModeIdx(i)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="ring-wrap">
        <svg width="120" height="120" viewBox="0 0 120 120" className="ring-svg">
          <circle className="ring-track" cx="60" cy="60" r="50" />
          <circle
            className={`ring-progress ${isWork ? '' : 'brk'}`}
            cx="60" cy="60" r="50"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <div className="ring-time-wrap">
          <div className="ring-time">{fmt(remaining)}</div>
          <div className="ring-phase">{isWork ? 'Work' : 'Break'}</div>
        </div>

        <div className="timer-controls">
          {!state?.active && state?.pausedRemaining == null && (
            <button className="btn btn-primary" onClick={start}>▶ Start</button>
          )}
          {state?.active && (
            <button className="btn btn-secondary" onClick={pause}>⏸ Pause</button>
          )}
          {!state?.active && state?.pausedRemaining != null && (
            <>
              <button className="btn btn-primary" onClick={resume}>▶ Resume</button>
              <button className="btn btn-ghost" onClick={reset}>↺</button>
            </>
          )}
          {state?.active && (
            <button className="btn btn-ghost" onClick={reset}>↺</button>
          )}
        </div>
      </div>

      <div className="session-stat">
        <div className="session-count">{state?.sessionCount || 0}</div>
        <div>sessions today</div>
        {(state?.distractionCount || 0) > 0 && (
          <div style={{ color: 'var(--amber)', marginTop: 4 }}>
            ⚡ {state.distractionCount} distraction{state.distractionCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
