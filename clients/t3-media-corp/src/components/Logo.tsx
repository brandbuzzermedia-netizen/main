export function Logo({ className = '', invert = false }: { className?: string; invert?: boolean }) {
  const mark = invert ? '#FFFFFF' : '#009FE3';
  const glyph = invert ? '#0B0B0C' : '#FFFFFF';
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <svg viewBox="0 0 100 100" className="h-9 w-9 shrink-0" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r="50" fill={mark} />
        <rect x="19" y="28" width="33" height="9" fill={glyph} />
        <rect x="31" y="28" width="9" height="44" fill={glyph} />
        <path
          d="M 56 32.5 H 67 A 8.75 8.75 0 0 1 67 50 A 8.75 8.75 0 0 1 67 67.5 H 56"
          fill="none"
          stroke={glyph}
          strokeWidth="9"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span
          className={`font-display text-[1.35rem] tracking-tight ${invert ? 'text-paper' : 'text-ink'}`}
        >
          T3 Media Corp
        </span>
        <span
          className={`mt-1 text-[0.5625rem] uppercase tracking-eyebrow ${invert ? 'text-mist' : 'text-muted'}`}
        >
          Interior &amp; Architectural Materials
        </span>
      </span>
    </span>
  );
}
