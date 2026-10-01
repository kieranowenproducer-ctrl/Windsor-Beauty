import { lookup as dnsLookup } from 'node:dns/promises';
import { isPrivateOrLocalAddress, validatePearlSourceUrl } from './source-safety.mjs';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_CONTENT_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/markdown',
  'text/plain',
]);

export class PearlSourcePreviewError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'PearlSourcePreviewError';
    this.status = status;
  }
}

async function assertPublicDestination(url, lookupImpl) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isPrivateOrLocalAddress(hostname)) {
    throw new PearlSourcePreviewError('Private or local network links cannot be previewed.', 400);
  }

  let addresses;
  try {
    addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new PearlSourcePreviewError('The website address could not be found.', 502);
  }
  const results = Array.isArray(addresses) ? addresses : [addresses];
  if (results.length === 0 || results.some((result) => isPrivateOrLocalAddress(result?.address))) {
    throw new PearlSourcePreviewError('This website resolves to a private or local network and cannot be previewed.', 400);
  }
}

async function readLimitedText(response, maximumBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new PearlSourcePreviewError('This page is larger than the 2 MB preview limit.', 413);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new PearlSourcePreviewError('This page is larger than the 2 MB preview limit.', 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Fetch one public text page without silently following an unsafe redirect.
 * The injected network functions make every safety rule directly testable.
 */
export async function fetchPearlSourcePreview(value, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const lookupImpl = options.lookupImpl || dnsLookup;
  const maximumBytes = options.maximumBytes || 2_000_000;
  const maximumRedirects = options.maximumRedirects ?? 3;
  let current = String(value || '');

  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    const checked = validatePearlSourceUrl(current);
    if (!checked.ok) throw new PearlSourcePreviewError(checked.error || 'Enter a valid public https link.', 400);
    const url = new URL(checked.url);
    await assertPublicDestination(url, lookupImpl);

    let response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/markdown,text/plain;q=0.9',
          'User-Agent': 'WindsorGlowResearchAudit/1.0 (+educational source verification)',
        },
        signal: options.signal,
        redirect: 'manual',
      });
    } catch (error) {
      if (error instanceof PearlSourcePreviewError) throw error;
      throw new PearlSourcePreviewError('The page could not be fetched. Check the address and try again.', 502);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects === maximumRedirects) {
        throw new PearlSourcePreviewError('The page redirected too many times.', 502);
      }
      const location = response.headers.get('location');
      if (!location) throw new PearlSourcePreviewError('The page returned an incomplete redirect.', 502);
      try {
        current = new URL(location, url).toString();
      } catch {
        throw new PearlSourcePreviewError('The page returned an invalid redirect.', 502);
      }
      continue;
    }

    if (!response.ok) {
      throw new PearlSourcePreviewError(`The page answered ${response.status} ${response.statusText}.`, 502);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || '';
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new PearlSourcePreviewError('This preview accepts web pages, Markdown and plain text only.', 415);
    }

    return {
      markup: await readLimitedText(response, maximumBytes),
      url: url.toString(),
    };
  }

  throw new PearlSourcePreviewError('The page redirected too many times.', 502);
}
