'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A short fade-and-settle on every route change. Keyed by pathname, so React
 * remounts the subtree and the CSS animation replays — no library, no state,
 * and nothing running once the animation ends.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
