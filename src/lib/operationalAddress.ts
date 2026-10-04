// Only current Beauty settings and public copy use this conversion. Never apply
// it to customer addresses, order history, provider events or archived messages.
export function beautyOperationalAddress(value: string): string;
export function beautyOperationalAddress(value: string | undefined): string | undefined;
export function beautyOperationalAddress(value: string | undefined): string | undefined {
  // Treat each URL as one token. A domain in another site's path or query is
  // data belonging to that site, not a hostname we own.
  return value?.replace(/[^\s<>"']+/g, token => {
    const start = token.match(/^([([{]*)(.*)$/)!;
    const prefix = start[1];
    const address = start[2];
    const website = /^(https?:\/\/|\/\/)?(www\.)?windsorbeauty\.co\.uk(?=$|[/?#]|:\d+(?=$|[/?#])|[.,;!)}\]](?:$|[)}\]]))/i;
    if (website.test(address)) {
      if (/^(?:https?:\/\/|\/\/)/i.test(address) || /^.+?:\d/.test(address)) {
        try {
          const parsed = new URL(address.startsWith('//') ? 'https:' + address : /^https?:/i.test(address) ? address : 'https://' + address);
          if (!['windsorbeauty.co.uk', 'www.windsorbeauty.co.uk'].includes(parsed.hostname.toLowerCase()) || parsed.username || parsed.password) return token;
        } catch { return token; }
      }
      return prefix + address.replace(website, (_host, scheme: string | undefined, www: string | undefined) =>
        (scheme || '') + (www || '') + 'windsorbeauty.is');
    }
    // Mailbox lists are allowed, but unrelated URLs never enter this branch.
    const mailboxList = /^(?:[\w.+-]+@[\w.-]+[;,]?)+[.)}\]]*$/;
    if (/^mailto:/i.test(address)) {
      return prefix + address.replace(/^(mailto:[\w.+-]+@)windsorbeauty\.co\.uk(?=$|[?])/i, '$1windsorbeauty.is');
    }
    if (mailboxList.test(address)) {
      return prefix + address.replace(/(^|[;,])([\w.+-]+)@windsorbeauty\.co\.uk(?=$|[;,)}\]]|\.$)/gi,
        '$1$2@windsorbeauty.is');
    }
    return token;
  });
}
