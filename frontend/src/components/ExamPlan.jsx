import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

const DAY = 24 * 60 * 60 * 1000;

function dayCount(examAt, now = new Date()) {
  if (!examAt) return null;
  const exam = new Date(examAt);
  if (Number.isNaN(exam.getTime())) return null;
  const examDay = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = Math.round((examDay - today) / DAY);
  return delta < 0 ? 0 : delta + 1;
}

export function buildSemesterPlan(subjects, dailyStudyMins, now = new Date()) {
  const daily = Math.max(15, Number(dailyStudyMins) || 120);
  const dailyPlanMins = Math.max(1, Math.floor(daily * 0.8));
  const rows = (subjects || []).map((subject) => ({
    subject,
    days: dayCount(subject.examAt, now),
    totalMins: (subject.topics || []).filter((topic) => !topic.completed)
      .reduce((sum, topic) => sum + (Number(topic.estimateMins) || 45), 0),
    sessions: [],
    missed: [],
  }));
  const items = [];
  for (const row of rows) {
    for (const topic of row.subject.topics || []) {
      if (topic.completed) continue;
      items.push({ row, topic, estimate: Number(topic.estimateMins) || 45 });
    }
  }
  items.sort((a, b) => (a.row.days ?? Number.MAX_SAFE_INTEGER) - (b.row.days ?? Number.MAX_SAFE_INTEGER)
    || (Number(b.topic.importance) || 3) - (Number(a.topic.importance) || 3)
    || (Number(a.topic.confidence) || 3) - (Number(b.topic.confidence) || 3)
    || a.topic.title.localeCompare(b.topic.title));

  const maxDays = Math.max(0, ...rows.map((row) => row.days || 0));
  const dayUsed = Array(maxDays).fill(0);
  const days = Array.from({ length: maxDays }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  });
  let scheduledMins = 0;
  let undatedMins = 0;
  let passedExamMins = 0;

  for (const item of items) {
    const { row, topic, estimate } = item;
    if (row.days == null) {
      row.missed.push(topic);
      undatedMins += estimate;
      continue;
    }
    if (row.days === 0) {
      row.missed.push(topic);
      passedExamMins += estimate;
      continue;
    }
    let left = estimate;
    let part = 1;
    for (let index = 0; index < row.days && left > 0; index += 1) {
      const available = dailyPlanMins - dayUsed[index];
      if (available <= 0) continue;
      const minutes = Math.min(left, available);
      row.sessions.push({
        day: days[index],
        title: left > minutes ? `${topic.title} · part ${part}` : topic.title,
        minutes,
        topicId: topic._id,
      });
      dayUsed[index] += minutes;
      scheduledMins += minutes;
      left -= minutes;
      part += 1;
    }
    if (left > 0) row.missed.push(topic);
  }

  return {
    rows,
    days,
    dailyPlanMins,
    totalMins: items.reduce((sum, item) => sum + item.estimate, 0),
    scheduledMins,
    undatedMins,
    passedExamMins,
    missedCount: rows.reduce((sum, row) => sum + row.missed.length, 0),
    undatedCount: rows.filter((row) => row.days == null).reduce((sum, row) => sum + row.missed.length, 0),
    passedExamCount: rows.filter((row) => row.days === 0).reduce((sum, row) => sum + row.missed.length, 0),
  };
}

function hours(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function newTopic(title) {
  return { title, estimateMins: 45, importance: 3, confidence: 3, completed: false };
}

export default function ExamPlan() {
  const [subjects, setSubjects] = useState([]);
  const [dailyStudyMins, setDailyStudyMins] = useState(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    Promise.all([api.get("/subjects"), api.get("/profile")]).then(([result, profile]) => {
      setSubjects(result.subjects || []);
      setDailyStudyMins(profile.education?.dailyStudyMins || 120);
    }).catch(() => setError("Your exam details could not be loaded. Try again in a moment."))
      .finally(() => setLoading(false));
  }, []);

  const semesterPlan = useMemo(() => buildSemesterPlan(subjects, dailyStudyMins), [subjects, dailyStudyMins]);

  function updateTopic(subjectId, topicIndex, field, value) {
    setSubjects((current) => current.map((subject) => subject._id !== subjectId ? subject : {
      ...subject,
      topics: subject.topics.map((topic, index) => index === topicIndex ? { ...topic, [field]: value } : topic),
    }));
  }

  async function saveSubject(subject) {
    setSaving(subject._id);
    setError("");
    setNotice("");
    try {
      const { subject: saved } = await api.put(`/subjects/${subject._id}`, {
        examAt: subject.examAt || null,
        topics: subject.topics,
      });
      setSubjects((current) => current.map((item) => item._id === saved._id ? saved : item));
      setNotice(`${subject.name} plan updated.`);
    } catch (err) {
      setError(err.response?.data?.error || `${subject.name} could not be saved.`);
    } finally {
      setSaving("");
    }
  }

  function addTopic(subjectId) {
    const title = String(drafts[subjectId] || "").trim();
    if (!title) return;
    setSubjects((current) => current.map((subject) => subject._id === subjectId
      ? { ...subject, topics: [...(subject.topics || []), newTopic(title)] }
      : subject));
    setDrafts((current) => ({ ...current, [subjectId]: "" }));
  }

  if (loading) return <p className="exam-page" role="status" aria-busy="true">Loading your exam plan…</p>;

  return (
    <section className="exam-page" aria-labelledby="exam-plan-title">
      <header className="exam-page-header">
        <p className="exam-eyebrow">A realistic plan, one topic at a time</p>
        <h1 id="exam-plan-title">Exams and study plan</h1>
        <p>Doorway uses your exam dates, topic estimates, priorities, and available time to help you decide what still fits. The estimate is a guide, not a promise.</p>
        <p className="exam-study-time">Using about <strong>{hours(dailyStudyMins)}</strong> of study time per day, with a buffer left for review and breaks. <Link to="/academic-setup">Edit semester details</Link></p>
      </header>

      {subjects.length > 0 && semesterPlan.totalMins > 0 && (
        <aside className={`exam-truth${semesterPlan.missedCount ? " is-tight" : " is-feasible"}`} aria-live="polite">
          {semesterPlan.missedCount ? (
            <>
              {semesterPlan.undatedCount > 0 && `${semesterPlan.undatedCount} topic${semesterPlan.undatedCount === 1 ? " has" : "s have"} no exam date yet. `}
              {semesterPlan.passedExamCount > 0 && `${semesterPlan.passedExamCount} topic${semesterPlan.passedExamCount === 1 ? " belongs" : "s belong"} to exams whose dates have passed. `}
              {semesterPlan.missedCount > semesterPlan.undatedCount + semesterPlan.passedExamCount && "Based on your estimates, all saved topics may not fit before your exams. "}
              There is still time to make meaningful progress. Doorway puts upcoming exams first, then favors topics you marked important or less familiar.
            </>
          ) : `Your saved topics with exam dates appear to fit within about ${hours(semesterPlan.scheduledMins)} of planned study time. There is time for these topics, with some of your day left open for review, breaks, and changes.`}
        </aside>
      )}

      {error && <p className="exam-error" role="alert">{error}</p>}
      {notice && <p className="exam-notice" role="status">{notice}</p>}
      {!subjects.length && (
        <article className="exam-card">
          <h2>Add your subjects to begin</h2>
          <p>Enter an exam date and the topics you still want to study. Doorway can then estimate what fits your available time.</p>
          <Link className="btn btn-primary" to="/academic-setup">Set up semester</Link>
        </article>
      )}

      <div className="exam-subject-list">
        {semesterPlan.rows.map(({ subject, days, totalMins, sessions, missed }) => {
          const examDate = subject.examAt ? new Date(subject.examAt) : null;
          return (
            <article className="exam-card" key={subject._id}>
              <div className="exam-card-heading">
                <div>
                  <h2>{subject.name}</h2>
                  <p>{examDate && !Number.isNaN(examDate.getTime()) ? `Exam ${examDate.toLocaleDateString()}` : "Add an exam date to make a day-by-day plan."}</p>
                </div>
                <label className="exam-date-field">Exam date
                  <input className="input" type="date" value={examDate && !Number.isNaN(examDate.getTime()) ? `${examDate.getFullYear()}-${String(examDate.getMonth() + 1).padStart(2, '0')}-${String(examDate.getDate()).padStart(2, '0')}` : ""} onChange={(event) => setSubjects((current) => current.map((item) => item._id === subject._id ? { ...item, examAt: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null } : item))} />
                </label>
              </div>

              {days === 0 ? (
                <p className="exam-truth">That exam date has passed. Update the date to plan for another assessment.</p>
              ) : !subject.topics?.length ? (
                <p className="exam-truth">Add the remaining topics below. Doorway won’t guess how much of your syllabus is left.</p>
              ) : !subject.examAt ? (
                <p className="exam-truth">Set the exam date to see how your remaining topics fit into the time available.</p>
              ) : (
                <>
                  <p className="exam-workload">{days} {days === 1 ? "day" : "days"} left · {hours(totalMins)} estimated remaining · {hours(sessions.reduce((sum, session) => sum + session.minutes, 0))} scheduled before this exam · {missed.length} topic{missed.length === 1 ? "" : "s"} not scheduled</p>
                  {sessions.length > 0 && (
                    <ol className="exam-session-list">
                      {sessions.map((session, index) => (
                        <li key={`${session.topicId || session.title}-${index}`}>
                          <span><strong>{session.day}</strong> · {session.title}</span><span>{hours(session.minutes)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {missed.length > 0 && (
                    <p className="exam-missed">Not scheduled this time: {missed.map((topic) => topic.title).join(", ")}. You can change priorities or your available time.</p>
                  )}
                </>
              )}

              <div className="exam-topic-editor">
                <h3>Topics and progress</h3>
                {subject.topics?.length ? (
                  <ul className="exam-topic-list">
                    {subject.topics.map((topic, index) => (
                      <li key={topic._id || `${topic.title}-${index}`}>
                        <label className="exam-topic-title"><input type="checkbox" checked={!!topic.completed} onChange={(event) => updateTopic(subject._id, index, "completed", event.target.checked)} /> <span>{topic.title}</span></label>
                        <label>Minutes<input className="input exam-small-input" type="number" min="5" max="240" step="5" value={topic.estimateMins || 45} onChange={(event) => updateTopic(subject._id, index, "estimateMins", Number(event.target.value))} /></label>
                        <label>Importance<select className="input exam-small-input" value={topic.importance || 3} onChange={(event) => updateTopic(subject._id, index, "importance", Number(event.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                        <label>Confidence<select className="input exam-small-input" value={topic.confidence || 3} onChange={(event) => updateTopic(subject._id, index, "confidence", Number(event.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted">No topics saved yet.</p>}
                <form className="exam-add-topic" onSubmit={(event) => { event.preventDefault(); addTopic(subject._id); }}>
                  <label className="sr-only" htmlFor={`new-topic-${subject._id}`}>New topic for {subject.name}</label>
                  <input id={`new-topic-${subject._id}`} className="input" value={drafts[subject._id] || ""} maxLength={200} onChange={(event) => setDrafts((current) => ({ ...current, [subject._id]: event.target.value }))} placeholder="Add a topic" />
                  <button className="btn btn-ghost" type="submit" disabled={!(drafts[subject._id] || "").trim()}>Add topic</button>
                </form>
                <button className="btn btn-primary" type="button" disabled={saving === subject._id} onClick={() => saveSubject(subject)}>{saving === subject._id ? "Saving…" : "Save topics and exam date"}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
