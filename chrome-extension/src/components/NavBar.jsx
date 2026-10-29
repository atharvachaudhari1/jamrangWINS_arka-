import React from 'react'

const TABS = [
  { id: 'next', icon: '⚡', label: 'Next' },
  { id: 'capture', icon: '＋', label: 'Capture' },
  { id: 'timer', icon: '⏱', label: 'Timer' },
  { id: 'more', icon: '···', label: 'More' },
]

export default function NavBar({ active, onChange }) {
  return (
    <nav className="popup-nav" aria-label="Extension navigation">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-btn ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <span className="nav-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
