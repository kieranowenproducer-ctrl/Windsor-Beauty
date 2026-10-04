// Only current QR/leaflet output is migrated; historical records stay untouched.
const LEGACY_HOST = 'windsorbeauty\\.co\\.uk';
const OLD_ORIGIN = new RegExp('^(https?://)(www\\.)?(' + LEGACY_HOST + ')(?=$|[/:?#])', 'i');
const BARE_WEBSITE = new RegExp('^(www\\.)?' + LEGACY_HOST + '(?=$|[/:?#\\s]|[.,;!](?:$|\\s))', 'i');

export function currentQrOrigin(origin: string): string {
  return origin.replace(OLD_ORIGIN, (_match, scheme: string, www: string | undefined) =>
    scheme + (www || '') + 'windsorbeauty.is');
}

export function currentLeafletWebsite(value: string): string {
  // A saved website field can also contain custom prose. Only its leading
  // website address is migrated; unrelated URLs, their queries and prose stay exact.
  return value.replace(/^(\s*)(\S[\s\S]*)$/, (_match, whitespace: string, website: string) =>
    whitespace + (/^https?:\/\//i.test(website)
      ? currentQrOrigin(website)
      : website.replace(BARE_WEBSITE, (_host, www: string | undefined) =>
        (www || '') + 'windsorbeauty.is')));
}
