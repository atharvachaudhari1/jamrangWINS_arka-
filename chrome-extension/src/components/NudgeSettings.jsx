import React, { useEffect, useState } from 'react'
import { get, set, remove } from '../utils/storage.js'

export default function NudgeSettings() {
  const [enabled, setEnabled] = useState(true)
  const [voice, setVoice] = useState(false)
  const [start, setStart] = useState('22:00')
  const [end, setEnd] = useState('07:00')
  const [quietOn, setQuietOn] = useState(false)
  const [reading, setReading] = useState(false)
  const [sync, setSync] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    get(['doorway_nudgesEnabled', 'doorway_nudgeVoice', 'doorway_quietHours', 'doorway_readingMode', 'doorway_syncInsights']).then((data) => {
      setEnabled(data.doorway_nudgesEnabled !== false)
      setVoice(data.doorway_nudgeVoice === true)
      if (data.doorway_quietHours?.start) {
        setQuietOn(true)
        setStart(data.doorway_quietHours.start)
        setEnd(data.doorway_quietHours.end || '07:00')
      }
      setReading(data.doorway_readingMode === true)
      setSync(data.doorway_syncInsights === true)
    })
  }, [])

  function saveEnabled(value) {
    setEnabled(value)
    set({ doorway_nudgesEnabled: value })
  }

  function saveVoice(value) {
    setVoice(value)
    set({ doorway_nudgeVoice: value })
  }

  function saveQuiet(nextOn, nextStart, nextEnd) {
    setQuietOn(nextOn)
    setStart(nextStart)
    setEnd(nextEnd)
    if (!nextOn) {
      remove('doorway_quietHours')
      return
    }
    set({ doorway_quietHours: { start: nextStart, end: nextEnd } })
  }

  function saveReading(value) {
    setReading(value)
    set({ doorway_readingMode: value })
  }

  function saveSync(value) {
    setSync(value)
    if (!value) {
      set({ doorway_syncInsights: false, doorway_uploadQueue: [] })
      return
    }
    set({ doorway_syncInsights: true })
    chrome.runtime.sendMessage({ type: 'doorway:syncInsights' })
  }

  async function clearData() {
    await remove(['doorway_nudgeHistory', 'doorway_signalHistory', 'doorway_uploadedSignalDates', 'doorway_baseline', 'doorway_uploadQueue', 'doorway_stressLevel', 'doorway_stressAt'])
    chrome.storage.session.remove('doorway_pendingOutcome')
    chrome.runtime.sendMessage({ type: 'doorway:clearSignals' })
    setNotice('Behavior data cleared.')
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Nudges</div>
        <label className="label">
          <input type="checkbox" checked={enabled} onChange={(e) => saveEnabled(e.target.checked)} /> Nudges on
        </label>
        <label className="label">
          <input type="checkbox" checked={voice} onChange={(e) => saveVoice(e.target.checked)} /> Speak nudges aloud
        </label>
        <p className="text-muted">Uses your signed-in account to speak short nudge prompts with ElevenLabs. Only the prompt text is sent for speech.</p>
      </div>
      <div className="card">
        <div className="card-title">Quiet hours</div>
        <label className="label">
          <input type="checkbox" checked={quietOn} onChange={(e) => saveQuiet(e.target.checked, start, end)} /> Use quiet hours
        </label>
        <div className="form-row">
          <div className="form-group">
            <label className="label" htmlFor="quiet-start">Start</label>
            <input id="quiet-start" className="input" type="time" value={start} onChange={(e) => saveQuiet(quietOn, e.target.value, end)} />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="quiet-end">End</label>
            <input id="quiet-end" className="input" type="time" value={end} onChange={(e) => saveQuiet(quietOn, start, e.target.value)} />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Signals</div>
        <label className="label">
          <input type="checkbox" checked={reading} onChange={(e) => saveReading(e.target.checked)} /> Reading mode
        </label>
        <label className="label">
          <input type="checkbox" checked={sync} onChange={(e) => saveSync(e.target.checked)} /> Sync insights to my account
        </label>
        <p className="text-muted">Optional sync includes nudge outcomes and daily totals for idle time, tab switches, and estimated stuck signals. It never includes websites, URLs, titles, or page content.</p>
      </div>
      <button className="btn btn-ghost btn-block" type="button" onClick={clearData}>Clear my behavior data</button>
      {notice && <p className="label" style={{ marginTop: 8 }}>{notice}</p>}
    </div>
  )
}
