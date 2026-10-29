import React, { useEffect, useState } from 'react'
import { set } from '../utils/storage.js'

export default function AuthScreen({ onLogin }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiUrl, setApiUrl] = useState('http://localhost:4000/api')
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => {
    chrome.storage.session.get('doorway_authError', (data) => {
      if (!data.doorway_authError) return
      setError(data.doorway_authError)
      chrome.storage.session.remove('doorway_authError')
    })
  }, [])

  async function handleGoogleSignIn() {
    setError('')
    setLoading(true)
    try {
      await set({ apiUrl })
      const data = await chrome.runtime.sendMessage({ type: 'doorway:googleSignIn' })
      if (!data?.token) throw new Error(data?.error || 'A Google sign-in window is already open. Close it, then try again.')
      onLogin(data.token, data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">JB</div>
      <div className="auth-sub">Sign in to Doorway</div>

      <div className="auth-form">
        {error && <div className="error-msg">{error}</div>}

        <button className="btn btn-primary btn-block" onClick={handleGoogleSignIn} disabled={loading}>
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: 'center', marginTop: 4 }}
          onClick={() => setShowConfig(!showConfig)}
        >
          {showConfig ? 'Hide' : '⚙ API settings'}
        </button>

        {showConfig && (
          <div className="form-group">
            <label className="label">Backend URL</label>
            <input
              className="input"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://your-backend.railway.app/api"
            />
          </div>
        )}
      </div>
    </div>
  )
}
