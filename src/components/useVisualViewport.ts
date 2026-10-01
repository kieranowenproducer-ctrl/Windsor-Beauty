'use client';

import { useEffect, useState } from 'react';

/**
 * HOW MUCH OF THE SCREEN CAN ACTUALLY BE SEEN, RIGHT NOW.
 *
 * WHY THIS EXISTS (task 43f558e8). The "send a message to a customer" box was
 * capped at 92svh by task 72260d57, which fixed the Safari-toolbar version of
 * this fault and was reported as done. On an upright iPhone it was still broken,
 * and the reason is that **svh does not shrink when the keyboard opens**. It is
 * the height of the screen with the browser's toolbars showing and nothing else;
 * the keyboard is not part of the sum. So with the keyboard up, the box was
 * still roughly 700px tall inside a visible strip of about 430px. Safari's
 * answer to that is to pan the whole page, which pushed the header off the top
 * and left the Send button underneath the keyboard. Turning the phone sideways
 * happened to leave a short enough box to fit, which is exactly why it "only
 * shows in landscape".
 *
 * `window.visualViewport` is the only thing that knows the real answer: it
 * reports the region left over after the keyboard, and how far Safari has panned
 * it. An overlay sized and positioned from it is always exactly the visible
 * screen, so a button bar at its bottom edge is always reachable.
 *
 * `height` is null until the effect has run, and stays null on any browser
 * without the API. Callers use that to fall back to their svh cap rather than
 * applying a broken inline height. It also means the server and the first
 * client render agree, so nothing hydrates differently.
 */

export type VisibleScreen = {
  /** Visible height in px, or null when the browser cannot tell us. */
  height: number | null;
  /** How far down the page the visible strip currently sits, in px. */
  offsetTop: number;
};

export function useVisualViewport(): VisibleScreen {
  const [screen, setScreen] = useState<VisibleScreen>({ height: null, offsetTop: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const read = () => setScreen({ height: vv.height, offsetTop: vv.offsetTop });
    read();

    // resize fires as the keyboard opens and closes; scroll fires as Safari
    // pans the visible strip around. Both change the answer, so both are read.
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, []);

  return screen;
}
