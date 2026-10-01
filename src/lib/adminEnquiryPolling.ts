import type { EnquiryPopupSnapshot } from '@/components/admin/AdminEnquiryPopup';

type CountData = Partial<EnquiryPopupSnapshot> & { newCount: number; oldestDays?: number };
type Result = { data: CountData; error: false } | { data: null; error: true };
type Listener = (result: Result) => void;
interface Runtime {
  fetchCount: () => Promise<CountData>;
  visible: () => boolean;
  everyMinute: (callback: () => void) => () => void;
  onVisibility: (callback: () => void) => () => void;
}

// One timer and request per browser tab, shared by the sidebar and dashboard.
// Nothing is stored on the server or kept after the last admin view unmounts.
export function createAdminEnquiryPolling(runtime: Runtime) {
  const listeners = new Set<Listener>();
  let snapshot: Result | null = null;
  let stopTimer: (() => void) | null = null;
  let stopVisibility: (() => void) | null = null;
  let generation = 0;
  let inFlight = false;
  let refreshQueued = false;

  async function refresh() {
    if (!listeners.size || !runtime.visible() || inFlight) return;
    const startedGeneration = generation;
    inFlight = true;
    let result: Result;
    try {
      const data = await runtime.fetchCount();
      if (!data || typeof data.newCount !== 'number' || !Number.isFinite(data.newCount)) {
        throw new Error('Invalid enquiry count');
      }
      result = { data, error: false };
    } catch {
      result = { data: null, error: true };
    }
    if (startedGeneration !== generation) return;
    inFlight = false;
    // A write finished after this read began. Re-read before publishing it.
    if (refreshQueued) {
      refreshQueued = false;
      void refresh();
      return;
    }
    snapshot = result;
    listeners.forEach(listener => listener(result));
  }

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      if (snapshot) listener(snapshot);
      if (listeners.size === 1) {
        stopTimer = runtime.everyMinute(() => { void refresh(); });
        stopVisibility = runtime.onVisibility(() => { void refresh(); });
        void refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        stopTimer?.();
        stopVisibility?.();
        stopTimer = stopVisibility = null;
        snapshot = null;
        generation++;
        inFlight = false;
        refreshQueued = false;
      };
    },
    refreshAfterChange() {
      snapshot = null;
      if (inFlight) refreshQueued = true;
      else void refresh();
    },
  };
}

// Lazily constructed: importing this module during server rendering does no IO.
let browserPolling: ReturnType<typeof createAdminEnquiryPolling> | undefined;
function getBrowserPolling() {
  return browserPolling ??= createAdminEnquiryPolling({
    fetchCount: async () => {
      const response = await fetch('/api/admin/enquiries/new-count', {
        cache: 'no-store', signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('Enquiry count unavailable');
      return response.json();
    },
    visible: () => document.visibilityState === 'visible',
    everyMinute: callback => {
      const timer = window.setInterval(callback, 60_000);
      return () => window.clearInterval(timer);
    },
    onVisibility: callback => {
      document.addEventListener('visibilitychange', callback);
      return () => document.removeEventListener('visibilitychange', callback);
    },
  });
}

export function subscribeAdminEnquiryCount(listener: Listener) {
  return getBrowserPolling().subscribe(listener);
}

export function refreshAdminEnquiryCount() {
  browserPolling?.refreshAfterChange();
}
