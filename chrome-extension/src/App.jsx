import React, { useEffect, useState } from 'react'
import { getToken, getUser, setToken, setUser } from './utils/storage.js'
import { connectSocket, disconnectSocket } from './utils/socket.js'
import AuthScreen from './components/AuthScreen.jsx'
import WhatNext from './components/WhatNext.jsx'
import QuickTaskAdd from './components/QuickTaskAdd.jsx'
import QuickBrainDump from './components/QuickBrainDump.jsx'
import QuickTimer from './components/QuickTimer.jsx'
import BlockingTab from './components/BlockingTab.jsx'
import NavBar from './components/NavBar.jsx'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [user, setUserState] = useState(null)
  const [tab, setTab] = useState('next')
  const [loading, setLoading] = useState(true)
  const [taskRevision, setTaskRevision] = useState(0)

  useEffect(() => {
    Promise.all([getToken(), getUser()]).then(([token, u]) => {
      if (token) { setAuthed(true); setUserState(u) }
      setLoading(false)
    })
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
            <defs>
              <linearGradient id="extG" x1="13" y1="17" x2="82" y2="80" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7C3AED"/>
                <stop offset="42%" stopColor="#6366F1"/>
                <stop offset="100%" stopColor="#06B6D4"/>
              </linearGradient>
            </defs>
            <circle cx="23" cy="23" r="5.5" fill="url(#extG)"/>
            <path d="M 37 23 L 37 66 Q 37 80 20 80" stroke="url(#extG)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M 55 23 L 55 80" stroke="url(#extG)" strokeWidth="8" strokeLinecap="round"/>
            <path d="M 55 23 Q 78 23 78 38 Q 78 52 55 52" stroke="url(#extG)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M 55 52 Q 82 52 82 66 Q 82 80 55 80" stroke="url(#extG)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Doorway
        </div>
        <div className="flex items-center gap-2">
          <span className="popup-user">{user?.name || user?.email || ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Logout">↩</button>
        </div>
      </header>

      <div className="popup-content">
        {tab === 'next'     && <WhatNext taskRevision={taskRevision} />}
        {tab === 'add'      && <QuickTaskAdd onAdded={() => setTab('next')} />}
        {tab === 'dump'     && <QuickBrainDump />}
        {tab === 'timer'    && <QuickTimer />}
        {tab === 'blocking' && <BlockingTab />}
      </div>

      <NavBar active={tab} onChange={setTab} />
    </div>
  )
}
