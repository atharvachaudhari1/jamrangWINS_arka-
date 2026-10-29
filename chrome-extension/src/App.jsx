import React, { useEffect, useState } from 'react'
import { getToken, getUser, setToken, setUser } from './utils/storage.js'
import { connectSocket, disconnectSocket } from './utils/socket.js'
import AuthScreen from './components/AuthScreen.jsx'
import WhatNext from './components/WhatNext.jsx'
import QuickTaskAdd from './components/QuickTaskAdd.jsx'
import QuickBrainDump from './components/QuickBrainDump.jsx'
import QuickTimer from './components/QuickTimer.jsx'
import BlockingTab from './components/BlockingTab.jsx'
import NudgeSettings from './components/NudgeSettings.jsx'
import InsightsPanel from './components/InsightsPanel.jsx'
import SignalMonitor from './components/SignalMonitor.jsx'
import NavBar from './components/NavBar.jsx'

function MoreMenu({ onChange }) {
  const items = [
    ['signals', 'Live signals', 'See what Doorway is noticing'],
    ['blocking', 'Focus Shield', 'Manage distracting sites'],
    ['settings', 'Settings and insights', 'Nudges, quiet hours, and history'],
  ]
  return (
    <section className="more-menu" aria-labelledby="more-title">
      <h1 id="more-title">More</h1>
      <p className="text-muted text-sm">Tools and preferences</p>
      {items.map(([id, title, description]) => (
        <button className="more-action" key={id} onClick={() => onChange(id)}>
          <span><strong>{title}</strong><small>{description}</small></span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </section>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [user, setUserState] = useState(null)
  const [tab, setTab] = useState('next')
  const [captureMode, setCaptureMode] = useState('task')
  const [loading, setLoading] = useState(true)
  const [taskRevision, setTaskRevision] = useState(0)

  useEffect(() => {
    Promise.all([getToken(), getUser()]).then(([token, u]) => {
      if (token) { setAuthed(true); setUserState(u) }
      setLoading(false)
    })
    function onChanged(changes, area) {
      if (area !== 'local' || !changes.authToken?.newValue) return
      getUser().then((u) => { setAuthed(true); setUserState(u); setLoading(false) })
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  // Connect socket when authed; bump taskRevision on task events so WhatNext refetches
  useEffect(() => {
    if (!authed) return;

    let mounted = true;
    connectSocket().then((s) => {
      if (!s || !mounted) return;
      const bump = () => { if (mounted) setTaskRevision((v) => v + 1) };
      s.on('task:created', bump);
      s.on('task:updated', bump);
      s.on('tasks:refetch', bump);
    });

    return () => {
      mounted = false;
      disconnectSocket();
    };
  }, [authed]);

  async function onLogin(token, userData) {
    await Promise.all([setToken(token), setUser(userData)])
    setAuthed(true)
    setUserState(userData)
  }

  async function onLogout() {
    disconnectSocket()
    const { clearAuth } = await import('./utils/storage.js')
    await clearAuth()
    setAuthed(false)
    setUserState(null)
  }

  if (loading) {
    return (
      <div className="popup">
        <div className="loading-wrap"><div className="spinner" /></div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="popup">
        <AuthScreen onLogin={onLogin} />
      </div>
    )
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="popup-logo">
          <svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="23" cy="23" r="5.5" fill="#FF6D3D"/>
            <path d="M 37 23 L 37 66 Q 37 80 20 80" stroke="#FF6D3D" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M 55 23 L 55 80" stroke="#FF6D3D" strokeWidth="8" strokeLinecap="round"/>
            <path d="M 55 23 Q 78 23 78 38 Q 78 52 55 52" stroke="#FF6D3D" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M 55 52 Q 82 52 82 66 Q 82 80 55 80" stroke="#FF6D3D" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Doorway
        </div>
        <div className="flex items-center gap-2">
          <span className="popup-user">{user?.name || user?.email || ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Logout" aria-label="Log out">↩</button>
        </div>
      </header>

      <div className="popup-content">
        {tab === 'next'     && <WhatNext taskRevision={taskRevision} />}
        {tab === 'capture'  && (
          <>
            <div className="mode-tabs" aria-label="Capture type">
              <button className={`mode-tab ${captureMode === 'task' ? 'active' : ''}`} onClick={() => setCaptureMode('task')}>Add task</button>
              <button className={`mode-tab ${captureMode === 'dump' ? 'active' : ''}`} onClick={() => setCaptureMode('dump')}>Brain dump</button>
            </div>
            {captureMode === 'task'
              ? <QuickTaskAdd onAdded={() => setTab('next')} />
              : <QuickBrainDump />}
          </>
        )}
        {tab === 'timer'    && <QuickTimer />}
        {tab === 'blocking' && <BlockingTab />}
        {tab === 'signals'  && <SignalMonitor />}
        {tab === 'more'     && <MoreMenu onChange={setTab} />}
        {tab === 'settings' && (
          <>
            <InsightsPanel />
            <NudgeSettings />
          </>
        )}
      </div>

      <NavBar active={['signals', 'blocking', 'settings'].includes(tab) ? 'more' : tab} onChange={setTab} />
    </div>
  )
}
