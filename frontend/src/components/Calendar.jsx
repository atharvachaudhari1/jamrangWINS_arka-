import React, { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid/index.js";
import interactionPlugin from "@fullcalendar/interaction/index.js";
import timeGridPlugin from "@fullcalendar/timegrid/index.js";
import { motion, AnimatePresence } from "framer-motion";
import api from "../services/api";

// ── Built-in Calendar Events (Matching macOS Screenshot) ─────────────────
const MACOS_CALENDAR_EVENTS = [
  {
    id: "holiday-gandhi-2026",
    title: "Mahatma Gandhi's Birthday",
    date: "2026-10-02",
    extendedProps: { kind: "holiday" },
  },
  {
    id: "birthday-shania-2026",
    title: "SHANIA's Birthday",
    date: "2026-10-17",
    extendedProps: { kind: "birthday" },
  },
  {
    id: "birthday-paras-2026",
    title: "Paras Gawand's 20th...",
    date: "2026-10-20",
    extendedProps: { kind: "birthday" },
  },
  {
    id: "holiday-dussehra-2026",
    title: "Dussehra",
    date: "2026-10-20",
    extendedProps: { kind: "holiday" },
  },
  {
    id: "holiday-valmiki-2026",
    title: "Maharishi Valmiki's Birthday",
    date: "2026-10-26",
    extendedProps: { kind: "holiday" },
  },
  {
    id: "holiday-karva-2026",
    title: "Karva Chauth",
    date: "2026-10-29",
    extendedProps: { kind: "holiday" },
  },
];

function minutesToClock(mins) {
  const hours = String(Math.floor(mins / 60)).padStart(2, "0");
  const minutes = String(mins % 60).padStart(2, "0");
  return `${hours}:${minutes}:00`;
}

export default function Calendar() {
  const calendarRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [currentView, setCurrentView] = useState("Month"); // Day, Week, Month, Year
  const [currentDate, setCurrentDate] = useState(new Date("2026-10-27T00:00:00"));
  const [monthName, setMonthName] = useState("October");
  const [yearNum, setYearNum] = useState("2026");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("2026-10-27");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventKind, setNewEventKind] = useState("task");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showWarning, setShowWarning] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function loadEvents() {
    try {
      const [taskRes, timetableRes] = await Promise.all([
        api.get("/tasks").catch(() => ({ tasks: [] })),
        api.get("/timetable").catch(() => ({ blocks: [] })),
      ]);

      const tasks = (taskRes.tasks || [])
        .filter((task) => task.dueAt)
        .map((task) => ({
          id: `task-${task._id}`,
          title: task.title,
          date: new Date(task.dueAt).toISOString().split("T")[0],
          extendedProps: { kind: "task", rawId: task._id },
        }));

      const classes = (timetableRes.blocks || []).map((block) => {
        const base = {
          id: `class-${block._id}`,
          title: block.title,
          extendedProps: { kind: "class", rawId: block._id },
        };
        if (block.date) {
          const start = new Date(block.date);
          start.setHours(Math.floor(block.startMinutes / 60), block.startMinutes % 60, 0, 0);
          const end = new Date(start.getTime() + (block.endMinutes - block.startMinutes) * 60000);
          return { ...base, start: start.toISOString(), end: end.toISOString() };
        }
        return {
          ...base,
          daysOfWeek: [block.dayOfWeek],
          startTime: minutesToClock(block.startMinutes),
          endTime: minutesToClock(block.endMinutes),
        };
      });

      setEvents([...MACOS_CALENDAR_EVENTS, ...tasks, ...classes]);
    } catch {
      setEvents(MACOS_CALENDAR_EVENTS);
    }
  }

  useEffect(() => {
    loadEvents();
    window.addEventListener("doorway-refresh", loadEvents);
    return () => window.removeEventListener("doorway-refresh", loadEvents);
  }, []);

  function updateTitle(date) {
    if (!date) return;
    const m = date.toLocaleDateString("en-US", { month: "long" });
    const y = date.toLocaleDateString("en-US", { year: "numeric" });
    setMonthName(m);
    setYearNum(y);
    setCurrentDate(date);
  }

  function handlePrev() {
    if (currentView === "Year") {
      const prevYear = new Date(currentDate);
      prevYear.setFullYear(prevYear.getFullYear() - 1);
      updateTitle(prevYear);
      return;
    }
    const api = calendarRef.current?.getApi();
    if (api) {
      api.prev();
      updateTitle(api.getDate());
    }
  }

  function handleNext() {
    if (currentView === "Year") {
      const nextYear = new Date(currentDate);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      updateTitle(nextYear);
      return;
    }
    const api = calendarRef.current?.getApi();
    if (api) {
      api.next();
      updateTitle(api.getDate());
    }
  }

  function handleToday() {
    const today = new Date("2026-10-27T00:00:00");
    if (currentView === "Year") {
      updateTitle(today);
      return;
    }
    const api = calendarRef.current?.getApi();
    if (api) {
      api.today();
      updateTitle(api.getDate());
    }
  }

  function handleViewChange(viewName) {
    setCurrentView(viewName);
    const api = calendarRef.current?.getApi();
    if (!api) return;

    if (viewName === "Day") {
      api.changeView("timeGridDay");
    } else if (viewName === "Week") {
      api.changeView("timeGridWeek");
    } else if (viewName === "Month") {
      api.changeView("dayGridMonth");
    }
    updateTitle(api.getDate());
  }

  function handleDateClick(info) {
    setSelectedDate(info.dateStr);
    setNewEventTitle("");
    setNewEventKind("task");
    setModalOpen(true);
  }

  function handleEventClick(info) {
    setSelectedEvent(info.event);
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    if (newEventKind === "task") {
      await api.post("/tasks", {
        title: newEventTitle.trim(),
        dueAt: selectedDate,
      });
      loadEvents();
    } else {
      setEvents((prev) => [
        ...prev,
        {
          id: `custom-${Date.now()}`,
          title: newEventTitle.trim(),
          date: selectedDate,
          extendedProps: { kind: newEventKind },
        },
      ]);
    }
    setModalOpen(false);
  }

  const filteredEvents = searchQuery.trim()
    ? events.filter((ev) => ev.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : events;

  // Custom Day Cell Renderer: exact match to screenshot
  function renderDayCell(arg) {
    const isFirstDay = arg.date.getDate() === 1;
    const monthShort = arg.date.toLocaleDateString("en-US", { month: "short" });
    const isToday =
      arg.date.getFullYear() === 2026 &&
      arg.date.getMonth() === 9 && // October is 9 (0-indexed)
      arg.date.getDate() === 27;

    return (
      <div className={`macos-day-number ${isToday ? "is-today" : ""}`}>
        {isFirstDay ? `${arg.dayNumberText} ${monthShort}` : arg.dayNumberText}
      </div>
    );
  }

  // Custom Event Pill Renderer: exact match to Apple macOS Calendar
  function renderEventContent(eventInfo) {
    const kind = eventInfo.event.extendedProps?.kind || "task";
    const isHoliday = kind === "holiday";

    return (
      <div className={`macos-event-pill macos-event-${kind}`}>
        <span className="macos-event-icon" style={{ fontSize: isHoliday ? 10 : 8, opacity: 0.85 }}>
          {isHoliday ? "★" : "•"}
        </span>
        <span className="macos-event-title">{eventInfo.event.title}</span>
      </div>
    );
  }

  // 12-Month Year View
  const monthsOfYear = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="macos-calendar-wrapper">
      <div className="macos-calendar-window">
        {/* ── Top macOS Titlebar Toolbar ────────────────────── */}
        <div className="macos-calendar-toolbar">
          <div className="macos-toolbar-left">
            <div className="macos-traffic-lights" aria-hidden="true">
              <span className="macos-dot macos-dot-red" />
              <span className="macos-dot macos-dot-yellow" />
              <span className="macos-dot macos-dot-green" />
            </div>

            <div className="macos-pill-group">
              <button
                className="macos-tool-btn"
                title="Sidebar calendar list"
                aria-label="Toggle calendar list"
                onClick={() => {}}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18M3 9h6" />
                </svg>
              </button>
              <button
                className="macos-tool-btn"
                title="Inbox notifications"
                aria-label="Calendar inbox"
                onClick={() => {}}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
                </svg>
              </button>
            </div>

            <button
              className="macos-circle-btn"
              title="Add event"
              aria-label="Add event"
              onClick={() => {
                setSelectedDate("2026-10-27");
                setNewEventTitle("");
                setModalOpen(true);
              }}
            >
              +
            </button>

            {showWarning && (
              <div
                className="macos-warning-badge"
                role="status"
                onClick={() => setShowWarning(false)}
                title="Click to dismiss"
                style={{ cursor: "pointer" }}
              >
                <span className="macos-warning-icon">⚠️</span>
                <span>Unable to update calendars.</span>
              </div>
            )}
          </div>

          {/* ── Center Segmented View Selector (Day, Week, Month, Year) ── */}
          <div className="macos-segmented-views" role="tablist" aria-label="Calendar views">
            {["Day", "Week", "Month", "Year"].map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={currentView === v}
                className={`macos-view-btn ${currentView === v ? "active" : ""}`}
                onClick={() => handleViewChange(v)}
              >
                {v}
              </button>
            ))}
          </div>

          {/* ── Right Search Action ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="macos-circle-btn"
              title="Search events"
              aria-label="Search events"
              onClick={() => setSearchOpen((s) => !s)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Search Bar Input Dropdown ──────────────────────── */}
        {searchOpen && (
          <div
            style={{
              padding: "8px 16px",
              background: "rgba(0, 0, 0, 0.4)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              type="text"
              className="input"
              placeholder="Search events, holidays, birthdays..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: 32, fontSize: 13 }}
              autoFocus
            />
            {searchQuery && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSearchQuery("")}
                style={{ height: 32 }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* ── Subheader Navigation (Month & Nav Controls) ───── */}
        <div className="macos-calendar-nav">
          <div className="macos-month-title">
            <span className="macos-month-bold">{monthName}</span>
            <span>{yearNum}</span>
          </div>

          <div className="macos-nav-controls">
            <button
              className="macos-nav-btn"
              onClick={handlePrev}
              title="Previous"
              aria-label="Previous month"
            >
              ‹
            </button>
            <button
              className="macos-nav-btn"
              onClick={handleToday}
              title="Go to Today"
              style={{ padding: "4px 12px" }}
            >
              Today
            </button>
            <button
              className="macos-nav-btn"
              onClick={handleNext}
              title="Next"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        {/* ── Body: FullCalendar Month/Week/Day or 12-Month Year View ── */}
        <div className="macos-calendar-body">
          {currentView === "Year" ? (
            <div className="macos-year-grid">
              {monthsOfYear.map((mName, mIdx) => {
                const isCurrentMonth = mIdx === 9; // October 2026
                return (
                  <div
                    key={mName}
                    className="macos-mini-month"
                    onClick={() => {
                      const newD = new Date(2026, mIdx, 1);
                      calendarRef.current?.getApi().gotoDate(newD);
                      handleViewChange("Month");
                    }}
                  >
                    <div className="macos-mini-title" style={{ color: isCurrentMonth ? "#ff3b30" : "inherit" }}>
                      {mName}
                    </div>
                    <div className="macos-mini-grid">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <div key={i} style={{ color: "#666" }}>{d}</div>
                      ))}
                      {Array.from({ length: 31 }).map((_, dIdx) => {
                        const dayNum = dIdx + 1;
                        const isToday = isCurrentMonth && dayNum === 27;
                        return (
                          <div
                            key={dIdx}
                            className={`macos-mini-day ${isToday ? "is-today" : ""}`}
                          >
                            {dayNum}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              initialDate="2026-10-27"
              headerToolbar={false}
              events={filteredEvents}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              dayCellContent={renderDayCell}
              eventContent={renderEventContent}
              datesSet={(dateInfo) => {
                updateTitle(dateInfo.view.currentStart);
              }}
              height="auto"
              dayMaxEvents={3}
            />
          )}
        </div>
      </div>

      {/* ── macOS Event Creation Dialog Popover ────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <div className="macos-dialog-overlay" onClick={() => setModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
              className="macos-dialog"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 id="modal-title" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                  New Calendar Event
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--muted)",
                    fontSize: 20,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleCreateEvent} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="profile-form-label" style={{ display: "block", marginBottom: 4 }}>
                    Event Title
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. History Seminar or Birthday"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="profile-form-label" style={{ display: "block", marginBottom: 4 }}>
                      Date
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="profile-form-label" style={{ display: "block", marginBottom: 4 }}>
                      Category
                    </label>
                    <select
                      className="select"
                      value={newEventKind}
                      onChange={(e) => setNewEventKind(e.target.value)}
                    >
                      <option value="task">Task / Assignment</option>
                      <option value="birthday">Celebration / Birthday</option>
                      <option value="holiday">Holiday</option>
                      <option value="class">Academic Class</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Add Event
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Event Inspector Dialog Popover ─────────────────── */}
      <AnimatePresence>
        {selectedEvent && (
          <div className="macos-dialog-overlay" onClick={() => setSelectedEvent(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.85 }}
              className="macos-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, textWrap: "balance" }}>
                  {selectedEvent.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  style={{ border: "none", background: "transparent", color: "var(--muted)", fontSize: 20, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                <div>📅 <strong>Date:</strong> {selectedEvent.startStr || selectedEvent.date}</div>
                <div>🏷️ <strong>Kind:</strong> {selectedEvent.extendedProps?.kind || "Event"}</div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                {selectedEvent.extendedProps?.rawId && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      try {
                        await api.delete(`/tasks/${selectedEvent.extendedProps.rawId}`);
                        loadEvents();
                      } catch {}
                      setSelectedEvent(null);
                    }}
                  >
                    Delete task
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedEvent(null)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
