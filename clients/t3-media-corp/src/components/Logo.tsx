/**
 * The client's own mark — a cyan disc with the T3 monogram — beside the
 * wordmark. The PNG is the artwork supplied by the client; it is the only
 * place the cyan appears, which is what keeps the rest of the palette neutral.
 */
export function Logo({
  className = '',
  invert = false,
  compact = false,
}: {
  className?: string;
  invert?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`group/logo inline-flex items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/t3-mark.png"
        alt=""
        width={142}
        height={142}
        aria-hidden="true"
        className="h-9 w-9 shrink-0 rounded-full transition-transform duration-500 ease-editorial group-hover/logo:rotate-[-8deg]"
      />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span
            className={`font-display text-[1.35rem] tracking-tight ${invert ? 'text-paper' : 'text-paper'}`}
          >
            T3 Media Corp
          </span>
          <span
            className={`mt-1.5 hidden font-mono text-[0.5625rem] uppercase tracking-eyebrow min-[420px]:block ${
              invert ? 'text-mist' : 'text-stone'
            }`}
          >
            Interior &amp; Architectural Materials
          </span>
        </span>
      )}
    </span>
  );
}
