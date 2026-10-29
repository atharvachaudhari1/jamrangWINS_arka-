import React, { useEffect, useRef, useState } from 'react'
import DayClock, { clockwise, formatClock, formatSpan } from '../../../frontend/src/components/DayClock.jsx'

const MODES = [
  { id: 'pomodoro',  label: 'Pomodoro',  work: 25, brk: 5 },
  { id: 'deep',      label: 'Deep Work', work: 50, brk: 10 },
]

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
  const [windowStart, setWindowStart] = useState(() => {
    const now = new Date()
    return Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5
  })
  const [windowEnd, setWindowEnd] = useState(() => {
    const now = new Date()
    const start = Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5
    return (start + 25) % 1440
  })
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
    const workMins = clockwise(windowStart, windowEnd) || 5
    await msg('START_TIMER', {
      mode: mode.id,
      workMins,
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
  const selectedMins = clockwise(windowStart, windowEnd) || 5
  const clockLocked = Boolean(state?.active || state?.pausedRemaining != null)
  return (
    <div>
      {!state?.active && (
        <div className="mode-tabs">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              className={`mode-tab ${modeIdx === i ? 'active' : ''}`}
              onClick={() => {
                setModeIdx(i)
                setWindowEnd((windowStart + m.work) % 1440)
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="timer-clock-layout">
        <div className="timer-clock-dial">
          <DayClock
            startMinutes={windowStart}
            endMinutes={windowEnd}
            onChange={({ startMinutes, endMinutes }) => {
              setWindowStart(startMinutes)
              setWindowEnd(endMinutes)
            }}
            locked={clockLocked}
            minSpan={5}
            maxSpan={180}
            startLabel="Focus start"
            endLabel="Focus end"
            caption="Focus session"
          />
        </div>

        <div className="timer-clock-details">
          <div className="timer-clock-times">
            <div><span>START</span><strong>{formatClock(windowStart)}</strong></div>
            <div><span>END</span><strong>{formatClock(windowEnd)}</strong></div>
          </div>
          <div className="ring-time-wrap">
            <div className="ring-time">{fmt(remaining)}</div>
            <div className="ring-phase">{isWork ? 'Focus' : 'Break'} · {formatSpan(clockLocked ? workMins : selectedMins)}</div>
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
