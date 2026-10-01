// Which orders belong in Archived orders, and why (task 831a4461).
//
// Kieran's Orders screen is 83 orders long and most of them are finished business. He asked for the
// completed ones to move themselves out of the way: an order delivered and marked delivered, once
// it is more than 7 days old, goes to a new Archived orders folder. He can also move any order
// there himself by ticking it and pressing a button.
//
// ONE RULE, IN ONE PLACE, because the screen and the counts both ask it and they must never
// disagree about the same order.
//
// THE THING THAT WOULD MAKE THIS DANGEROUS is archiving work that still needs doing. Only a
// DELIVERED order archives itself. Nothing waiting on a label, nothing in the post and nothing
// unpaid can ever disappear on its own, whatever its dates say.

/** His number. One place, so changing it is one edit. */
export const ARCHIVE_AFTER_DAYS = 7;

export interface OrderArchiveInput {
  status: string;
  /** When it was marked delivered. Null on every order delivered before the shop started recording it. */
  deliveredAt?: string | null;
  archivedAt?: string | null;
  dispatchedAt?: string | null;
  paymentConfirmedAt?: string | null;
  createdAt?: string | null;
}

export interface OrderArchiveInfo {
  archived: boolean;
  /** 'by_hand' | 'old' | null. What put it in the archive, so the screen can say. */
  reason: 'by_hand' | 'old' | null;
  /** Said out loud, for the row and the tooltip. */
  detail: string;
  /** True when the date the clock ran from is a stand-in rather than a real delivery date. */
  dateIsEstimated: boolean;
}

/**
 * The date the 7 days are counted from.
 *
 * The shop never recorded a delivery date until this task, so for the orders already delivered
 * there is no true answer. Rather than write a guess into the database and have it look like a fact
 * for ever, this falls back at read time to the most recent date that IS known.
 *
 * Every fallback is a date BEFORE delivery, so it can only ever make an order look older than it
 * really is, never younger. That is the safe direction: the worst case is an old delivered order
 * tidying itself away a few days early, and it is still sitting in the archive where he can see it.
 */
function clockStartedAt(order: OrderArchiveInput): { at: string | null; estimated: boolean } {
  if (order.deliveredAt) return { at: order.deliveredAt, estimated: false };
  const fallback = order.dispatchedAt ?? order.paymentConfirmedAt ?? order.createdAt ?? null;
  return { at: fallback, estimated: true };
}

function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (now.getTime() - then) / 86_400_000;
}

export function orderArchiveState(order: OrderArchiveInput, now: Date = new Date()): OrderArchiveInfo {
  // By hand beats everything, and it is the only thing that can archive an order that is not
  // delivered. Somebody pressed a button and meant it.
  if (order.archivedAt) {
    return {
      archived: true,
      reason: 'by_hand',
      detail: 'Moved here by hand. Bring it back any time.',
      dateIsEstimated: false,
    };
  }

  if (order.status !== 'delivered') {
    return { archived: false, reason: null, detail: '', dateIsEstimated: false };
  }

  const { at, estimated } = clockStartedAt(order);
  if (!at) {
    return { archived: false, reason: null, detail: '', dateIsEstimated: false };
  }

  const days = daysSince(at, now);
  if (days < ARCHIVE_AFTER_DAYS) {
    return { archived: false, reason: null, detail: '', dateIsEstimated: estimated };
  }

  return {
    archived: true,
    reason: 'old',
    detail: estimated
      ? `Delivered and finished with. This one was delivered before the shop started recording delivery dates, so the ${ARCHIVE_AFTER_DAYS} days are counted from the last date we do know.`
      : `Delivered more than ${ARCHIVE_AFTER_DAYS} days ago.`,
    dateIsEstimated: estimated,
  };
}

/** Shorthand for the screens. */
export function isOrderArchived(order: OrderArchiveInput, now?: Date): boolean {
  return orderArchiveState(order, now).archived;
}
