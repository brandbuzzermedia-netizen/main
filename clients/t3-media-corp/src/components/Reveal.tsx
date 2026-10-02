'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';

/**
 * Fade-and-rise on first scroll into view. One IntersectionObserver per
 * element, disconnected after firing — no scroll listeners, no layout reads.
 * Motion is disabled entirely by the reduced-motion rule in globals.css.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = '',
  variant = 'rise',
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
  /** `rise` fades and lifts; `plate` uncovers an image from its bottom edge. */
  variant?: 'rise' | 'plate';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`${variant === 'plate' ? 'plate-reveal' : 'reveal'} ${className}`}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
