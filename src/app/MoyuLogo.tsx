export function MoyuLogo() {
  return (
    <svg
      className="app-brand-logo"
      width="36"
      height="32"
      viewBox="0 0 36 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M13 10C18 4 28 6 33 14C28 22 18 24 13 18L5 22C3 23 2 22 2.5 20L5 14L2.5 8C2 6 3 5 5 6L13 10Z"
        fill="currentColor"
      />
      <path
        d="M16 11.5L19 14L16 16.5"
        stroke="var(--accent-soft)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="12.5" r="1.5" fill="var(--accent-soft)" />
      <path
        d="M9 27C12 24 15 30 18 27S24 24 27 27"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
