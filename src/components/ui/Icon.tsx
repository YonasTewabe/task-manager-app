import { memo } from "react";

const ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 19a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M14 16l5-4-5-4" />
      <path d="M19 12H9" />
    </>
  ),
  dashboard: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="5" rx="1.5" />
      <rect x="13" y="11" width="7" height="9" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  projects: (
    <>
      <path d="M3.5 7.5h7" />
      <path d="M3.5 12h17" />
      <path d="M3.5 16.5h11" />
    </>
  ),
  workspace: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2.2" />
      <path d="M3.5 10h17" />
      <path d="M10 4v16" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="2.8" />
      <circle cx="16.5" cy="9.5" r="2.3" />
      <path d="M3.8 19a5.2 5.2 0 0 1 10.4 0" />
      <path d="M14.2 19a4.2 4.2 0 0 1 6 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M19.5 12a7.5 7.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.5 1a8 8 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a8 8 0 0 0-2 1.2l-2.5-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.4l-2 1.6 2 3.4 2.5-1a8 8 0 0 0 2 1.2l.4 2.6h4l.4-2.6a8 8 0 0 0 2-1.2l2.5 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
    </>
  ),
};

function Icon({
  name,
  className = "",
  size = 18,
  strokeWidth = 1.8,
  ariaHidden = true,
}) {
  if (name === "bell") {
    return (
      <span
        aria-hidden={ariaHidden}
        className={`inline-block leading-none ${className}`.trim()}
        style={{ fontSize: `${size}px` }}
      >
        🔔
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className={className}
    >
      {ICONS[name] || null}
    </svg>
  );
}

export default memo(Icon);
