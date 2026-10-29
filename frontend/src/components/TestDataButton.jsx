import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { populateTestData } from "../services/testData";

export default function TestDataButton({
  variant = "default",
  className = "",
  style = {},
  onComplete,
}) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSeed(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (loading) return;

    setLoading(true);
    setError("");
    try {
      await populateTestData();
      setSuccess(true);
      if (onComplete) onComplete();
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      setError("Failed to load test data");
      setTimeout(() => setError(""), 3500);
    } finally {
      setLoading(false);
    }
  }

  // Apple SF-style Wand / Test Data SVG Icon (No Emojis)
  const WandIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8L19 13" />
      <path d="M15 9h0" />
      <path d="M17.8 6.2L19 5" />
      <path d="M3 21l9-9" />
      <path d="M12.2 6.2L11 5" />
    </svg>
  );

  const CheckIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  const SpinnerIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
    </svg>
  );

  if (variant === "banner") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }}>
        <button
          type="button"
          onClick={handleSeed}
          disabled={loading}
          className={`dev-banner-cta ${className}`}
          style={{
            cursor: loading ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          title="Automatically populate all tasks, focus sessions, timetable, rhythm, and focus shield with test data"
        >
          {loading ? <SpinnerIcon /> : success ? <CheckIcon /> : <WandIcon />}
          <span>{loading ? "Adding Data..." : success ? "Test Data Added!" : "Fill Test Data"}</span>
        </button>
      </div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={handleSeed}
      disabled={loading}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
      className={`btn ${success ? "btn-success" : variant === "primary" ? "btn-primary" : "btn-secondary"} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: loading ? "wait" : "pointer",
        ...style,
      }}
      title="Populate test tasks, timetable, focus sessions, rhythm, and shield"
      aria-label="Add test data"
    >
      {loading ? (
        <SpinnerIcon />
      ) : success ? (
        <CheckIcon />
      ) : (
        <WandIcon />
      )}
      <span>{loading ? "Filling Data..." : success ? "Test Data Loaded!" : "Fill Test Data"}</span>
    </motion.button>
  );
}
