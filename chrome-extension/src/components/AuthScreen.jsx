import React, { useState } from 'react'
import { googleLogin } from '../utils/api.js'
import { signInWithGoogle } from '../utils/googleAuth.js'
import { set } from '../utils/storage.js'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function AuthScreen({ onLogin }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiUrl, setApiUrl] = useState('http://localhost:4000/api')
  const [showConfig, setShowConfig] = useState(false)

  async function handleGoogleSignIn() {
    setError('')
    setLoading(true)
    try {
      await set({ apiUrl })
      const idToken = await signInWithGoogle(GOOGLE_CLIENT_ID)
      const data = await googleLogin(idToken)
      onLogin(data.token || data.accessToken, data.user)
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
