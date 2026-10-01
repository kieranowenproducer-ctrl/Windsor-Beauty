'use client';

import { useEffect, useRef } from 'react';

/**
 * Makes a pop-up behave like a real dialog for somebody not using a mouse.
 *
 * WHY IT EXISTS. Every overlay on this site was a plain <div>. Visually that is
 * fine: it covers the page and you click the X. For anyone else it was not a
 * dialog at all —
 *   - a screen reader announced no dialog, no name, and carried on reading the
 *     page underneath as if nothing had opened;
 *   - Tab walked straight out of the basket into the shop behind it, and the
 *     next Tab went somewhere invisible;
 *   - closing left focus nowhere, so the next Tab started again from the top of
 *     the page rather than from the button that had been pressed.
 *
 * Spread the returned props onto the PANEL (not the backdrop), give the panel a
 * name via `labelledBy` or `label`, and the four things above are fixed.
 *
 * The Tab trap is deliberately a plain wrap-around over the panel's own
 * focusable elements rather than the `inert`-the-rest approach EntryGate uses.
 * These overlays sit inside the page they cover, so there is no single sibling
 * to mark inert; the gate wraps the whole page and can.
 */
export function useDialog({
  open,
  onClose,
  labelledBy,
  label,
}: {
  open: boolean;
  /** Called on Escape. Omit for a dialog that must not be dismissed. */
  onClose?: () => void;
  /** id of the heading that names the dialog. Preferred over `label`. */
  labelledBy?: string;
  /** Plain-text name, when there is no visible heading to point at. */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Where focus was before the dialog opened, so it can be put back.
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;

    const panel = ref.current;
    // Focus the first thing inside, or the panel itself if it holds no
    // controls (a read-only notice, for instance).
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.prototype.slice
        .call(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el: HTMLElement) => el.offsetParent !== null) as HTMLElement[];
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it has escaped the panel
      // some other way (a click on the backdrop, for instance).
      if (e.shiftKey && (active === firstItem || !panel.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (active === lastItem || !panel.contains(active))) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Put focus back where it came from. `isConnected` guards the case where
      // the trigger itself was removed while the dialog was open.
      const back = returnTo.current as HTMLElement | null;
      if (back && back.isConnected && typeof back.focus === 'function') back.focus();
    };
  }, [open, onClose]);

  return {
    ref,
    tabIndex: -1,
    role: 'dialog' as const,
    'aria-modal': true,
    'aria-labelledby': labelledBy,
    'aria-label': labelledBy ? undefined : label,
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
