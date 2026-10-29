import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import SupportLink from "./SupportLink";
import TestDataButton from "./TestDataButton";
import { startRegistration } from "@simplewebauthn/browser";
import api from "../services/api";
import { APP_NAME } from "../config/brand";

const GENDER_OPTIONS = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Rather not say" },
];

function getInitials(name, email) {
  if (name && name.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  return (email || "?")[0].toUpperCase();
}

function PrivacySection() {
  const [msg, setMsg] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setMsg(null);
    try {
      const data = await api.get("/account/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `doorway-export-${new Date().toLocaleDateString("en-CA")}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg({ type: "success", text: "Your data was downloaded as a JSON file. Connection tokens are not included." });
    } catch {
      setMsg({ type: "error", text: "The export could not be created. Please try again." });
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    if (confirmText !== "DELETE") return;
    setBusy(true);
    try {
      await api.delete("/account", { data: { confirm: "DELETE" } });
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      window.location.assign("/auth");
    } catch (err) {
      setBusy(false);
      setMsg({ type: "error", text: err.response?.data?.error || "The account could not be deleted." });
    }
  }

  return (
    <section className="profile-settings-card danger-zone profile-settings-span">
      <div className="profile-settings-card-header">
        <h2 className="profile-settings-card-title">Privacy and your data</h2>
        <p className="profile-settings-card-desc">
          Download everything {APP_NAME} stores about you, or delete it. Energy check-ins can also be removed on the{" "}
          <Link to="/rhythm">Your Rhythm</Link> page, and connected services can be disconnected on <Link to="/connectors">Integrations</Link>.
        </p>
      </div>
      <button className="btn btn-secondary" type="button" onClick={exportData}>Export my data</button>
      <form onSubmit={deleteAccount} className="profile-form" style={{ marginTop: 20 }}>
        <label className="profile-form-label" htmlFor="delete-confirm">
          Delete my account and all tasks, classes, check-ins, and history. Type DELETE to confirm.
        </label>
        <input id="delete-confirm" className="profile-form-input" value={confirmText} autoComplete="off"
          onChange={(e) => setConfirmText(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy || confirmText !== "DELETE"} style={{ marginTop: 12 }}>
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </form>
      {msg && <div className={`profile-msg profile-msg--${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}
    </section>
  );
}

function BiometricSignIn({ email, connected, onChange }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return;
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setReady)
      .catch(() => setReady(false));
  }, []);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const options = await api.post("/auth/webauthn/register/options");
      const credential = await startRegistration({ optionsJSON: options });
      const data = await api.post("/auth/webauthn/register/verify", credential);
      onChange(Boolean(data.user?.hasPasskey));
      setMsg({ type: "success", text: "Biometric sign-in is connected for this account." });
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setMsg({ type: "error", text: "Touch ID was cancelled." });
      } else {
        setMsg({ type: "error", text: err.response?.data?.error || "Biometric sign-in could not be connected." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMsg(null);
    try {
      const data = await api.delete("/auth/webauthn");
      onChange(Boolean(data.user?.hasPasskey));
      setMsg({ type: "success", text: "Biometric sign-in was removed from this account." });
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.error || "Biometric sign-in could not be removed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-settings-card profile-settings-span">
      <div className="profile-settings-card-header">
        <h2 className="profile-settings-card-title">Biometric sign-in</h2>
        <p className="profile-settings-card-desc">
          Connect Touch ID or this computer’s fingerprint reader to {email || "the account you are signed in with"}. It only works for this account, and the fingerprint stays on the device.
        </p>
      </div>
      {!ready ? (
        <p className="text-sm text-muted">This computer does not have Touch ID or a fingerprint reader, so biometric sign-in is unavailable.</p>
      ) : connected ? (
        <button className="btn btn-secondary" type="button" onClick={disconnect} disabled={busy}>
          {busy ? "Removing…" : "Remove biometric sign-in"}
        </button>
      ) : (
        <button className="btn btn-primary" type="button" onClick={connect} disabled={busy}>
          {busy ? "Waiting for Touch ID…" : "Connect biometrics"}
        </button>
      )}
      {msg && <div className={`profile-msg profile-msg--${msg.type}`}>{msg.text}</div>}
    </section>
  );
}

export default function ProfileSettings({ onThemeChange }) {
  const { user, setUser, updateUser } = useUser();
  const [hasPasskey, setHasPasskey] = useState(Boolean(user?.hasPasskey));

  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    gender: user?.gender || "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [about, setAbout] = useState({
    name: "",
    github: "",
    linkedin: "",
    portfolio: "",
    email: "",
  });
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutMsg, setAboutMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.get("/profile")
        .then((profile) => {
          if (cancelled) return;
          const saved = profile.publicProfile || {};
          setAbout({
            name: saved.name || "",
            github: saved.github || "",
            linkedin: saved.linkedin || "",
            portfolio: saved.portfolio || "",
            email: saved.email || "",
          });
          setProfileForm((form) => ({
            ...form,
            name: profile.name || form.name,
            email: profile.email || form.email,
          }));
          setHasPasskey(Boolean(profile.hasPasskey));
        })
        .catch(() => {});
    }
    load();
    window.addEventListener("doorway-refresh", load);
    return () => {
      cancelled = true;
      window.removeEventListener("doorway-refresh", load);
    };
  }, []);

  async function handleAboutSave(e) {
    e.preventDefault();
    setAboutSaving(true);
    setAboutMsg(null);
    try {
      await updateUser({ publicProfile: about });
      setAboutMsg({ type: "success", text: "Details saved" });
    } catch (err) {
      const msg = err?.response?.data?.error || "Could not save those details";
      setAboutMsg({ type: "error", text: msg });
    } finally {
      setAboutSaving(false);
    }
  }

  const [selectedTheme, setSelectedTheme] = useState(user?.preferredTheme || "dark");
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeMsg, setThemeMsg] = useState(null);

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await updateUser({
        name: profileForm.name,
        email: profileForm.email,
        gender: profileForm.gender,
      });
      setProfileMsg({ type: "success", text: "Profile updated successfully" });
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to update profile";
      setProfileMsg({ type: "error", text: msg });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleThemeSave(theme) {
    setThemeSaving(true);
    setThemeMsg(null);
    try {
      await updateUser({ preferredTheme: theme });
      onThemeChange(theme);
      setThemeMsg({ type: "success", text: "Theme saved" });
      setTimeout(() => setThemeMsg(null), 2000);
    } catch {
      setThemeMsg({ type: "error", text: "Failed to save theme" });
    } finally {
      setThemeSaving(false);
    }
  }

  function handleThemeSelect(theme) {
    setSelectedTheme(theme);
    handleThemeSave(theme);
  }

  return (
    <div className="profile-settings-page">
      <div className="profile-settings-container profile-settings-dashboard">
        <div className="profile-settings-header">
          <h1 className="page-title">Profile &amp; Settings</h1>
          <p className="page-subtitle">Account, appearance, and the data this copy keeps.</p>
        </div>

        <div className="profile-settings-board">
        <section className="profile-settings-card profile-settings-span">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Profile Information</h2>
          </div>

          <div className="profile-avatar-row">
            <div className="profile-avatar">
              {getInitials(user?.name, user?.email)}
            </div>
            <div>
              <div className="profile-avatar-name">{user?.name || "No name set"}</div>
              <div className="profile-avatar-email">{user?.email}</div>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="profile-form">
            <div className="profile-form-grid profile-form-grid--account">
              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="ps-name">Display Name</label>
                <input
                  id="ps-name"
                  className="profile-form-input"
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your name"
                  maxLength={100}
                  autoComplete="name"
                />
              </div>

              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="ps-email">Email Address</label>
                <input
                  id="ps-email"
                  className="profile-form-input"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="ps-gender">Gender</label>
                <select
                  id="ps-gender"
                  className="profile-form-input profile-form-select"
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm((f) => ({ ...f, gender: e.target.value }))}
                >
                  {GENDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {profileMsg && (
              <div className={`profile-msg profile-msg--${profileMsg.type}`}>
                {profileMsg.text}
              </div>
            )}

            <div className="profile-form-actions">
              <button
                type="submit"
                className="profile-save-btn"
                disabled={profileSaving}
              >
                {profileSaving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </form>
        </section>

        <BiometricSignIn
          email={user?.email}
          connected={hasPasskey}
          onChange={(connected) => {
            setHasPasskey(connected);
            setUser({ ...user, hasPasskey: connected });
          }}
        />

        <div className="profile-settings-split">
        <section className="profile-settings-card">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Appearance</h2>
            <p className="profile-settings-card-desc">Choose how {APP_NAME} looks for you</p>
          </div>

          <div className="theme-picker">
            <button
              className={`theme-option${selectedTheme === "dark" ? " active" : ""}`}
              onClick={() => handleThemeSelect("dark")}
              disabled={themeSaving}
              type="button"
              aria-pressed={selectedTheme === "dark"}
            >
              <div className="theme-option-preview theme-option-preview--dark">
                <div className="theme-preview-bar" />
                <div className="theme-preview-card" />
                <div className="theme-preview-card theme-preview-card--sm" />
              </div>
              <div className="theme-option-label">
                <span className="theme-option-name">Dark</span>
                <span className="theme-option-desc">Easy on the eyes at night</span>
              </div>
              {selectedTheme === "dark" && <span className="theme-option-check">✓</span>}
            </button>

            <button
              className={`theme-option${selectedTheme === "light" ? " active" : ""}`}
              onClick={() => handleThemeSelect("light")}
              disabled={themeSaving}
              type="button"
              aria-pressed={selectedTheme === "light"}
            >
              <div className="theme-option-preview theme-option-preview--light">
                <div className="theme-preview-bar" />
                <div className="theme-preview-card" />
                <div className="theme-preview-card theme-preview-card--sm" />
              </div>
              <div className="theme-option-label">
                <span className="theme-option-name">Light</span>
                <span className="theme-option-desc">Bright and clear</span>
              </div>
              {selectedTheme === "light" && <span className="theme-option-check">✓</span>}
            </button>
          </div>

          {themeMsg && (
            <div className={`profile-msg profile-msg--${themeMsg.type}`} style={{ marginTop: 12 }}>
              {themeMsg.text}
            </div>
          )}
        </section>

        <Link to="/blocking" className="profile-settings-card fs-quick-link">
          <span className="fs-quick-link-icon" aria-hidden="true">🛡️</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="profile-settings-card-title" style={{ display: "block" }}>Focus Shield</span>
            <span className="profile-settings-card-desc" style={{ display: "block", marginTop: 2 }}>
              Blocked sites, allowed sites, and the hours the shield runs.
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        </div>

        <section className="profile-settings-card profile-settings-span">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">About this copy</h2>
            <p className="profile-settings-card-desc">
              Add your own name and links. Leave any field blank if you do not want it shown.
            </p>
          </div>
          <form onSubmit={handleAboutSave} className="profile-form">
            <div className="profile-form-grid">
              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="about-name">Name</label>
                <input id="about-name" className="profile-form-input" value={about.name} placeholder="Your name" onChange={(e) => setAbout({ ...about, name: e.target.value })} />
              </div>
              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="about-email">Email</label>
                <input id="about-email" className="profile-form-input" type="email" value={about.email} placeholder="you@example.com" onChange={(e) => setAbout({ ...about, email: e.target.value })} />
              </div>
              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="about-github">GitHub</label>
                <input id="about-github" className="profile-form-input" value={about.github} placeholder="https://github.com/your-name" onChange={(e) => setAbout({ ...about, github: e.target.value })} />
              </div>
              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="about-linkedin">LinkedIn</label>
                <input id="about-linkedin" className="profile-form-input" value={about.linkedin} placeholder="https://www.linkedin.com/in/your-name" onChange={(e) => setAbout({ ...about, linkedin: e.target.value })} />
              </div>
              <div className="profile-form-field">
                <label className="profile-form-label" htmlFor="about-portfolio">Portfolio</label>
                <input id="about-portfolio" className="profile-form-input" value={about.portfolio} placeholder="https://your-site.com" onChange={(e) => setAbout({ ...about, portfolio: e.target.value })} />
              </div>
            </div>
            {aboutMsg && (
              <div className={`profile-msg profile-msg--${aboutMsg.type}`} style={{ marginTop: 12 }}>
                {aboutMsg.text}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={aboutSaving} style={{ marginTop: 16 }}>
              {aboutSaving ? "Saving…" : "Save details"}
            </button>
          </form>
        </section>

        <div className="profile-settings-split">
        <section className="profile-settings-card">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Support {APP_NAME}</h2>
            <p className="profile-settings-card-desc">
              The coffee link stays off until you set your own Buy Me a Coffee address.
            </p>
          </div>
          <SupportLink />
        </section>

        <section className="profile-settings-card">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Testing & Demo Data</h2>
            <p className="profile-settings-card-desc">
              Instantly populate realistic academic tasks, completed focus sessions, timetable classes, rhythm energy check-ins, and Focus Shield rules for testing.
            </p>
          </div>
          <TestDataButton />
        </section>
        </div>

        <PrivacySection />
        </div>
      </div>
    </div>
  );
}
