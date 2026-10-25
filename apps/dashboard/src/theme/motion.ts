import { useEffect, useState } from 'react';

/**
 * Enterprise Design System Motion Tokens
 * Adheres to strict 120ms - 220ms durations, calm decelerating easings,
 * and zero decorative layout shifts.
 */
export const motionTokens = {
  duration: {
    instant: 0,
    fast: 0.14,      // 140ms: Hover, pressed, toggle states, badge updates
    normal: 0.18,    // 180ms: Dialogs, drawers, dropdown popovers
    tableRow: 0.20   // 200ms: Row state updates without layout shifts
  },
  ease: {
    standard: [0.16, 1, 0.3, 1] as const,    // Smooth decelerate for entrance & feedback
    enter: [0, 0, 0.2, 1] as const,          // Fast acceleration into view
    exit: [0.4, 0, 1, 1] as const            // Rapid exit
  }
};

/**
 * Hook to dynamically detect and honor prefers-reduced-motion
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReduced;
}

/**
 * Generates transition settings honoring reduced motion
 */
export function getTransition(
  durationSec: number = motionTokens.duration.normal,
  prefersReduced: boolean = false
) {
  if (prefersReduced) {
    return { duration: 0 };
  }
  return {
    duration: durationSec,
    ease: motionTokens.ease.standard
  };
}
