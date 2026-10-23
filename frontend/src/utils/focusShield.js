// Shared data + pure helpers for the Focus Shield (website blocking / whitelisting) feature.
// Kept framework-free so it can be reused by the dashboard card, the Focus Timer session
// panel, and the dedicated management page without duplicating logic.

export const CATEGORIES = [
  "Social Media",
  "Entertainment",
  "Gaming",
  "Shopping",
  "Streaming",
  "News",
  "Custom",
];

// The exact "popular suggestions" set — each maps to one or more matching domains so a
// user's existing custom entry (e.g. "twitter.com") still gets recognized as the same site.
export const POPULAR_SITES = [
  { id: "youtube", label: "YouTube", domain: "youtube.com", category: "Entertainment", emoji: "▶️" },
  { id: "reddit", label: "Reddit", domain: "reddit.com", category: "Social Media", emoji: "👽" },
  { id: "instagram", label: "Instagram", domain: "instagram.com", category: "Social Media", emoji: "📸" },
  { id: "facebook", label: "Facebook", domain: "facebook.com", category: "Social Media", emoji: "📘" },
  { id: "twitter", label: "Twitter / X", domain: "x.com", altDomains: ["twitter.com"], category: "Social Media", emoji: "🐦" },
  { id: "discord", label: "Discord", domain: "discord.com", category: "Gaming", emoji: "🎮" },
  { id: "netflix", label: "Netflix", domain: "netflix.com", category: "Streaming", emoji: "🎬" },
  { id: "primevideo", label: "Prime Video", domain: "primevideo.com", category: "Streaming", emoji: "📺" },
  { id: "twitch", label: "Twitch", domain: "twitch.tv", category: "Gaming", emoji: "🕹️" },
];

export const PRESETS = [
  {
    id: "student",
    label: "Student",
    emoji: "🎓",
    description: "Block the usual social & video distractions during study time.",
    domains: ["instagram.com", "tiktok.com", "youtube.com", "reddit.com", "twitch.tv"],
  },
  {
    id: "developer",
    label: "Developer",
    emoji: "💻",
    description: "Block feeds and video, keep docs & Stack Overflow reachable.",
    domains: ["reddit.com", "x.com", "youtube.com", "instagram.com", "facebook.com"],
  },
  {
    id: "remote-worker",
    label: "Remote Worker",
    emoji: "🏠",
    description: "Block social media, news and shopping during work hours.",
    domains: ["facebook.com", "instagram.com", "x.com", "reddit.com", "amazon.com", "cnn.com"],
  },
  {
    id: "deep-work",
    label: "Deep Work",
    emoji: "🧠",
    description: "Block everything that isn't essential — maximum focus.",
    domains: [
      "youtube.com", "reddit.com", "instagram.com", "facebook.com", "x.com",
      "discord.com", "netflix.com", "twitch.tv", "tiktok.com",
    ],
  },
  {
    id: "exam-mode",
    label: "Exam Mode",
    emoji: "📝",
    description: "The most aggressive preset — blocks every common distraction.",
    domains: [
      "youtube.com", "instagram.com", "tiktok.com", "facebook.com", "x.com",
      "reddit.com", "discord.com", "twitch.tv", "netflix.com", "primevideo.com",
    ],
  },
];

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

// Strips protocol/path/query and a leading "www." so "https://www.reddit.com/r/x" -> "reddit.com"
export function normalizeDomain(input) {
  if (!input) return "";
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "");
  d = d.split("/")[0].split("?")[0].split("#")[0];
  d = d.replace(/^www\./, "");
  return d;
}

export function isValidDomain(input) {
  const d = normalizeDomain(input);
  return DOMAIN_RE.test(d);
}

export function categoryForDomain(domain) {
  const d = normalizeDomain(domain);
  const site = POPULAR_SITES.find(
    (s) => s.domain === d || (s.altDomains || []).includes(d)
  );
  return site?.category || "Custom";
}

// True while "now" falls inside the recurring blocking window.
export function isScheduleActiveNow(schedule) {
  if (!schedule?.enabled) return false;
  const now = new Date();
  const day = now.getDay();
  if (!Array.isArray(schedule.days) || !schedule.days.includes(day)) return false;
  const [sh, sm] = (schedule.startTime || "09:00").split(":").map(Number);
  const [eh, em] = (schedule.endTime || "17:00").split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
}

export function isPaused(rules) {
  return !!(rules?.pausedUntil && new Date(rules.pausedUntil).getTime() > Date.now());
}

export const PAUSE_PRESETS = [
  { id: "15m", label: "15 minutes", minutes: 15 },
  { id: "30m", label: "30 minutes", minutes: 30 },
  { id: "1h", label: "1 hour", minutes: 60 },
  { id: "tomorrow", label: "Until tomorrow" },
];

export function computePauseUntil(presetId, customMinutes) {
  if (presetId === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  }
  const preset = PAUSE_PRESETS.find((p) => p.id === presetId);
  const minutes = preset?.minutes ?? customMinutes ?? 15;
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function formatClockTime(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// The single source of truth for "what is the shield actually doing right now" — reused by
// the dashboard card, the Focus Timer session panel and the Focus Shield page header so the
// status never disagrees between screens.
export function getShieldStatus(rules, sessionActive = false) {
  if (!rules?.isEnabled) {
    return {
      level: "off",
      label: "Off",
      description: "Turn on Focus Shield to start guarding your focus.",
    };
  }
  if (isPaused(rules)) {
    return {
      level: "paused",
      label: "Paused",
      description: `Resumes at ${formatClockTime(rules.pausedUntil)}`,
    };
  }
  if (sessionActive) {
    return {
      level: "active",
      label: "Blocking now",
      description: "Focus session in progress",
    };
  }
  if (isScheduleActiveNow(rules.schedule)) {
    return {
      level: "active",
      label: "Blocking now",
      description: "Scheduled block window is active",
    };
  }
  return {
    level: "armed",
    label: "Armed",
    description: "Will block during your next focus session",
  };
}

// Adds domains to an existing entry list without creating duplicates.
export function mergeDomains(existing, domainsOrEntries) {
  const have = new Set(existing.map((e) => e.value));
  const additions = domainsOrEntries
    .map((d) => (typeof d === "string" ? { value: normalizeDomain(d), label: "" } : d))
    .filter((e) => e.value && !have.has(e.value));
  additions.forEach((e) => have.add(e.value));
  return [...existing, ...additions.map((e) => ({ enabled: true, ...e }))];
}
