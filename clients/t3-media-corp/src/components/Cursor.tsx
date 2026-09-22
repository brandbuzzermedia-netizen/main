'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A ring that trails the pointer and swells over anything carrying
 * `data-cursor="<label>"`, showing that label inside it.
 *
 * The native cursor is left alone — replacing it costs more in lost affordance
 * than it gains in atmosphere. This only runs on a fine pointer (so never on
 * touch), and not at all under prefers-reduced-motion. One rAF loop, one
 * transform, no React state in the hot path.
 */
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;

    const el = ring.current;
    if (!el) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let frame = 0;

    const loop = () => {
      // Lerp towards the pointer: the lag is what makes it read as a trailing
      // object rather than a second cursor.
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      frame = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      setVisible(true);
      const target = (e.target as HTMLElement)?.closest?.('[data-cursor]');
      if (target) {
        setLabel(target.getAttribute('data-cursor') || '');
        setActive(true);
      } else {
        setActive(false);
      }
    };

    const onLeave = () => setVisible(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ring}
      aria-hidden="true"
      className={`pointer-events-none fixed left-0 top-0 z-[90] hidden items-center justify-center
                  rounded-full border border-bronze-light/70 font-mono text-[0.5625rem]
                  uppercase tracking-eyebrow text-ink transition-[width,height,background-color,opacity]
                  duration-300 ease-editorial md:flex ${
                    active
                      ? 'h-20 w-20 bg-bronze-light opacity-100'
                      : 'h-7 w-7 bg-transparent opacity-70'
                  } ${visible ? '' : 'opacity-0'}`}
    >
      <span className={active ? 'opacity-100' : 'opacity-0'}>{label}</span>
    </div>
  );
}
