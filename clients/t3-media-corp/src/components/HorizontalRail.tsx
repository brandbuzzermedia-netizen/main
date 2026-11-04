'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A section that holds the viewport while its track slides sideways.
 *
 * The outer element is made tall enough to spend the horizontal distance on;
 * the inner one is sticky, and scroll progress through the outer maps to the
 * track's translateX. One rAF-throttled listener, active only while the
 * section is on screen.
 *
 * Below `lg`, and under prefers-reduced-motion, none of that happens: the
 * track becomes an ordinary swipeable overflow strip with scroll snapping,
 * which is what a touch device wants anyway.
 */
export function HorizontalRail({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outerEl = outer.current;
    const trackEl = track.current;
    if (!outerEl || !trackEl) return;

    const pinned = window.matchMedia('(min-width: 1024px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0;
    let onScreen = false;
    let distance = 0;

    const measure = () => {
      distance = Math.max(0, trackEl.scrollWidth - window.innerWidth + 96);
      // The section is as tall as the sideways journey, plus one screen to
      // hold on at the start and end.
      outerEl.style.height = `${distance + window.innerHeight}px`;
    };

    const update = () => {
      frame = 0;
      const top = outerEl.getBoundingClientRect().top;
      const progress = Math.min(1, Math.max(0, -top / distance || 0));
      trackEl.style.transform = `translate3d(${(-progress * distance).toFixed(1)}px, 0, 0)`;
    };

    const onScroll = () => {
      if (!onScreen || frame) return;
      frame = requestAnimationFrame(update);
    };

    const teardown = () => {
      outerEl.style.height = '';
      trackEl.style.transform = '';
    };

    const enable = () => {
      if (!pinned.matches || reduced.matches) {
        teardown();
        outerEl.dataset.pinned = 'false';
        return;
      }
      outerEl.dataset.pinned = 'true';
      measure();
      update();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) onScroll();
      },
      { rootMargin: '20% 0px' },
    );

    observer.observe(outerEl);
    enable();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', enable, { passive: true });
    pinned.addEventListener('change', enable);
    reduced.addEventListener('change', enable);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', enable);
      pinned.removeEventListener('change', enable);
      reduced.removeEventListener('change', enable);
      if (frame) cancelAnimationFrame(frame);
      teardown();
    };
  }, []);

  return (
    <div ref={outer} data-pinned="false" className={`relative ${className}`}>
      <div className="sticky top-0 flex min-h-[100svh] items-center overflow-hidden">
        <div
          ref={track}
          className="flex w-max gap-6 px-[var(--shell-x)] will-change-transform
                     max-lg:w-full max-lg:snap-x max-lg:snap-mandatory max-lg:overflow-x-auto
                     max-lg:pb-6 lg:gap-10"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
