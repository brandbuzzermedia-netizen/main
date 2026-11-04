'use client';

import { Fragment, useEffect, useRef, type ElementType } from 'react';

/**
 * Headline reveal: each word climbs out from behind its own clipping mask,
 * staggered left to right.
 *
 * The words are ordinary text nodes — a screen reader or a crawler reads the
 * sentence exactly as written. The masked state is applied only under
 * `html.js`, so with JavaScript off the headline simply sits there, visible.
 *
 * `immediate` plays on mount (above-the-fold headlines); otherwise it waits
 * for the element to scroll into view.
 */
export function WordReveal({
  text,
  as: Tag = 'span',
  className = '',
  delay = 0,
  step = 55,
  immediate = false,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
  step?: number;
  immediate?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (immediate || typeof IntersectionObserver === 'undefined') {
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
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [immediate]);

  const words = text.split(' ');

  return (
    <Tag ref={ref} className={`word-reveal ${className}`}>
      {words.map((word, i) => (
        // The space sits outside the clipping mask — inside it, overflow:hidden
        // swallows the word gap and the headline runs together.
        <Fragment key={`${word}-${i}`}>
          <span className="word-reveal-mask">
            <span
              className="word-reveal-word"
              style={{ '--word-delay': `${delay + i * step}ms` } as React.CSSProperties}
            >
              {word}
            </span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </Tag>
  );
}
