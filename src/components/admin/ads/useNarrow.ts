'use client';

import { useEffect, useState } from 'react';

// True on a phone-width screen. The charts draw a shorter, taller picture and
// bigger labels there, because a chart drawn for a wide screen shrinks to a
// strip a finger high on a phone (audit, 4 Sept 2026: 110 pixels tall).

export function useNarrow(maxWidth = 640): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxWidth]);
  return narrow;
}
