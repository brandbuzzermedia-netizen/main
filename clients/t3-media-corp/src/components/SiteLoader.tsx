'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * First-visit loading screen.
 *
 * Ink ground, the brand mark inside a breathing ring, a hairline progress rule
 * and a mono counter — then the curtain splits and lifts off the page.
 *
 * Rules it follows:
 *  - once per session (sessionStorage), so moving between routes never re-gates
 *  - two safety timers, so a stalled asset can never trap the visitor
 *  - skipped outright under prefers-reduced-motion
 *  - rendered by the client only, so the HTML a crawler sees is the page itself
 */

const KEY = 't3-loaded';

export function SiteLoader() {
  const [active, setActive] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(8);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(KEY) === '1';
    } catch {
      seen = false; // private mode — show it, then let the timers clear it
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (seen || reduced) return;

    setActive(true);
    document.body.style.overflow = 'hidden';

    // Creep towards 90% while the page downloads; window.load finishes it.
    const creep = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + Math.max(1, (92 - p) * 0.12)));
    }, 160);

    const finish = () => {
      setProgress(100);
      timers.current.push(setTimeout(() => setLeaving(true), 260));
      timers.current.push(
        setTimeout(() => {
          setActive(false);
          document.body.style.overflow = '';
        }, 1240),
      );
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* nothing to remember, and nothing to fix */
      }
    };

    const onLoad = () => finish();
    if (document.readyState === 'complete') {
      timers.current.push(setTimeout(finish, 700));
    } else {
      window.addEventListener('load', onLoad, { once: true });
    }

    // Belt and braces: finish regardless, then force-clear.
    timers.current.push(setTimeout(finish, 3600));
    timers.current.push(
      setTimeout(() => {
        setActive(false);
        document.body.style.overflow = '';
      }, 6000),
    );

    const held = timers.current;
    return () => {
      clearInterval(creep);
      window.removeEventListener('load', onLoad);
      held.forEach(clearTimeout);
      document.body.style.overflow = '';
    };
  }, []);

  if (!active) return null;

  const shown = Math.min(100, Math.round(progress));

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading T3 Media Corp"
    >
      {/* Two halves of the curtain — they part upward and downward on exit. */}
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-1/2 bg-ink transition-transform duration-[900ms] ease-editorial ${
          leaving ? '-translate-y-full' : 'translate-y-0'
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 h-1/2 bg-ink transition-transform duration-[900ms] ease-editorial ${
          leaving ? 'translate-y-full' : 'translate-y-0'
        }`}
      />

      <div
        className={`relative flex flex-col items-center transition-all duration-300 ease-editorial ${
          leaving ? 'scale-[0.97] opacity-0' : 'opacity-100'
        }`}
      >
        <span className="relative flex h-20 w-20 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-pulse-ring rounded-full border border-brand"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/t3-mark.png"
            alt=""
            width={142}
            height={142}
            aria-hidden="true"
            className="h-16 w-16 rounded-full"
          />
        </span>

        <span className="mt-8 overflow-hidden">
          <span className="block animate-word-up font-display text-[2rem] leading-none text-paper">
            T3 Media Corp
          </span>
        </span>
        <span className="mt-4 font-mono text-[0.625rem] uppercase tracking-eyebrow text-stone">
          Interior &amp; Architectural Materials
        </span>

        <span className="mt-10 flex w-56 items-center gap-4">
          <span className="relative h-px flex-1 bg-white/15">
            <span
              className="absolute inset-y-0 left-0 bg-brand transition-[width] duration-300 ease-out"
              style={{ width: `${shown}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right font-mono text-[0.625rem] text-stone">
            {shown}
          </span>
        </span>
      </div>
    </div>
  );
}
