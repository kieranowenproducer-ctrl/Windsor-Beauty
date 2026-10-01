'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

// The fixed top-left pill that BackToHome and BackButton float in. On phones it slides out of the
// way while the customer scrolls down, so it never sits on top of what they are reading (Samuel,
// 26 Sep 2026: it covered "Welcome back" on the account page), and slides back the moment they
// scroll up or return to the top. Desktop keeps it pinned, as asked for in task 2496e1c2.
const PHONE_MAX_WIDTH = 767;
const NEAR_TOP = 80;
const JITTER = 6;

export default function FloatingPill({ className, style, children }: { className: string; style: CSSProperties; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (window.innerWidth > PHONE_MAX_WIDTH || y < NEAR_TOP) setHidden(false);
      else if (y > lastY.current + JITTER) setHidden(true);
      else if (y < lastY.current - JITTER) setHidden(false);
      else return;
      lastY.current = y;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    lastY.current = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className={`${className} transition-transform duration-300 ease-out motion-reduce:transition-none ${hidden ? '-translate-x-[calc(100%+2rem)] pointer-events-none' : ''}`}
      style={style}
      // A keyboard user tabbing to it must always be able to see it.
      onFocus={() => setHidden(false)}
    >
      {children}
    </div>
  );
}
