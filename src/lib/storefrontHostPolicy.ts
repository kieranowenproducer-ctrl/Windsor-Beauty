// Preparation only: unset/legacy preserves the existing storefront gates.
// Compatibility never replaces a route's own authentication or payment checks.
export type StorefrontDecision = 'legacy' | 'public' | 'compatibility' | 'retired' | 'closed';
type Brand = 'glow' | 'beauty';

const POLICIES = new Set([
  '/terms', '/privacy', '/refund-policy', '/returns', '/shipping', '/disclaimer',
  '/research-disclaimer', '/payment-policy', '/contact-policy', '/cookies',
  '/age-restriction', '/glow-card-terms',
]);
const WEBHOOKS = new Set([
  '/api/webhooks/fena', '/api/webhooks/resend-inbound', '/api/webhooks/resend-outbound',
]);
const COMMON_CRONS = new Set([
  '/api/cron/royal-mail-sync', '/api/cron/verification-reminders',
  '/api/cron/data-retention', '/api/cron/unpaid-orders',
]);
const GLOW_CRONS = new Set([
  '/api/cron/sentinel', '/api/cron/concierge-retention', '/api/cron/ads',
  '/api/cron/affiliate-code-reminders',
]);
const within = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

function machineRoute(path: string, method: string, brand: Brand): boolean {
  if (WEBHOOKS.has(path)) return ['GET', 'HEAD', 'POST'].includes(method);
  return ['GET', 'HEAD'].includes(method)
    && (COMMON_CRONS.has(path) || (brand === 'glow' && GLOW_CRONS.has(path)));
}

function issuedRoute(path: string, method: string, brand: Brand): boolean {
  if (within(path, '/api/account')) return true; // Existing handlers retain their own method/auth guards.
  if (brand === 'glow' && ['/api/affiliate-request', '/api/affiliate-invitation'].includes(path)) return true;
  if (path === '/api/payment/fena/confirm') return method === 'POST';
  if (path === '/api/marketing/unsubscribe') return method === 'POST';
  if (/^\/api\/invoices\/[^/]+\/accept-terms$/.test(path)) return method === 'POST';
  if (!['GET', 'HEAD'].includes(method)) return false;
  return within(path, '/account') || within(path, '/unsubscribe') || POLICIES.has(path)
    || /^\/(?:pay|resume-payment|orders)\/[^/]+$/.test(path)
    || /^\/api\/invoices\/[^/]+(?:\/pixel)?$/.test(path)
    || /^\/api\/payment\/(?:resume\/[^/]+|fena\/status\/[^/]+)$/.test(path)
    || /^\/api\/orders\/[^/]+$/.test(path)
    || ['/checkout/success', '/checkout/cancelled'].includes(path)
    || (brand === 'glow' && (within(path, '/raf-invite') || /^\/(?:r|refer)\/[^/]+$/.test(path)
      || ['/videos/joining-through-raf.mp4', '/videos/joining-through-raf-poster.jpg'].includes(path)));
}

export function storefrontHostDecision(input: {
  brand: Brand; hostname: string; pathname: string; method: string;
  mode?: string; compatibilityHosts?: string;
}): StorefrontDecision {
  const mode = input.mode?.trim().toLowerCase();
  if (!mode || mode === 'legacy') return 'legacy';
  const host = input.hostname.toLowerCase();
  const canonical = [`windsor${input.brand}.is`, `www.windsor${input.brand}.is`].includes(host);
  const owned = canonical || ['com', 'co.uk'].some(suffix =>
    host === `windsor${input.brand}.${suffix}` || host === `www.windsor${input.brand}.${suffix}`);
  const path = input.pathname, method = input.method.toUpperCase();
  // Management keeps the original cookie/bearer gates, even on protected preview hosts.
  if (within(path, '/admin') || within(path, '/api/admin')) return 'compatibility';
  if (['GET', 'HEAD'].includes(method) && (within(path, '/_next') || within(path, '/images')
    || within(path, '/fonts') || path === '/favicon.ico')) return 'compatibility';
  // Unknown/noncanonical hosts never become a second public shop.
  const registered = (input.compatibilityHosts || '').split(',').map(value => value.trim().toLowerCase())
    .filter(value => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) && value.includes('.'))
    .includes(host);
  if ((owned || registered) && machineRoute(path, method, input.brand)) return 'compatibility';
  if (owned && issuedRoute(path, method, input.brand)) return 'compatibility';
  if (canonical && mode === 'public') return 'public';
  // Invalid nonempty modes fail closed; they cannot accidentally reopen a shop.
  return canonical ? 'closed' : 'retired';
}
