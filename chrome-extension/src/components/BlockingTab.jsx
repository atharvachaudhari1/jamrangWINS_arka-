import React, { useEffect, useState } from 'react'

function msg(type, payload) {
  return new Promise((resolve) =>
    chrome.runtime.sendMessage({ type, payload }, (res) => resolve(res || {}))
  )
}

function fmt(ms) {
  const totalSecs = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${s < 10 ? '0' + s : s}`
}

export default function BlockingTab() {
  const [state, setState] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState(null)
  const [snoozeCountdown, setSnoozeCountdown] = useState(null)

  async function load() {
    const s = await msg('GET_BLOCKING_STATE')
    setState(s)
    if (s.snoozed && s.snoozeUntil) {
      setSnoozeCountdown(s.snoozeUntil - Date.now())
    } else {
      setSnoozeCountdown(null)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  // Count down snooze timer locally
  useEffect(() => {
    if (!snoozeCountdown) return
    const id = setInterval(() => {
      setSnoozeCountdown((c) => {
        if (c <= 1000) { load(); return null }
        return c - 1000
      })
    }, 1000)
    return () => clearInterval(id)
  }, [snoozeCountdown])

  function notify(text, color) {
    setNotice({ text, color: color || '#10b981' })
    setTimeout(() => setNotice(null), 2500)
  }

  async function handleSync() {
    setSyncing(true)
    const res = await msg('SYNC_BLOCKING_RULES')
    setSyncing(false)
    if (res.ok) { notify('Rules synced'); load() }
    else notify('Sync failed', '#ef4444')
  }

  async function handleUnsnooze() {
    await msg('UNSNOOZE_BLOCKING')
    notify('Snooze cancelled')
    load()
  }

  async function handleSnooze(minutes) {
    const res = await msg('SNOOZE_BLOCKING', { minutes })
    if (res.ok) { notify(`Snoozed for ${minutes} min`); load() }
  }

  if (!state) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  const isBlocking = state.activeRules > 0 && !state.snoozed
  const isEnabled  = state.rulesEnabled

  const reason = (() => {
    if (!isEnabled) return 'Blocking is off — enable it in the PWA settings'
    if (state.snoozed) return `Snoozed — ${snoozeCountdown ? fmt(snoozeCountdown) + ' left' : 'resuming soon'}`
    if (state.sessionActive && state.scheduleActive) return 'Active: focus session + schedule'
    if (state.sessionActive)  return 'Active: focus session running'
    if (state.scheduleActive) return 'Active: scheduled block'
    return 'Inactive — start a timer or check schedule'
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Status card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{isBlocking ? '🛡️' : isEnabled ? '💤' : '⬜'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: isBlocking ? '#10b981' : state.snoozed ? 'var(--amber)' : 'var(--muted)',
            marginBottom: 2,
          }}>
            {isBlocking ? 'Blocking Active' : state.snoozed ? 'Snoozed' : 'Not Blocking'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{reason}</div>
        </div>
      </div>

      {/* Rule counts */}
      {isEnabled && (
        <div className="card" style={{ display: 'flex', gap: 0 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--indigo-light)' }}>
              {state.blockedCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Blocked sites</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>
              {state.whitelistCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Whitelisted</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: isBlocking ? '#10b981' : 'var(--muted)' }}>
              {state.activeRules}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Active rules</div>
          </div>
        </div>
      )}

      {/* Snooze controls — shown only when blocking is active */}
      {isBlocking && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Snooze blocking</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[5, 15, 30].map((m) => (
              <button
                key={m}
                className="btn btn-secondary"
                style={{ flex: 1, fontSize: 12, padding: '7px 4px' }}
                onClick={() => handleSnooze(m)}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Snooze active — cancel */}
      {state.snoozed && (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleUnsnooze}>
          Cancel snooze — re-enable now
        </button>
      )}

      {/* Sync button */}
      <button
        className="btn btn-ghost"
        style={{ width: '100%' }}
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? 'Syncing…' : '↻ Sync rules from account'}
      </button>

      {/* PWA link */}
      {!isEnabled && (
        <div style={{
          background: 'var(--indigo-dim)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.5,
        }}>
          Manage your blocklist in the Doorway app under{' '}
          <strong style={{ color: 'var(--indigo-light)' }}>Blocking Rules</strong>.
        </div>
      )}

      {notice && (
        <div style={{ textAlign: 'center', fontSize: 12, color: notice.color, marginTop: 4 }}>
          {notice.text}
        </div>
      )}
    </div>
  )
}
