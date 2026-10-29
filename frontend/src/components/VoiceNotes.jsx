import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../services/api";

const STORAGE_KEY = "doorway_voice_notes";
const STORAGE_SORT_KEY = "doorway_voice_notes_sort";

const TAG_CONFIG = {
  study: { label: "Study", color: "#007aff", bg: "rgba(0, 122, 255, 0.12)", border: "rgba(0, 122, 255, 0.28)" },
  work: { label: "Work", color: "#ff9500", bg: "rgba(255, 149, 0, 0.12)", border: "rgba(255, 149, 0, 0.28)" },
  ideas: { label: "Ideas", color: "#34c759", bg: "rgba(52, 199, 89, 0.12)", border: "rgba(52, 199, 89, 0.28)" },
  personal: { label: "Personal", color: "#af52de", bg: "rgba(175, 82, 222, 0.12)", border: "rgba(175, 82, 222, 0.28)" },
};

export function getAutomaticTag(text) {
  if (!text) return "personal";
  const lower = text.toLowerCase();
  if (/\b(exams?|assignments?|lectures?|homework|study|quiz|class|syllabus)\b/i.test(lower) || /\b(?<!voice\s+)notes?\b/i.test(lower)) {
    return "study";
  }
  if (/\b(meetings?|deadlines?|clients?|emails?|project\s+review|deliverable|client)\b/i.test(lower)) {
    return "work";
  }
  if (/\b(build\s+project|build|projects?|ideas?|apps?|feature|design|prototype)\b/i.test(lower)) {
    return "ideas";
  }
  return "personal";
}

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const isToday = now.toDateString() === date.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) return `Today at ${timeStr}`;
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr}, ${timeStr}`;
}

export default function VoiceNotes() {
  const [notes, setNotes] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState("all");
  const [sortOrder, setSortOrder] = useState(() => localStorage.getItem(STORAGE_SORT_KEY) || "newest");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [speakingId, setSpeakingId] = useState(null);

  const recognitionRef = useRef(null);
  const speechBaseTextRef = useRef("");
  const toastTimeoutRef = useRef(null);

  function showToast(msg) {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMsg(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(""), 2600);
  }

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsRecording(true);
        showToast("Microphone active. Listening...");
      };

      rec.onresult = (event) => {
        let final = "";
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
          else interim += event.results[i][0].transcript;
        }
        const text = final + (interim ? (final ? " " : "") + interim : "");
        setInputText(speechBaseTextRef.current + text);
      };

      rec.onerror = (e) => {
        setIsRecording(false);
        if (e.error === "not-allowed") {
          showToast("Microphone access was denied.");
        } else {
          showToast(`Speech error: ${e.error}`);
        }
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }

    return () => {
      recognitionRef.current?.stop();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // Save notes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      showToast("Storage error saving notes.");
    }
  }, [notes]);

  function toggleRecording() {
    if (!recognitionRef.current) {
      showToast("Speech recognition is not supported in this browser.");
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      showToast("Stopped listening");
    } else {
      speechBaseTextRef.current = inputText ? (inputText.endsWith(" ") ? inputText : inputText + " ") : "";
      try {
        recognitionRef.current.start();
      } catch {
        recognitionRef.current.stop();
      }
    }
  }

  function handleSaveNote() {
    const text = inputText.trim();
    if (!text) return;
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }
    const detectedTag = getAutomaticTag(text);
    const newNote = {
      id: "note_" + Date.now(),
      text,
      tag: detectedTag,
      isPinned: false,
      createdAt: new Date().toISOString(),
      convertedToTask: false,
    };
    setNotes((prev) => [newNote, ...prev]);
    setInputText("");
    showToast(`Note saved and tagged as ${TAG_CONFIG[detectedTag]?.label || detectedTag}`);
  }

  function togglePin(id) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isPinned: !n.isPinned } : n))
    );
  }

  function startEditing(note) {
    setEditingNoteId(note.id);
    setEditText(note.text);
    setDeleteConfirmId(null);
  }

  function saveEdit(id) {
    if (!editText.trim()) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, text: editText.trim(), tag: getAutomaticTag(editText.trim()) }
          : n
      )
    );
    setEditingNoteId(null);
    showToast("Note updated");
  }

  function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setDeleteConfirmId(null);
    showToast("Note deleted");
  }

  function copyNote(text) {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  }

  function speakNote(id, text) {
    if (!window.speechSynthesis) {
      showToast("Text-to-speech not supported in this browser.");
      return;
    }
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  async function convertToTask(note) {
    try {
      const subject = note.tag === "study" ? "Academic" : note.tag === "work" ? "Work" : "General";
      await api.post("/tasks", {
        title: note.text.slice(0, 100),
        subject,
        estimateMins: 30,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, convertedToTask: true } : n))
      );
      window.dispatchEvent(new Event("doorway-refresh"));
      showToast("🎯 Added as task in Doorway planner!");
    } catch {
      showToast("Failed to create task");
    }
  }

  // Counts for filters
  const counts = { all: notes.length, study: 0, work: 0, ideas: 0, personal: 0 };
  notes.forEach((n) => {
    const t = n.tag || "personal";
    if (counts[t] !== undefined) counts[t]++;
    else counts.personal++;
  });

  // Filter & Sort
  const filtered = notes.filter((n) => {
    const matchesTag = activeTag === "all" || n.tag === activeTag;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      n.text.toLowerCase().includes(query) ||
      (n.tag && n.tag.toLowerCase().includes(query));
    return matchesTag && matchesQuery;
  });

  filtered.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (sortOrder === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortOrder === "tag") return (a.tag || "").localeCompare(b.tag || "");
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const previewTag = inputText.trim() ? getAutomaticTag(inputText) : null;

  return (
    <div className="voice-notes-page">
      <div className="voice-notes-header">
        <div>
          <h1 className="page-title">Voice Notes</h1>
          <p className="page-subtitle">
            Dictate or jot ideas freely. Notes are automatically organized and can be turned into planner tasks anytime.
          </p>
        </div>
      </div>

      {/* ── Editor Card ────────────────────────────────────── */}
      <div className="card vn-editor-card">
        <div className="vn-editor-top">
          <label className="profile-form-label" htmlFor="vn-input">
            New Note
          </label>
          {previewTag && (
            <span
              className="vn-live-badge"
              style={{
                color: TAG_CONFIG[previewTag]?.color,
                background: TAG_CONFIG[previewTag]?.bg,
                borderColor: TAG_CONFIG[previewTag]?.border,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span className="vn-card-dot" style={{ backgroundColor: TAG_CONFIG[previewTag]?.color }} />
              <span>Detected: {TAG_CONFIG[previewTag]?.label}</span>
            </span>
          )}
        </div>

        <textarea
          id="vn-input"
          className="textarea vn-textarea"
          rows={3}
          placeholder="Start typing your note or press Dictate to speak..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />

        <div className="vn-editor-footer">
          <div className="vn-editor-left">
            <button
              type="button"
              className={`vn-mic-btn ${isRecording ? "listening" : ""}`}
              onClick={toggleRecording}
              aria-label={isRecording ? "Stop voice dictation" : "Start voice dictation"}
            >
              <span className={`vn-mic-dot ${isRecording ? "pulsing" : ""}`} />
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
              </svg>
              <span>{isRecording ? "Listening..." : "Dictate"}</span>
            </button>
            <span className="text-xs text-muted">{inputText.length} characters</span>
          </div>

          <div className="vn-editor-actions">
            {inputText.trim() && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setInputText("")}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveNote}
              disabled={!inputText.trim()}
            >
              Save Note
            </button>
          </div>
        </div>
      </div>

      {/* ── Toolbar: Search & Filters ──────────────────────── */}
      <div className="vn-toolbar">
        <div className="vn-search-wrap">
          <svg className="vn-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="input vn-search-input"
            placeholder="Search notes or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="vn-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="vn-filter-tags">
          <button
            type="button"
            className={`vn-filter-btn ${activeTag === "all" ? "active" : ""}`}
            onClick={() => setActiveTag("all")}
          >
            All <span className="vn-filter-count">{counts.all}</span>
          </button>
          {Object.entries(TAG_CONFIG).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={`vn-filter-btn ${activeTag === key ? "active" : ""}`}
              onClick={() => setActiveTag(key)}
              style={activeTag === key ? { borderColor: config.color, color: config.color } : {}}
            >
              <span className="vn-card-dot" style={{ backgroundColor: config.color, display: "inline-block", marginRight: 6 }} />
              <span>{config.label}</span>
              <span className="vn-filter-count">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="vn-sort-wrap">
          <select
            className="select vn-sort-select"
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              localStorage.setItem(STORAGE_SORT_KEY, e.target.value);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="tag">Group by topic</option>
          </select>
        </div>
      </div>

      {/* ── Notes Grid ─────────────────────────────────────── */}
      <div className="vn-notes-grid">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="card vn-empty-state"
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
                {searchQuery || activeTag !== "all" ? "No matching notes found" : "No notes yet"}
              </h3>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                {searchQuery || activeTag !== "all"
                  ? "Try adjusting your search query or selecting another category."
                  : "Dictate with your voice or type your thoughts above to start."}
              </p>
            </motion.div>
          ) : (
            filtered.map((note) => {
              const tagInfo = TAG_CONFIG[note.tag] || TAG_CONFIG.personal;
              const isEditing = editingNoteId === note.id;
              const isDeleting = deleteConfirmId === note.id;
              const isSpeaking = speakingId === note.id;

              return (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
                  className={`card vn-note-card ${note.isPinned ? "is-pinned" : ""}`}
                >
                  <div className="vn-card-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        className="vn-card-tag"
                        style={{
                          color: tagInfo.color,
                          background: tagInfo.bg,
                          borderColor: tagInfo.border,
                        }}
                      >
                        <span className="vn-card-dot" style={{ backgroundColor: tagInfo.color }} />
                        <span>{tagInfo.label}</span>
                      </span>

                      {note.isPinned && (
                        <span className="vn-pinned-badge" title="Pinned note" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="17" x2="12" y2="22" />
                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                          </svg>
                          <span>Pinned</span>
                        </span>
                      )}

                      {note.convertedToTask && (
                        <span className="vn-converted-badge" title="Added as task in Doorway" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>In Tasks</span>
                        </span>
                      )}
                    </div>

                    <span className="vn-card-time">{formatTimestamp(note.createdAt)}</span>
                  </div>

                  {isEditing ? (
                    <div className="vn-edit-wrap">
                      <textarea
                        className="textarea vn-edit-textarea"
                        rows={3}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      <div className="vn-edit-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingNoteId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => saveEdit(note.id)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="vn-card-body">{note.text}</p>
                  )}

                  {/* ── Card Footer Actions ── */}
                  <div className="vn-card-footer">
                    <div className="vn-footer-left">
                      <button
                        type="button"
                        className={`vn-icon-btn ${note.isPinned ? "active" : ""}`}
                        title={note.isPinned ? "Unpin note" : "Pin to top"}
                        onClick={() => togglePin(note.id)}
                        aria-label="Pin note"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`vn-icon-btn ${isSpeaking ? "active" : ""}`}
                        title={isSpeaking ? "Stop speaking" : "Read aloud"}
                        onClick={() => speakNote(note.id, note.text)}
                        aria-label="Speak note"
                      >
                        {isSpeaking ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="5" y="5" width="14" height="14" rx="2" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        className="vn-icon-btn"
                        title="Copy note text"
                        onClick={() => copyNote(note.text)}
                        aria-label="Copy note"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="vn-icon-btn"
                        title="Edit note"
                        onClick={() => startEditing(note)}
                        aria-label="Edit note"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>

                    <div className="vn-footer-right">
                      {!note.convertedToTask && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm vn-convert-btn"
                          onClick={() => convertToTask(note)}
                          title="Create a Doorway task from this note"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="6" />
                            <circle cx="12" cy="12" r="2" fill="currentColor" />
                          </svg>
                          <span>Add as Task</span>
                        </button>
                      )}

                      {isDeleting ? (
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <span className="text-xs text-muted">Delete?</span>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: "3px 8px" }}
                            onClick={() => deleteNote(note.id)}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "3px 8px" }}
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="vn-icon-btn vn-delete-btn"
                          title="Delete note"
                          onClick={() => setDeleteConfirmId(note.id)}
                          aria-label="Delete note"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* ── Toast Notification ─────────────────────────────── */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
            className="vn-toast"
            role="status"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
