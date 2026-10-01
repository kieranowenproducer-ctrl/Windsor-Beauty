// What a person calls an ad. Pure functions, safe on the server and in the
// browser, so the page, the chart legend, the weekly email and the adviser all
// name an ad the same way.
//
// Kieran compares several ads at once (up to five), so each ad can carry a
// letter, A to E, and an experiment note ("Gym targeting, comments off").
// Those replace Meta's automatic name ("Instagram post: visit windsorglow.com
// to learn more") wherever a human reads it. The Meta name stays visible
// somewhere small so the ad can still be found in Ads Manager.

export type Slot = 'A' | 'B' | 'C' | 'D' | 'E';
export const SLOTS: Slot[] = ['A', 'B', 'C', 'D', 'E'];
/** The most ads that can be compared at once: one per letter. */
export const MAX_COMPARED = SLOTS.length;

export interface CreativeLink {
  adName: string | null;
  /** Which film or creative the ad used. The original "which film" note. */
  label: string;
  /** What this ad is testing, in the person's own words. */
  note: string | null;
  slot: Slot | null;
  /** Hidden from the everyday admin view, never deleted from Meta. */
  hidden?: boolean;
}

export function normaliseSlot(value: unknown): Slot | null {
  const s = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (SLOTS as string[]).includes(s) ? (s as Slot) : null;
}

export function adDisplayName(link: CreativeLink | undefined | null, metaName: string): string {
  if (!link) return metaName;
  const slotName = link.slot ? `Ad ${link.slot}` : '';
  const note = (link.note ?? '').trim();
  if (slotName && note) return `${slotName}: ${note}`;
  if (slotName) return slotName;
  if (note) return note;
  const film = (link.label ?? '').trim();
  return film || metaName;
}

/** True when the person has written anything at all about this ad. */
export function hasAnyLabel(link: CreativeLink | undefined | null): boolean {
  return Boolean(link && ((link.label ?? '').trim() || (link.note ?? '').trim() || link.slot));
}
