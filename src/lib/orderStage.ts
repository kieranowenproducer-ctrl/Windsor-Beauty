// Where an order has got to, as one of four coloured squares (task 41a3910f).
//
// Kieran asked for this looking at the Orders screen: he could see a status word on every row and
// still could not tell, at a glance, which orders were waiting on HIM. His four stages, in his
// words:
//
//   BLUE    the customer has ordered and a Royal Mail label still has to be created
//   ORANGE  the Royal Mail label has been created
//   YELLOW  it has gone to Royal Mail and he has marked it dispatched
//   GREEN   it has been delivered
//
// Stage one was red to begin with, as he first described it. He asked for blue the moment he saw it
// on his phone: at this size red-600 and orange-600 read as very nearly the same colour, which
// defeats the whole point of a square you are meant to recognise without reading. Blue against
// orange, yellow and green is told apart at a glance, and stays told apart by anyone who cannot
// separate red from green.
//
// WHY THIS FILE EXISTS RATHER THAN THE LOGIC LIVING ON EACH SCREEN. It is shown on the Orders
// screen and on the dashboard, which read their orders from two different places and have
// different shapes. Two copies of this rule would drift, and the first anybody would know is one
// screen calling an order red while the other calls it orange. There is one rule and both screens
// ask it.
//
// It reads what is already recorded and decides nothing on its own: it never writes, never guesses,
// and never infers delivery. Green means somebody marked the order delivered. The site cannot ask
// Royal Mail whether a parcel arrived (their Click & Drop account carries no delivery status, see
// task d912f632), so nothing here pretends otherwise.

export type OrderStage = 'to_label' | 'labelled' | 'dispatched' | 'delivered' | 'not_started';

export interface OrderStageInput {
  status: string;
  royalMailLabelStatus?: string | null;
  trackingNumber?: string | null;
  fulfilmentType?: string | null;
}

export interface OrderStageInfo {
  stage: OrderStage;
  /** Step number for the four real stages, 0 for an order that is not in the flow. */
  step: 0 | 1 | 2 | 3 | 4;
  /** What the square means, in the words Kieran would use. Also the tooltip and the screen-reader text. */
  label: string;
  /** A fuller sentence for the tooltip: what it is waiting for, not just what it is. */
  detail: string;
  /** Tailwind classes for the square. Real classes only, deliberately not a computed string. */
  swatch: string;
}

// Paid, and therefore actually in the queue. Mirrors PAID_STATUSES on the dashboard.
const PAID = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];

// Nothing is posted for these, so there is never a label. They skip the orange step rather than
// sitting on it for ever looking like work nobody has done.
const NON_POSTAL = ['collection', 'hand_delivered', 'no_delivery', 'other_manual'];

/**
 * A Royal Mail label actually exists for this order.
 *
 * ONLY `created`, and this is the part that was wrong first time round. `pending_postage` looks
 * like a made label and is not one: Royal Mail has the order but is holding it until the postage
 * is paid in Click & Drop, so nothing has been printed and the parcel cannot go anywhere.
 *
 * Kieran caught this himself with the example he gave: Amber Costello's order WB-MFQA6R, which he
 * said had not been processed and should be red. It is `pending_postage`, and asking Royal Mail
 * about it directly confirmed him: no printedOn, no shippedOn, no tracking number. It is a job
 * still waiting on him, so it is red. `error` is red for the same reason.
 *
 * A tracking number counts on its own, because an order that has one has certainly been through
 * Click & Drop, including older orders whose label status was never recorded.
 */
function hasLabel(order: OrderStageInput): boolean {
  if ((order.royalMailLabelStatus ?? 'none') === 'created') return true;
  return Boolean(order.trackingNumber && order.trackingNumber.trim());
}

/** True when Royal Mail has the order but the postage has not been paid, so no label exists yet. */
function awaitingPostage(order: OrderStageInput): boolean {
  return (order.royalMailLabelStatus ?? 'none') === 'pending_postage' && !order.trackingNumber;
}

export function orderStage(order: OrderStageInput): OrderStageInfo {
  const status = order.status;

  if (status === 'delivered') {
    return {
      stage: 'delivered',
      step: 4,
      label: 'Delivered',
      detail: 'Delivered. Nothing left to do on this one.',
      swatch: 'bg-green-600 border-green-700',
    };
  }

  if (status === 'dispatched') {
    return {
      stage: 'dispatched',
      step: 3,
      label: 'With Royal Mail',
      detail: 'Marked as dispatched and on its way. Mark it delivered when it arrives.',
      swatch: 'bg-yellow-400 border-yellow-500',
    };
  }

  // Anything that is not live work gets no square at all. An order nobody has paid for, or one that
  // was cancelled, is not waiting on a label, and colouring it red would put permanent false work on
  // the screen, which is the exact opposite of what this is for.
  if (!PAID.includes(status)) {
    return {
      stage: 'not_started',
      step: 0,
      label: 'Not in the queue',
      detail: 'Not waiting on anything here: it has either not been paid for, or it is cancelled or refunded.',
      swatch: 'bg-stone-200 border-stone-300',
    };
  }

  const postal = !NON_POSTAL.includes(order.fulfilmentType ?? 'royal_mail');

  if (postal && hasLabel(order)) {
    return {
      stage: 'labelled',
      step: 2,
      label: 'Label made',
      detail: 'The Royal Mail label has been made. Next: hand it over and mark it dispatched.',
      swatch: 'bg-orange-600 border-orange-700',
    };
  }

  if (!postal) {
    return {
      stage: 'to_label',
      step: 1,
      label: 'To go out',
      detail: 'Paid and waiting to go out. Nothing is posted on this one, so there is no label to make.',
      swatch: 'bg-blue-600 border-blue-700',
    };
  }

  // Same colour, different reason, and the reason is the useful bit: this one is not waiting on a
  // label being made, it is waiting on postage being paid in Click & Drop.
  if (awaitingPostage(order)) {
    return {
      stage: 'to_label',
      step: 1,
      label: 'Label needed',
      detail: 'Royal Mail has the order but the postage has not been paid, so no label has printed yet. This one is waiting on you.',
      swatch: 'bg-blue-600 border-blue-700',
    };
  }

  if ((order.royalMailLabelStatus ?? 'none') === 'error') {
    return {
      stage: 'to_label',
      step: 1,
      label: 'Label needed',
      detail: 'The Royal Mail label did not go through. Open the order and try it again.',
      swatch: 'bg-blue-600 border-blue-700',
    };
  }

  return {
    stage: 'to_label',
    step: 1,
    label: 'Label needed',
    detail: 'Paid, and the Royal Mail label still has to be made. This one is waiting on you.',
    swatch: 'bg-blue-600 border-blue-700',
  };
}

/** The key shown above each list, in order, so the colours are never a guess. */
export const ORDER_STAGE_KEY: { label: string; swatch: string }[] = [
  { label: 'Label needed', swatch: 'bg-blue-600 border-blue-700' },
  { label: 'Label made', swatch: 'bg-orange-600 border-orange-700' },
  { label: 'With Royal Mail', swatch: 'bg-yellow-400 border-yellow-500' },
  { label: 'Delivered', swatch: 'bg-green-600 border-green-700' },
];
