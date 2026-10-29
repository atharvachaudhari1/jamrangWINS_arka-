import { useEffect, useState } from 'react'
import { get } from '../utils/storage.js'

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function summarize(nudges = [], signals = []) {
  const firstDay = new Date()
  firstDay.setDate(firstDay.getDate() - 6)
  const startKey = localDayKey(firstDay)
  const since = firstDay.setHours(0, 0, 0, 0)
  const recentNudges = nudges.filter((row) => row?.at >= since && row.at <= Date.now())
  const recentSignals = signals.filter((row) => row?.date >= startKey)
  return {
    starts: recentNudges.filter((row) => row.outcome === 'acted').length,
    rests: recentNudges.filter((row) => row.outcome === 'rested').length,
    stuckMinutes: recentSignals.reduce((total, row) => total + (row.frozenMinutes || 0) + (row.thrashingMinutes || 0) + (row.avoidanceMinutes || 0) + (row.depletedMinutes || 0), 0),
  }
}

function dashboardUrl(appUrl, apiUrl) {
  try {
    const base = new URL(appUrl || apiUrl || 'http://localhost:4000/api')
    if (!appUrl && base.hostname === 'localhost' && base.port === '4000') base.port = '5173'
    return new URL('/dashboard', base.origin).toString()
  } catch {
    return 'http://localhost:5173/dashboard'
  }
}

export default function ProgressSummary() {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => get(['doorway_nudgeHistory', 'doorway_signalHistory']).then((data) => {
      if (alive) setSummary(summarize(data.doorway_nudgeHistory, data.doorway_signalHistory))
    })
    load()
    const onChanged = (changes, area) => {
      if (area === 'local' && (changes.doorway_nudgeHistory || changes.doorway_signalHistory)) load()
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  async function openDashboard() {
    const { appUrl, apiUrl } = await get(['appUrl', 'apiUrl'])
    chrome.tabs.create({ url: dashboardUrl(appUrl, apiUrl) })
  }

  return (
    <section className="progress-summary" aria-label="Weekly progress summary">
      <div className="progress-summary-heading">This week</div>
      {summary ? (
        <div className="progress-summary-stats">
          <span><strong>{summary.starts}</strong> first steps</span>
          <span><strong>{summary.rests}</strong> rest resets</span>
          <span><strong>{summary.stuckMinutes}m</strong> estimated stuck</span>
        </div>
      ) : <p className="progress-summary-empty">Your small wins will show here as Doorway records them.</p>}
      <button className="progress-summary-link" type="button" onClick={openDashboard}>See detailed progress →</button>
    </section>
  )
}
