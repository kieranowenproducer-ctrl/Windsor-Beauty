'use client';

const QUEUE_KEY = 'wg_tracking_queue_v1';
const MAX_QUEUED_EVENTS = 100;

export interface TrackingEvent {
  event_id: string;
  path: string;
  visit_id: string;
  landing?: boolean;
  kind?: 'add_to_basket' | 'member_offer_shown' | 'member_offer_dismissed' | 'member_offer_joined' | 'member_offer_checkout' | 'checkout_shipping_seen' | 'checkout_payment_seen' | 'checkout_pay_pressed';
  product_slug?: string;
  quantity?: number;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
}

let flushing: Promise<void> | null = null;
let memoryQueue: TrackingEvent[] = [];

function newEventId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readQueue(): TrackingEvent[] {
  if (memoryQueue.length > 0) return memoryQueue.slice();
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    memoryQueue = Array.isArray(value) ? value.slice(-MAX_QUEUED_EVENTS) : [];
    return memoryQueue.slice();
  } catch {
    return [];
  }
}

function writeQueue(events: TrackingEvent[]): void {
  memoryQueue = events.slice(-MAX_QUEUED_EVENTS);
  try {
    if (memoryQueue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue));
  } catch {
    // Private browsing can refuse storage. The immediate send below still runs.
  }
}

/**
 * Save first, send second. A reload, lost signal or temporary server problem
 * therefore leaves the event in the browser and the next page retries it.
 * The server uses event_id to make retries safe rather than counting twice.
 */
export function queueTrackingEvent(event: Omit<TrackingEvent, 'event_id'>): void {
  const queue = readQueue();
  queue.push({ ...event, event_id: newEventId() });
  writeQueue(queue);
  void flushTrackingQueue();
}

export function flushTrackingQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    let queue = readQueue();
    while (queue.length > 0) {
      const current = queue[0];
      try {
        const response = await fetch('/api/visit', {
          method: 'POST',
          body: JSON.stringify(current),
          keepalive: true,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) break;
      } catch {
        break;
      }
      // Read again before removing the acknowledgement. Another page action
      // may have joined the queue while this request was in flight.
      queue = readQueue().filter((event) => event.event_id !== current.event_id);
      writeQueue(queue);
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export function queuedTrackingEvents(): number {
  return readQueue().length;
}
