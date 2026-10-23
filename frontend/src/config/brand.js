export const APP_NAME = "Doorway";
export const TAGLINE = "One small step at a time.";

// Replace these placeholders with your own details. Do not invent URLs.
export const OWNER = {
  name: "[YOUR NAME]",
  github: "[YOUR GITHUB URL]",
  linkedin: "[YOUR LINKEDIN URL]",
  portfolio: "[YOUR PORTFOLIO URL]",
  email: "[YOUR EMAIL]",
};

export function isPlaceholder(value) {
  return !value || String(value).includes("[YOUR ");
}

export const BUY_ME_A_COFFEE_URL = import.meta.env.VITE_BUY_ME_A_COFFEE_URL || (typeof __FUNDING_URL__ === "string" ? __FUNDING_URL__ : "");
