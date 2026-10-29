import api from "./api";

export const SAMPLE_VOICE_NOTES = [
  {
    id: "sample_vn_1",
    text: "Professor emphasized studying dynamic programming memoization vs tabulation for the midterm exam next Tuesday.",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    isPinned: true,
    tag: "study",
    convertedToTask: false,
  },
  {
    id: "sample_vn_2",
    text: "Complete literature review on spatial computing and submit presentation slides for UX design sprint.",
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    isPinned: false,
    tag: "work",
    convertedToTask: true,
  },
  {
    id: "sample_vn_3",
    text: "Idea for capstone: Apple-style fluid gesture navigation that dynamically adapts to user cognitive energy levels.",
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    isPinned: false,
    tag: "ideas",
    convertedToTask: false,
  },
  {
    id: "sample_vn_4",
    text: "Pick up fresh roast coffee beans and schedule routine dental checkup for Thursday afternoon.",
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    isPinned: false,
    tag: "personal",
    convertedToTask: false,
  },
];

export async function populateTestData() {
  // 1. Call backend API to seed tasks, focus sessions, timetable blocks, rhythm check-ins, and focus shield rules
  const res = await api.post("/account/seed-test-data");

  // 2. Populate Voice Notes in localStorage
  try {
    const existing = JSON.parse(localStorage.getItem("doorway_voice_notes") || "[]");
    const existingIds = new Set(existing.map((n) => n.id));
    const merged = [...SAMPLE_VOICE_NOTES.filter((n) => !existingIds.has(n.id)), ...existing];
    localStorage.setItem("doorway_voice_notes", JSON.stringify(merged));
  } catch {}

  // 3. Dispatch global events so components immediately refresh their state
  window.dispatchEvent(new Event("doorway-refresh"));
  window.dispatchEvent(new Event("doorway-prefs"));

  return res;
}
