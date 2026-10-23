import React from 'react'

const TABS = [
  { id: 'next',     icon: '⚡', label: 'Next' },
  { id: 'add',      icon: '＋', label: 'Task' },
  { id: 'dump',     icon: '🧠', label: 'Dump' },
  { id: 'timer',    icon: '⏱', label: 'Timer' },
  { id: 'blocking', icon: '🛡', label: 'Block' },
]

export default function NavBar({ active, onChange }) {
  return (
    <nav className="popup-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-btn ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
