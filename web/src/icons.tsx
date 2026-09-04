import type { ReactNode } from "react";

// A small, consistent line-icon set (stroke = currentColor) that replaces emoji
// across the app for a professional, OS-independent look.
const P: Record<string, ReactNode> = {
  agency: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-5h6v5" />
      <path d="M9 9h2M13 9h2M9 12.5h2M13 12.5h2" />
    </>
  ),
  passport: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <circle cx="12" cy="10" r="3" />
      <path d="M9 16.5h6" />
    </>
  ),
  school: (
    <>
      <path d="M3 9l9-5 9 5-9 5-9-5Z" />
      <path d="M7 11v4c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4" />
      <path d="M21 9v4" />
    </>
  ),
  worker: (
    <>
      <path d="M5 12a7 7 0 0 1 14 0" />
      <path d="M3 12h18" />
      <path d="M12 5V3" />
      <path d="M8 17.5a5 5 0 0 0 8 0" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M10 21v-3h4v3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </>
  ),
  certificate: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="1.5" />
      <path d="M7 8h10M7 11h6" />
      <circle cx="9" cy="18.5" r="2" />
      <path d="M8 20l-1 2 2-1 2 1-1-2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13l2.5-7.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13" />
      <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    </>
  ),
  document: (
    <>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 15.5h6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="1.5" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M9 11h6M9 14.5h4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.5a3 3 0 0 1 0 5.5" />
      <path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6M12 20V8M16 20v-9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 15.5H3L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  box: (
    <>
      <path d="M4 8l8-4 8 4-8 4-8-4Z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8v6M15 11h6" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 5.3A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7 0 1-1 2.6-2.6 4M6.5 7C4.5 8.4 3 10.6 3 12c0 2 3 6 9 6 1 0 1.9-.1 2.7-.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3Z" />
      <path d="M14 8l3 3" />
    </>
  ),
  flow: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 6h4a3 3 0 0 1 3 3v0M7 18h4a3 3 0 0 0 3-3v0" />
      <path d="M16.5 12H14" />
    </>
  ),
  bank: (
    <>
      <path d="M3 9l9-5 9 5" />
      <path d="M4 9h16v2H4z" />
      <path d="M6 11v7M10 11v7M14 11v7M18 11v7" />
      <path d="M3 20h18" />
    </>
  ),
  gavel: (
    <>
      <path d="M13 5l6 6" />
      <path d="M9.5 8.5l6 6" />
      <path d="M8 7l4-4 5 5-4 4-5-5Z" />
      <path d="M11 12l-6 6 2 2 6-6" />
      <path d="M3 21h8" />
    </>
  ),
  registry: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 3v18" />
      <path d="M12 7h4M12 11h4M12 15h4" />
    </>
  ),
  aml: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" />
      <circle cx="11" cy="11" r="2.4" />
      <path d="M13 13l2.5 2.5" />
    </>
  ),
  review: (
    <>
      <path d="M4 5h16v10H9l-4 4V5Z" />
      <path d="M12 8.5l1 2 2 .2-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 10.7l2-.2 1-2Z" />
    </>
  ),
  wage: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v10" />
      <path d="M14.5 9.2c-.6-.8-1.6-1.2-2.7-1.2-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.6.9 2.6 2.1-1.1 2-2.6 2c-1.2 0-2.2-.5-2.8-1.3" />
    </>
  ),
  endorse: (
    <>
      <path d="M7 11v9H4v-9h3Z" />
      <path d="M7 12l3-7a2 2 0 0 1 2 2v3h5.5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 16.5 20H7" />
    </>
  ),
  procurement: (
    <>
      <path d="M4 7h16l-1.5 12.5a1 1 0 0 1-1 .9H6.5a1 1 0 0 1-1-.9L4 7Z" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
      <path d="M9.5 12.5l2 2 3.5-3.5" />
    </>
  ),
  ubo: (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M12 8.5v3M12 11.5L7.5 15M12 11.5L16.5 15" />
    </>
  ),
};

export function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name] || P.box}
    </svg>
  );
}
