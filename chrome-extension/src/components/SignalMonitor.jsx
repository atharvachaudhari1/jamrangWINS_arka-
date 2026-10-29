import React, { useEffect, useState } from 'react'

const STATE_LABELS = {
  ok: 'No strong signal',
  frozen: 'Possible freezing',
  thrashing: 'Rapid context switching',
  avoidance: 'Possible avoidance',
  depleted: 'Possible overload',
  uncertain: 'Pattern is uncertain',
}

function minutes(ms) {
  return Math.floor((ms || 0) / 60000)
}

export default function SignalMonitor() {
  const [snapshot, setSnapshot] = useState(null)
  const [state, setState] = useState(null)
  const [context, setContext] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    async function refresh() {
      try {
        const [signals, detected, local] = await Promise.all([
          chrome.runtime.sendMessage({ type: 'doorway:getSignals' }),
          chrome.runtime.sendMessage({ type: 'doorway:getState' }),
          chrome.storage.local.get(['doorway_stressLevel', 'doorway_stressAt', 'doorway_readingMode', 'doorway_deadlineNear', 'bbEnergy']),
        ])
        if (!mounted) return
        setSnapshot(signals)
        setState(detected)
        setContext({ ...local, stressRecent: Date.now() - (local.doorway_stressAt || 0) <= 2 * 60 * 60 * 1000 })
        setError('')
      } catch {
        if (mounted) setError('Could not read live signals. Try reloading the extension.')
      }
    }
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  if (error) return <div className="card" role="status">{error}</div>
  if (!snapshot) return <div className="loading-wrap" role="status">Loading live signals…</div>

  const currentState = state?.state || 'ok'
  const reasons = state?.reasons || []
  const categoryMs = snapshot.categoryMs || {}
  const currentCategory = snapshot.current?.cat || 'unknown'

  return (
    <section aria-labelledby="signal-title">
      <div className="card signal-status">
        <div className="card-title" id="signal-title">Live signal monitor</div>
        <h2 className="signal-heading" aria-live="polite">{STATE_LABELS[currentState] || 'Checking pattern'}</h2>
        {currentState !== 'ok' && (
          <p className="text-sm text-muted">
            {Math.round((state?.confidence || 0) * 100)}% signal strength
            {reasons.length ? ` · ${reasons.join(', ')}` : ''}
          </p>
        )}
        {currentState === 'ok' && <p className="text-sm text-muted">Doorway has not confirmed a concern pattern.</p>}
        <p className="signal-note">These are behavioral clues, not a diagnosis. Doorway checks once a minute and waits for a repeated signal before intervening.</p>
      </div>

      <div className="card">
        <div className="card-title">What it sees · last 5 minutes</div>
        <dl className="signal-list">
          <div><dt>Tab changes</dt><dd>{snapshot.switchCount} <span>({snapshot.switchesPerMin}/min)</span></dd></div>
          <div><dt>Current tab category</dt><dd>{currentCategory}</dd></div>
          <div><dt>Idle time detected</dt><dd>{minutes(snapshot.focusedIdleMs)} min</dd></div>
        </dl>
      </div>

      <details className="signal-context-details">
        <summary>Context used by Doorway</summary>
        <ul className="signal-context">
          <li>{context.stressRecent ? `Stress check-in: ${context.doorway_stressLevel}/5 (recent)` : 'No recent stress check-in'}</li>
          <li>{context.bbEnergy ? `Energy check-in: ${context.bbEnergy}/5` : 'No energy check-in'}</li>
          <li>{context.doorway_deadlineNear ? 'An exam is within 7 days' : 'No exam deadline within 7 days'}</li>
          <li>{context.doorway_readingMode ? 'Reading mode is on; freezing detection is paused' : 'Reading mode is off'}</li>
        </ul>
      </details>

      <p className="signal-privacy">Doorway uses tab categories and idle status for this view. It does not show or upload visited URLs here. Update interval: 5 sec.</p>
    </section>
  )
}
