import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

const blankSubject = () => ({ name: "", examAt: "", topicsText: "" });

function dateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function topicRows(text, savedTopics = []) {
  return text.split(/\r?\n/).map((title) => title.trim()).filter(Boolean).map((title) => {
    const saved = savedTopics.find((topic) => topic.title.toLowerCase() === title.toLowerCase());
    return saved
      ? { ...saved, title: title.slice(0, 200) }
      : { title: title.slice(0, 200), estimateMins: 45, importance: 3, confidence: 3, completed: false };
  });
}

function subjectNameFromFile(fileName) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Imported subject";
}

function topicLines(text) {
  return [...new Set(text.split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[•*▪–-]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 1 && !/^\d+$/.test(line))
    .map((line) => line.slice(0, 200)))].slice(0, 100);
}

async function createOcrWorker(onProgress) {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/tesseract-core-lstm.wasm.js",
    workerBlobURL: false,
    logger: (message) => {
      if (message.status) onProgress?.(`OCR: ${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ""}`);
    },
  });
}

async function readSyllabusFile(file, onProgress) {
  if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB.`);
  if (/\.(txt|md)$/i.test(file.name)) return file.text();
  if (/\.docx$/i.test(file.name)) {
    onProgress?.("Reading Word document…");
    const mammoth = await import("mammoth/mammoth.browser");
    const text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    if (!text.trim()) throw new Error("No readable text was found in this Word file.");
    return text;
  }
  if (/\.(png|jpe?g|webp|bmp)$/i.test(file.name)) {
    onProgress?.("Reading image with English OCR…");
    const image = await createImageBitmap(file);
    let worker;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    try {
      worker = await createOcrWorker(onProgress);
      const text = (await worker.recognize(canvas)).data.text;
      if (!text.trim()) throw new Error("OCR could not read this image. Try a clearer scan or enter the details manually.");
      return text;
    }
    finally {
      image.close();
      canvas.width = 0;
      canvas.height = 0;
      if (worker) await worker.terminate();
    }
  }
  if (!/\.pdf$/i.test(file.name)) throw new Error(`${file.name}: choose a PDF, DOCX, TXT, Markdown, or image file.`);

  const [{ getDocument, GlobalWorkerOptions }, { default: pdfWorkerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 100) throw new Error(`${file.name} has more than 100 pages.`);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(`Reading PDF page ${pageNumber} of ${pdf.numPages}…`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = [];
    let currentLine = "";
    let previousY = null;
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = item.transform?.[5];
      if (previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 3 && currentLine.trim()) {
        lines.push(currentLine);
        currentLine = "";
      }
      currentLine += `${item.str}${item.hasEOL ? "\n" : " "}`;
      if (item.hasEOL) {
        lines.push(currentLine);
        currentLine = "";
      }
      if (Number.isFinite(y)) previousY = y;
    }
    if (currentLine.trim()) lines.push(currentLine);
    pages.push({ pageNumber, text: lines.splice(0).join("\n").trim() });
  }
  const needsOcr = pages.filter((page) => page.text.length < 80);
  if (needsOcr.length) {
    onProgress?.(`Scanned pages found; starting English OCR on ${needsOcr.length} page${needsOcr.length === 1 ? "" : "s"}…`);
    const worker = await createOcrWorker(onProgress);
    try {
      for (const row of needsOcr) {
        onProgress?.(`OCR on PDF page ${row.pageNumber} of ${pdf.numPages}…`);
        const page = await pdf.getPage(row.pageNumber);
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        row.text = (await worker.recognize(canvas)).data.text.trim();
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally { await worker.terminate(); }
  }
  const extracted = pages.map((page) => page.text).join("\n").trim();
  if (!extracted) throw new Error("No readable text was found, even after OCR. Try a clearer scan or enter the exam details manually.");
  return extracted;
}

export default function AcademicSetup({ onComplete }) {
  const navigate = useNavigate();
  const [education, setEducation] = useState({ department: "", program: "", year: "", semester: "", dailyStudyMins: 120 });
  const [subjects, setSubjects] = useState([blankSubject()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [timetableRows, setTimetableRows] = useState([]);
  const [timetableNotice, setTimetableNotice] = useState("");
  const [timetableError, setTimetableError] = useState("");
  const [importProgress, setImportProgress] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get("/profile"), api.get("/subjects")]).then(([profile, result]) => {
      if (cancelled) return;
      setEducation({
        department: profile.education?.department || profile.education?.program || "",
        program: profile.education?.program || "",
        year: profile.education?.year || "",
        semester: profile.education?.semester || "",
        dailyStudyMins: profile.education?.dailyStudyMins || 120,
      });
      if (result.subjects?.length) {
        setSubjects(result.subjects.map((subject) => ({
          id: subject._id,
          name: subject.name,
          examAt: dateInput(subject.examAt),
          topicsText: (subject.topics || []).map((topic) => topic.title).join("\n"),
          topics: subject.topics || [],
        })));
      }
    }).catch(() => {
      if (!cancelled) setError("Your saved details could not be loaded. You can still enter them below.");
    });
    return () => { cancelled = true; };
  }, []);

  function updateEducation(field, value) {
    setEducation((current) => ({ ...current, [field]: value }));
  }

  function updateSubject(index, field, value) {
    setSubjects((current) => current.map((subject, i) => i === index ? { ...subject, [field]: value } : subject));
  }

  async function importSyllabusFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setImporting(true);
    setImportNotice("");
    setImportProgress("");
    setError("");
    try {
      const imported = [];
      const localFallback = [];
      const emptyAnalysis = [];
      const truncated = [];
      const providers = new Set();
      const providerWarnings = new Set();
      for (const file of files) {
        const text = await readSyllabusFile(file, setImportProgress);
        if (!text.trim()) continue;
        if (text.length > 50000) truncated.push(file.name);
        let analyzed;
        try {
          analyzed = await api.post("/subjects/analyze-syllabus", {
            fileName: file.name,
            text: text.slice(0, 50000),
          });
        } catch {
          localFallback.push(file.name);
          analyzed = { subjects: [{ name: subjectNameFromFile(file.name), topics: topicLines(text) }] };
        }
        (analyzed.providers || []).forEach((provider) => providers.add(provider));
        if (analyzed.warning) providerWarnings.add(analyzed.warning);
        const subjectsFromFile = Array.isArray(analyzed.subjects) ? analyzed.subjects : [];
        if (!subjectsFromFile.length) {
          emptyAnalysis.push(file.name);
          imported.push({ name: subjectNameFromFile(file.name), topics: topicLines(text) });
        } else {
          imported.push(...subjectsFromFile.map((subject) => ({
            name: String(subject.name || subjectNameFromFile(file.name)).trim(),
            topics: topicLines(Array.isArray(subject.topics) ? subject.topics.join("\n") : ""),
          })));
        }
      }
      const usable = imported.filter((item) => item.name && item.topics.length);
      if (!usable.length) throw new Error("No readable topic lines were found. Review the scan or try a clearer PDF, DOCX, TXT, Markdown, or image file.");
      setSubjects((current) => {
        const next = [...current];
        for (const item of usable) {
          const existingIndex = next.findIndex((subject) => subject.name.trim().toLowerCase() === item.name.toLowerCase());
          const existing = existingIndex >= 0 ? next[existingIndex] : blankSubject();
          const topics = topicLines([existing.topicsText || "", ...item.topics].join("\n"));
          const subject = { ...existing, name: existing.name || item.name, topicsText: topics.join("\n") };
          if (existingIndex >= 0) next[existingIndex] = subject;
          else if (next.length === 1 && !next[0].name && !next[0].topicsText) next[0] = subject;
          else next.push(subject);
        }
        return next;
      });
      const notes = [];
      if (providers.size) notes.push(`Analyzed with ${[...providers].join(" and ")}.`);
      if (providerWarnings.size) notes.push([...providerWarnings].join(" "));
      if (localFallback.length) notes.push(`AI analysis was unavailable for ${[...new Set(localFallback)].join(", ")}; local extraction was used.`);
      if (emptyAnalysis.length) notes.push(`AI analysis found no usable topics for ${[...new Set(emptyAnalysis)].join(", ")}; local extraction was used.`);
      if (truncated.length) notes.push(`Analysis used only the first 50,000 characters of ${truncated.join(", ")}.`);
      setImportNotice(`Found topics for ${usable.length} subject${usable.length === 1 ? "" : "s"}. ${notes.join(" ")} Review and edit the topics below before saving.`);
    } catch (err) {
      setError(err.message || "The syllabus file could not be read.");
    } finally {
      setImporting(false);
    }
  }

  async function importTimetable(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!education.department.trim() || !education.year.trim() || !education.semester.trim()) {
      setTimetableError("Enter your department, year, and semester above before importing a timetable.");
      return;
    }
    setImporting(true);
    setTimetableError("");
    setTimetableNotice("");
    setTimetableRows([]);
    setImportProgress("");
    try {
      const text = await readSyllabusFile(file, setImportProgress);
      const result = await api.post("/subjects/analyze-timetable", {
        fileName: file.name,
        text: text.slice(0, 50000),
        student: { department: education.department, program: education.program, year: education.year, semester: education.semester },
      });
      const rows = Array.isArray(result.exams) ? result.exams : [];
      if (!rows.length) throw new Error("No exam rows matching your department, year, and semester were found. Check your details or enter dates manually.");
      setTimetableRows(rows.map((row) => ({ ...row, use: true })));
      setTimetableNotice(`Found ${rows.length} matching exam row${rows.length === 1 ? "" : "s"}${result.providers?.length ? ` using ${result.providers.join(" and ")}` : ""}.${text.length > 50000 ? " Only the first 50,000 characters were analyzed." : ""}${result.warning ? ` ${result.warning}` : ""} Review the rows, then add their dates to your subjects.`);
    } catch (err) {
      setTimetableError(err.response?.data?.error || err.message || "The timetable could not be analyzed.");
    } finally {
      setImporting(false);
    }
  }

  function applyTimetableRows() {
    const rows = timetableRows.filter((row) => row.use && row.subject.trim() && row.date);
    if (!rows.length) return;
    setSubjects((current) => {
      const next = [...current];
      for (const row of rows) {
        const match = next.findIndex((subject) => subject.name.trim().toLocaleLowerCase() === row.subject.trim().toLocaleLowerCase());
        const examAt = new Date(`${row.date}T12:00:00`).toISOString();
        if (match >= 0) next[match] = { ...next[match], examAt };
        else next.push({ ...blankSubject(), name: row.subject.trim(), examAt });
      }
      return next;
    });
    setTimetableNotice(`Added ${rows.length} exam date${rows.length === 1 ? "" : "s"} to your subjects. Save semester details below to keep them.`);
    setTimetableRows([]);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      for (const subject of subjects.filter((item) => item.name.trim())) {
        const body = {
          name: subject.name.trim(),
          examAt: subject.examAt ? new Date(`${subject.examAt}T12:00:00`).toISOString() : null,
          topics: topicRows(subject.topicsText, subject.topics),
        };
        if (subject.id) await api.put(`/subjects/${subject.id}`, body);
        else await api.post("/subjects", body);
      }
      const saved = await api.put("/profile", { education: { ...education, dailyStudyMins: Number(education.dailyStudyMins), setupComplete: true } });
      onComplete(saved.education);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Your setup could not be saved. Your entries are still here; please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError("");
    try {
      const saved = await api.put("/profile", { education: { setupComplete: true } });
      onComplete(saved.education);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Setup could not be skipped right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="exam-page" aria-labelledby="academic-setup-title">
      <header className="exam-page-header">
        <p className="exam-eyebrow">A little context, a better plan</p>
        <h1 id="academic-setup-title">Set up your semester</h1>
        <p>Doorway uses this to keep track of your subjects and make exam plans that fit the time you actually have. You can change it later.</p>
      </header>

      <form className="exam-card" onSubmit={save}>
        <h2>Your education</h2>
        <div className="exam-form-grid">
          <label>Department
            <input className="input" value={education.department} maxLength={120} onChange={(event) => updateEducation("department", event.target.value)} placeholder="e.g. Computer Science" required />
          </label>
          <label>Course or program
            <input className="input" value={education.program} maxLength={120} onChange={(event) => updateEducation("program", event.target.value)} placeholder="e.g. BSc Computer Science" required />
          </label>
          <label>Year
            <input className="input" value={education.year} maxLength={40} onChange={(event) => updateEducation("year", event.target.value)} placeholder="e.g. Year 2" required />
          </label>
          <label>Semester
            <input className="input" value={education.semester} maxLength={40} onChange={(event) => updateEducation("semester", event.target.value)} placeholder="e.g. Semester 4" required />
          </label>
          <label>Study time you can usually manage each day (minutes)
            <input className="input" type="number" min="15" max="720" step="15" value={education.dailyStudyMins} onChange={(event) => updateEducation("dailyStudyMins", event.target.value)} required />
          </label>
        </div>

        <section className="exam-import" aria-labelledby="exam-import-title">
          <div>
            <h2 id="exam-import-title">Import your syllabus</h2>
            <p>Upload a semester syllabus or portion. Gemini and Grok can group subjects and topics; review and edit the results before saving.</p>
          </div>
          <label className="exam-import-control">{importing ? "Reading files…" : "Choose syllabus files"}
            <input className="input" type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg,image/webp,image/bmp" multiple disabled={importing || busy} onChange={importSyllabusFiles} />
          </label>
          {importing && <p role="status" aria-busy="true">{importProgress || "Preparing document…"}</p>}
          <p className="exam-privacy-note">PDF (including scanned pages), DOCX, TXT, Markdown, and images · up to 15 MB and 100 PDF pages per file. OCR runs locally in English. Extracted text is sent to Doorway’s backend and shared with each configured analysis provider (Gemini and/or Grok). Otherwise, a local filename-and-lines import is used.</p>
          {importNotice && <p className="exam-notice" role="status">{importNotice}</p>}
        </section>

        <section className="exam-import" aria-labelledby="timetable-import-title">
          <div>
            <h2 id="timetable-import-title">Import your exam timetable</h2>
            <p>Doorway uses your department, year, and semester to extract matching exam rows from a combined timetable. Check the department and dates before adding them to your subjects.</p>
          </div>
          <label className="exam-import-control">{importing ? "Reading file…" : "Choose timetable file"}
            <input className="input" type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg,image/webp,image/bmp" disabled={importing || busy} onChange={importTimetable} />
          </label>
          {importing && <p role="status" aria-busy="true">{importProgress || "Preparing document…"} Finding rows for your department may take a minute for scanned files.</p>}
          <p className="exam-privacy-note">PDF (including scanned pages), DOCX, TXT, Markdown, and images · up to 15 MB and 100 PDF pages. OCR runs locally in English. Extracted text and your department, program, year, and semester are sent to Doorway’s backend and shared with each configured analysis provider (Gemini and/or Grok) to filter the timetable.</p>
          {timetableError && <p className="exam-error" role="alert">{timetableError}</p>}
          {timetableNotice && <p className="exam-notice" role="status">{timetableNotice}</p>}
          {timetableRows.length > 0 && <>
            <div className="exam-timetable-rows" aria-label="Review extracted exam rows">
              {timetableRows.map((row, index) => <fieldset className="exam-subject-editor" key={`${row.subject}-${row.date}-${index}`}>
                <legend>{row.department || "Matching department"}</legend>
                <div className="exam-form-grid">
                  <label className="exam-timetable-include"><input type="checkbox" checked={row.use} onChange={(event) => setTimetableRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, use: event.target.checked } : item))} /> Include this exam</label>
                  <label>Subject
                    <input className="input" value={row.subject} maxLength={120} onChange={(event) => setTimetableRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, subject: event.target.value } : item))} />
                  </label>
                  <label>Exam date
                    <input className="input" type="date" value={row.date} onChange={(event) => setTimetableRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, date: event.target.value } : item))} />
                  </label>
                  {row.time && <p>Time shown in timetable: {row.time}</p>}
                </div>
              </fieldset>)}
            </div>
            <button className="btn btn-secondary" type="button" onClick={applyTimetableRows}>Add selected exam dates</button>
          </>}
        </section>

        <div className="exam-section-heading">
          <div><h2>Subjects and upcoming exams</h2><p>Adding topics helps Doorway estimate what can fit. You can add them later too.</p></div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSubjects((current) => [...current, blankSubject()])}>Add subject</button>
        </div>
        <div className="exam-setup-subjects">
          {subjects.map((subject, index) => (
            <fieldset className="exam-subject-editor" key={subject.id || index}>
              <legend>Subject {index + 1}</legend>
              <div className="exam-form-grid">
                <label>Subject name
                  <input className="input" value={subject.name} maxLength={120} onChange={(event) => updateSubject(index, "name", event.target.value)} placeholder="e.g. Biology" />
                </label>
                <label>Exam date
                  <input className="input" type="date" value={subject.examAt} onChange={(event) => updateSubject(index, "examAt", event.target.value)} />
                </label>
              </div>
              <label>Paste or type topics or syllabus sections, one per line
                <textarea className="input exam-topics-input" value={subject.topicsText} onChange={(event) => updateSubject(index, "topicsText", event.target.value)} placeholder={'Cell biology\nGenetics\nEcology'} rows={3} />
              </label>
              {subjects.length > 1 && <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSubjects((current) => current.filter((_, i) => i !== index))}>Remove subject</button>}
            </fieldset>
          ))}
        </div>

        <p className="exam-privacy-note">Your academic details stay in your Doorway account. Topic time estimates start at 45 minutes and can be adjusted in your exam plan.</p>
        {error && <p className="exam-error" role="alert">{error}</p>}
        <div className="exam-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save semester details"}</button>
          <button className="btn btn-ghost" type="button" onClick={skip} disabled={busy}>Do this later</button>
        </div>
      </form>
    </section>
  );
}
