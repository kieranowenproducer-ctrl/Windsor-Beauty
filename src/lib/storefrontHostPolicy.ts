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

function cronRoute(path: string, method: string, brand: Brand): boolean {
  return ['GET', 'HEAD'].includes(method)
    && (COMMON_CRONS.has(path) || (brand === 'glow' && GLOW_CRONS.has(path)));
}

function machineRoute(path: string, method: string, brand: Brand): boolean {
  if (WEBHOOKS.has(path)) return ['GET', 'HEAD', 'POST'].includes(method);
  return cronRoute(path, method, brand);
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

// Host is supplied by the HTTP server. Forwarded-host headers are never trusted here.
// Missing Host alone permits the URL fallback; malformed Host must fail closed.
export function storefrontRequestHostname(host: string | null, urlHostname: string): string | null {
  const raw = host === null ? urlHostname : host;
  const match = /^([a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/i.exec(raw);
  if (!match || (host === null && match[2]) || (match[2] && Number(match[2]) > 65535)) return null;
  const name = match[1].toLowerCase();
  if (name.length > 253 || name.split('.').some(label => label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
  return name;
}

// Platform-owned system values only; never derive this identity from request headers.
// https://vercel.com/docs/environment-variables/system-environment-variables
export function storefrontPlatformCronHostname(brand: Brand, platform: {
  vercel?: string; environment?: string; projectId?: string; url?: string;
}): string | null {
  const project = brand === 'glow' ? 'prj_UDl8CFovgFkPtYza3m780MxwvRYT' : 'prj_8Y7SQRUuOqQ8uAb71sCo0R8d4fBu';
  if (platform.vercel !== '1' || platform.environment !== 'production'
    || platform.projectId !== project || !platform.url) return null;
  const hostname = storefrontRequestHostname(platform.url, '');
  return hostname && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(hostname)
    && !platform.url.includes(':') ? hostname : null;
}

export function storefrontHostDecision(input: {
  brand: Brand; hostname: string | null; pathname: string; method: string;
  mode?: string; compatibilityHosts?: string; platformCronHostname?: string | null;
}): StorefrontDecision {
  const mode = input.mode?.trim().toLowerCase();
  if (!mode || mode === 'legacy') return 'legacy';
  if (input.hostname === null) return 'retired';
  const host = input.hostname.toLowerCase();
  const canonical = [`windsor${input.brand}.is`, `www.windsor${input.brand}.is`].includes(host);
  const owned = canonical || ['com', 'co.uk'].some(suffix =>
    host === `windsor${input.brand}.${suffix}` || host === `www.windsor${input.brand}.${suffix}`);
  const path = input.pathname, method = input.method.toUpperCase();
  // Management keeps the original cookie/bearer gates, even on protected preview hosts.
  if (within(path, '/admin') || within(path, '/api/admin')) return 'compatibility';
  if (['GET', 'HEAD'].includes(method) && (within(path, '/_next') || within(path, '/images')
    || within(path, '/fonts') || path === '/favicon.ico')) return 'compatibility';
  // Only this deployment's system identity admits generated-host scheduled jobs.
  // Stale generated cron hosts cannot reuse a static compatibility registration.
  if (host.endsWith('.vercel.app') && cronRoute(path, method, input.brand)) {
    return host === input.platformCronHostname ? 'compatibility' : 'retired';
  }
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
