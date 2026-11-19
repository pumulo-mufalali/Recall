/** Two cards and a tick: Recall's mark. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="3" y="6" width="20" height="22" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <rect x="9" y="3" width="20" height="22" rx="4" fill="var(--accent)" />
      <path d="M14 14.5l3 3 6-6.5" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
