import { BUY_ME_A_COFFEE_URL } from "../config/brand";

function CoffeeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M18 8h1a3 3 0 010 6h-1" />
      <path d="M3 8h15v6a4 4 0 01-4 4H7a4 4 0 01-4-4V8z" />
      <path d="M6 2v2M10 2v2M14 2v2" />
    </svg>
  );
}

export default function SupportLink({ className = "support-btn", onClick }) {
  if (!BUY_ME_A_COFFEE_URL) {
    return (
      <button type="button" className={className} disabled title="Set VITE_BUY_ME_A_COFFEE_URL to enable this link">
        <CoffeeIcon />
        Buy me a coffee
        <span className="support-config-note">Needs your link</span>
      </button>
    );
  }

  return (
    <a
      href={BUY_ME_A_COFFEE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
      aria-label="Buy me a coffee (opens in a new tab)"
    >
      <CoffeeIcon />
      Buy me a coffee
    </a>
  );
}
