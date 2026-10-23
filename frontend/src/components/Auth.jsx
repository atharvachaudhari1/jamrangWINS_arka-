import { useState, useEffect, useCallback, useRef } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import { useNavigate } from "react-router-dom";
import Logo from "./Logo";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Auth() {
  const { setUser, setToken } = useUser();
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleCredential = useCallback(async (response) => {
    setGoogleLoading(true);
    setError("");
    try {
      const data = await api.post("/auth/google", { idToken: response.credential });
      setUser(data.user);
      setToken(data.token);
      navigate("/");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Google sign-in failed";
      setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  }, [navigate, setUser, setToken]);

  const gsiInitializedRef = useRef(false);
  const googleButtonWrapRef = useRef(null);
  const googleButtonBoxRef = useRef(null);

  const initGoogleIdentity = useCallback(() => {
    if (!GOOGLE_CLIENT_ID || !window.google) return false;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    });
    // Render Google's own button on top of our styled one. Unlike One Tap's
    // silent prompt() below, a click on Google's real button always opens
    // their standard account-chooser popup/redirect — this keeps working on
    // a brand-new device/browser profile, with third-party cookies blocked,
    // or anywhere else One Tap silently declines to show (which it does
    // without any error, just no UI at all).
    if (googleButtonBoxRef.current) {
      const width = Math.min(400, Math.max(200, Math.round(
        googleButtonWrapRef.current?.getBoundingClientRect().width || 320
      )));
      window.google.accounts.id.renderButton(googleButtonBoxRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "center",
        width,
      });
    }
    gsiInitializedRef.current = true;
    // Also try the silent One Tap prompt for returning users on a device
    // Google already recognizes. If it can't be shown, notification carries
    // the reason but we don't surface it as an error — the real button
    // above is always there as the reliable path.
    window.google.accounts.id.prompt();
    return true;
  }, [handleGoogleCredential]);

  // Initialise Google Identity Services as soon as the script is ready.
  // The script tag loads with `async defer`, so it may not be available yet
  // on mount — poll briefly instead of giving up after a single check.
  useEffect(() => {
    if (initGoogleIdentity()) return;
    const interval = setInterval(() => {
      if (initGoogleIdentity()) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [initGoogleIdentity]);

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            <Logo size={28} variant="icon" />
          </div>
          <h1 className="auth-title">Doorway</h1>
          <p className="auth-subtitle">One small step at a time.</p>
          <p className="auth-value">
            An energy-aware academic planner. Sign in to keep your tasks, timetable, and existing integrations.
          </p>
        </div>

        <div className="auth-status" role="status" aria-live="polite">
          {error && <div className="auth-error">{error}</div>}
        </div>

        {!GOOGLE_CLIENT_ID ? (
          <p className="auth-value">Opening Doorway…</p>
        ) : (
          <div className="google-btn-wrap" ref={googleButtonWrapRef}>
            <button
              type="button"
              className="btn-google"
              disabled={googleLoading}
              tabIndex={-1}
              aria-hidden="true"
            >
              {googleLoading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Redirecting…
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
            {/* Google renders its real, clickable button here on top of the
                styled one above (see .google-btn-overlay) so clicks open
                Google's own popup/redirect flow directly, instead of going
                through the silent, less reliable One Tap prompt. */}
            <div className="google-btn-overlay" ref={googleButtonBoxRef} />
          </div>
        )}

        <p className="auth-legal">
          By continuing you agree to our{" "}
          <a href="/terms" className="text-link">Terms of Service</a> and{" "}
          <a href="/privacy" className="text-link">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
