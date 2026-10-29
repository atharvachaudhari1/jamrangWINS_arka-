import { useState, useEffect, useCallback, useRef } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import { useNavigate } from "react-router-dom";
import Logo from "./Logo";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Auth() {
  const { setUser, setToken } = useUser();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [kind, setKind] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [step, setStep] = useState("choose");
  const [busy, setBusy] = useState(false);
  const [platformAuth, setPlatformAuth] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return;
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setPlatformAuth)
      .catch(() => setPlatformAuth(false));
  }, []);

  function remember(data) {
    localStorage.setItem("accessToken", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  function enter(data) {
    remember(data);
    navigate("/");
  }

  const handleGoogleCredential = useCallback(async (response) => {
    setGoogleLoading(true);
    setError("");
    try {
      const data = await api.post("/auth/google", { idToken: response.credential });
      enter(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  }, [navigate, platformAuth, setUser, setToken]);

  const gsiInitializedRef = useRef(false);
  const googleButtonWrapRef = useRef(null);
  const googleButtonBoxRef = useRef(null);

  const initGoogleIdentity = useCallback(() => {
    if (!GOOGLE_CLIENT_ID || !window.google) return false;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    });
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
    window.google.accounts.id.prompt();
    return true;
  }, [handleGoogleCredential]);

  useEffect(() => {
    if (initGoogleIdentity()) return;
    const interval = setInterval(() => {
      if (initGoogleIdentity()) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [initGoogleIdentity]);

  async function sendCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setDevCode("");
    try {
      const data = await api.post("/auth/email/start", { email, kind });
      setStep("code");
      if (data.devCode) {
        setDevCode(data.devCode);
        setNotice("Mail is not set up on this computer, so the code is shown here.");
      } else {
        setNotice(`A code was sent to ${email}.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || "The code could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api.post("/auth/email/verify", { email, code });
      enter(data);
    } catch (err) {
      setError(err.response?.data?.error || "That code could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPasskey() {
    setBusy(true);
    setError("");
    try {
      const options = await api.post("/auth/webauthn/login/options");
      const assertion = await startAuthentication({ optionsJSON: options });
      const data = await api.post("/auth/webauthn/login/verify", assertion);
      remember(data);
      navigate("/");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setError("Touch ID was cancelled.");
      } else {
        setError(err.response?.data?.error || "Biometric sign-in is not connected yet. Sign in, then connect it in Settings.");
      }
    } finally {
      setBusy(false);
    }
  }

  const emailLabel = kind === "work" ? "Work email" : "College email";

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <Logo size={36} variant="icon" />
        <h1 className="auth-title">Doorway</h1>
        <p className="auth-subtitle">One small step at a time.</p>
        <p className="auth-value">
          An energy-aware academic planner. Sign in to keep your tasks, timetable, and focus tools.
        </p>
      </div>

      <div className="card auth-card">
        <h2 className="auth-card-title">Sign in</h2>

        <div className="auth-status" role="status" aria-live="polite">
          {error && <div className="auth-error">{error}</div>}
          {notice && !error && <div className="auth-notice">{notice}</div>}
        </div>

        {step === "code" ? (
          <form className="auth-stack" onSubmit={verifyCode}>
            <label>
              Code sent to {email}
              <input className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            {devCode && <p className="auth-dev-code">Development code: {devCode}</p>}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
            <button className="btn btn-ghost" type="button" onClick={() => { setStep("choose"); setCode(""); setDevCode(""); setNotice(""); }}>Back</button>
          </form>
        ) : kind ? (
          <form className="auth-stack" onSubmit={sendCode}>
            <label>
              {emailLabel}
              <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder={kind === "work" ? "you@company.com" : "you@university.edu"} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
            <button className="btn btn-ghost" type="button" onClick={() => { setKind(""); setError(""); }}>Back</button>
          </form>
        ) : (
          <div className="auth-stack">
            {GOOGLE_CLIENT_ID ? (
              <div className="google-btn-wrap" ref={googleButtonWrapRef}>
                <button type="button" className="btn-google" disabled={googleLoading} tabIndex={-1} aria-hidden="true">
                  {googleLoading ? "Redirecting…" : "Continue with Google"}
                </button>
                <div className="google-btn-overlay" ref={googleButtonBoxRef} />
              </div>
            ) : (
              <p className="auth-value">Google sign-in needs a client id in the frontend env file.</p>
            )}

            <button className="btn-google" type="button" onClick={() => { setKind("college"); setError(""); }}>
              College email
            </button>
            <button className="btn-google" type="button" onClick={() => { setKind("work"); setError(""); }}>
              Work email
            </button>
            {platformAuth && (
              <button className="btn-google" type="button" onClick={signInWithPasskey} disabled={busy}>
                {busy ? "Waiting for Touch ID…" : "Touch ID or fingerprint"}
              </button>
            )}
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
