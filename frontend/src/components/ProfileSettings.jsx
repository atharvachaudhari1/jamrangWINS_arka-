import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import SupportLink from "./SupportLink";
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

export default function ProfileSettings({ onThemeChange }) {
  const { user, updateUser } = useUser();

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
    api.get("/profile")
      .then((profile) => {
        const saved = profile.publicProfile || {};
        setAbout({
          name: saved.name || "",
          github: saved.github || "",
          linkedin: saved.linkedin || "",
          portfolio: saved.portfolio || "",
          email: saved.email || "",
        });
      })
      .catch(() => {});
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
      <div className="profile-settings-container">
        <div className="profile-settings-header">
          <h1 className="profile-settings-title">Profile &amp; Settings</h1>
          <p className="profile-settings-subtitle">Manage your account details and appearance</p>
        </div>

        {/* Focus Shield quick access — mobile users land here from Profile too */}
        <Link to="/blocking" className="profile-settings-card fs-quick-link">
          <span className="fs-quick-link-icon" aria-hidden="true">🛡️</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="profile-settings-card-title" style={{ display: "block" }}>Focus Shield</span>
            <span className="profile-settings-card-desc" style={{ display: "block", marginTop: 2 }}>
              Manage blocked & whitelisted websites
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>

        {/* Profile Info */}
        <section className="profile-settings-card">
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
            <div className="profile-form-grid">
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

        {/* Appearance */}
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

        {/* Support */}
        <section className="profile-settings-card">
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

        <section className="profile-settings-card">
          <div className="profile-settings-card-header">
            <h2 className="profile-settings-card-title">Support {APP_NAME}</h2>
            <p className="profile-settings-card-desc">
              The coffee link stays off until you set your own Buy Me a Coffee address.
            </p>
          </div>
          <SupportLink />
        </section>

      </div>
    </div>
  );
}
