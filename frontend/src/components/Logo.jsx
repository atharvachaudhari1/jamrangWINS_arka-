function DoorIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6" y="3" width="20" height="26" rx="10" stroke="currentColor" strokeWidth="2.4" />
      <path d="M16 3v26" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="19.5" cy="17" r="1.3" fill="currentColor" />
    </svg>
  );
}

export default function Logo({ variant = "icon", size = 32, className = "", style = {} }) {
  if (variant === "full") {
    return (
      <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--text)", ...style }} role="img" aria-label="Doorway">
        <DoorIcon size={size} />
        <span style={{ fontWeight: 700, fontSize: size * 0.48, letterSpacing: "-0.03em" }}>Doorway</span>
      </span>
    );
  }
  return (
    <span className={className} style={{ color: "var(--indigo-light)", display: "inline-flex", ...style }} role="img" aria-label="Doorway">
      <DoorIcon size={size} />
    </span>
  );
}
