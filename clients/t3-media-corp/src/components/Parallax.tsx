'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Slow drift on a decorative layer as it passes through the viewport.
 *
 * One rAF-throttled scroll listener per layer, only while the layer is on
 * screen (an IntersectionObserver gates it), and only transform is touched so
 * nothing re-layouts. Applied to background imagery only — never to text.
 */
export function Parallax({
  children,
  speed = 12,
  className = '',
}: {
  children: ReactNode;
  /** Travel in percent of the element's height across a full pass. */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let onScreen = false;

    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // -1 above the fold, 0 centred, 1 below.
      const t = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2);
      el.style.transform = `translate3d(0, ${(t * speed).toFixed(2)}%, 0)`;
    };

    const onScroll = () => {
      if (!onScreen || frame) return;
      frame = requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        el.style.willChange = onScreen ? 'transform' : 'auto';
        if (onScreen) update();
      },
      { rootMargin: '10% 0px' },
    );

    observer.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} aria-hidden="true">
      {children}
    </div>
  );
}
