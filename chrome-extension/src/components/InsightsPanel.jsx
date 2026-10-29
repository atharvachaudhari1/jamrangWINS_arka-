import React, { useEffect, useState } from 'react'
import { summarizeHistory } from '../background/insights.js'
import { summarize } from '../background/bandit.js'

const ARM_WORDS = {
  ambient: 'a quiet tint helps most',
  prompt: 'a short prompt helps most',
  shrink: 'one small step helps most',
  cowork: 'quiet company helps most',
}

function learningLines(store) {
  const ranking = summarize(store || {})
  const lines = ['thrashing', 'frozen', 'avoidance'].flatMap((state) => {
    const arms = ranking[state] || []
    const samples = arms.reduce((sum, arm) => sum + arm.samples, 0)
    if (samples < 5) return []
    const phrase = ARM_WORDS[arms[0].arm]
    return phrase ? [`When you're ${state}, ${phrase}`] : []
  })
  return lines.length ? lines : ['Still learning']
}

const EMPTY = {
  shown: 0,
  acceptedPct: 0,
  dismissedPct: 0,
  ignoredPct: 0,
  medianSecondsToAction: null,
  topState: null,
  restCompleted: 0,
  line: 'Not enough data yet',
}

export default function InsightsPanel() {
  const [summary, setSummary] = useState(EMPTY)
  const [learned, setLearned] = useState(['Still learning'])
  const [learningOn, setLearningOn] = useState(true)

  useEffect(() => {
    let alive = true
    function load() {
      chrome.storage.local.get(['doorway_nudgeHistory', 'doorway_bandit', 'doorway_learningEnabled'], (data) => {
        if (!alive) return
        setSummary(summarizeHistory(data.doorway_nudgeHistory, Date.now()))
        setLearned(learningLines(data.doorway_bandit))
        setLearningOn(data.doorway_learningEnabled !== false)
      })
    }
    load()
    const onChange = (changes, area) => {
      if (area === 'local' && (changes.doorway_nudgeHistory || changes.doorway_bandit || changes.doorway_learningEnabled)) load()
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(onChange)
    }
  }, [])

  const wait = summary.medianSecondsToAction == null ? 'not yet' : `${summary.medianSecondsToAction}s`

  return (
    <div className="card">
      <div className="card-title">Insights</div>
      <div className="text-sm" style={{ display: 'grid', gap: 6 }}>
        <div>{summary.shown} nudges shown</div>
        <div>Accepted {summary.acceptedPct}% · Dismissed {summary.dismissedPct}% · Ignored {summary.ignoredPct}%</div>
        <div>Median time to a first step: {wait}</div>
        <div>Nudged most while {summary.topState || 'nothing stands out'}</div>
        <div>Rest handoffs completed: {summary.restCompleted}</div>
        <div className="text-muted">{summary.line}</div>
      </div>
      <div className="card-title" style={{ marginTop: 14 }}>What works for you</div>
      <div className="text-sm" style={{ display: 'grid', gap: 6 }}>
        {learned.map((line) => <div key={line}>{line}</div>)}
      </div>
      <label className="label" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={learningOn}
          onChange={(event) => {
            const value = event.target.checked
            setLearningOn(value)
            chrome.storage.local.set({ doorway_learningEnabled: value })
          }}
        /> Learning
      </label>
      <button
        className="btn btn-ghost btn-block"
        type="button"
        style={{ marginTop: 8 }}
        onClick={() => chrome.storage.local.remove('doorway_bandit')}
      >
        Reset what it learned
      </button>
    </div>
  )
}
