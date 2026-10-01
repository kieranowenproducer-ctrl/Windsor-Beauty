'use client';

import { useState } from 'react';

/**
 * The scrolling announcement strip.
 *
 * Two things here are not decoration.
 *
 * The sentence is printed THREE times so the loop can move by exactly one copy
 * and join up seamlessly. A screen reader has no idea that is a trick and read
 * the whole announcement out three times in a row. Copies two and three are now
 * hidden from it; nothing changes on screen.
 *
 * And it never stopped moving. Text that starts scrolling by itself and carries
 * on forever has to have a way to stop it (WCAG 2.2.2) — reading a moving line
 * is hard or impossible for a lot of people. It now stops on hover, stops while
 * anything inside it has keyboard focus, stops for anyone whose device asks for
 * reduced motion (globals.css), and has a real stop button that is invisible
 * until it is tabbed to.
 */
export default function AnnouncementTicker({ text }: { text: string }) {
  const [paused, setPaused] = useState(false);

  return (
    <aside
      aria-label="Announcements"
      className="group relative bg-stone-900 py-3 overflow-hidden"
    >
      {/* w-max sizes the strip to its content (3 copies), so the ticker's
          translateX(-33.333%) moves by exactly one copy and loops seamlessly.
          Without it the strip is viewport-width, so on mobile it reset a third
          of the screen in — cutting off the tail of the message. */}
      <div
        className={`flex w-max whitespace-nowrap animate-ticker group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] ${
          paused ? '[animation-play-state:paused]' : ''
        }`}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            aria-hidden={i > 0}
            className="text-[9px] tracking-[0.22em] uppercase text-stone-400 shrink-0 pr-16"
          >
            {text}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPaused(p => !p)}
        className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-1/2 focus:-translate-y-1/2 focus:z-10 focus:bg-white focus:text-stone-900 focus:px-3 focus:py-1 focus:text-[10px] focus:tracking-[0.12em] focus:uppercase focus:font-semibold"
      >
        {paused ? 'Start the announcements moving' : 'Stop the announcements moving'}
      </button>
    </aside>
  );
}
