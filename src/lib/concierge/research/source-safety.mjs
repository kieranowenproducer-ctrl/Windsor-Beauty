const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^0(?:\.0){3}$/,
  /^127(?:\.\d{1,3}){3}$/,
  /^10(?:\.\d{1,3}){3}$/,
  /^169\.254(?:\.\d{1,3}){2}$/,
  /^192\.168(?:\.\d{1,3}){2}$/,
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

function parseIpv4(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((part) => part >= 0 && part <= 255) ? octets : null;
}

/**
 * Refuse addresses that can reach the machine itself or a private network.
 * This is deliberately dependency-free because the link validator is also
 * used by the browser form. The server performs a second check after DNS.
 */
export function isPrivateOrLocalAddress(value) {
  let address = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  address = address.split('%')[0];

  if (address.startsWith('::ffff:')) {
    const mapped = address.slice(7);
    const mappedV4 = parseIpv4(mapped);
    if (mappedV4) address = mapped;
    else {
      const words = mapped.split(':');
      if (words.length === 2 && words.every((word) => /^[0-9a-f]{1,4}$/.test(word))) {
        address = `${Number.parseInt(words[0], 16) >> 8}.${Number.parseInt(words[0], 16) & 255}.${Number.parseInt(words[1], 16) >> 8}.${Number.parseInt(words[1], 16) & 255}`;
      }
    }
  }

  const ipv4 = parseIpv4(address);
  if (ipv4) {
    const [a, b] = ipv4;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }

  if (!address.includes(':')) return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(address));
  if (address === '::' || address === '::1') return true;
  const firstWord = Number.parseInt(address.split(':')[0] || '0', 16);
  return (firstWord & 0xfe00) === 0xfc00 || (firstWord & 0xffc0) === 0xfe80;
}

/* Kieran, 18 Aug 2026: typing "www.example.com" was rejected until you put
   https:// in front of it, on every single source. A website address with no
   scheme is not ambiguous here - this field only ever takes a public web page -
   so we assume https and carry on. A scheme that IS typed is left exactly as
   typed, so "http://..." still fails the secure-link check below rather than
   being silently upgraded to https. */
function withAssumedScheme(text) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  return `https://${text.replace(/^\/+/, "")}`;
}

export function validatePearlSourceUrl(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2048) {
    return { ok: false, error: "Enter a secure link of no more than 2,048 characters." };
  }

  let url;
  try {
    url = new URL(withAssumedScheme(text));
  } catch {
    return { ok: false, error: "Enter a complete website link." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Use a secure https link." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Remove the username or password from this link." };
  }
  if (isPrivateOrLocalAddress(url.hostname)) {
    return { ok: false, error: "Private or local network links cannot be added." };
  }
  if (!url.hostname.includes(".") || url.hostname.length > 253) {
    return { ok: false, error: "Enter a public website link." };
  }

  url.hash = "";
  return { ok: true, url: url.toString() };
}
