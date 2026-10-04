// Only current Beauty settings and public copy use this conversion. Never apply
// it to customer addresses, order history, provider events or archived messages.
export function beautyOperationalAddress(value: string): string;
export function beautyOperationalAddress(value: string | undefined): string | undefined;
export function beautyOperationalAddress(value: string | undefined): string | undefined {
  return value?.replace(/(?<![a-z0-9._-])(www\.)?windsorbeauty\.co\.uk(?![a-z0-9_-]|\.[a-z0-9])/gi, '$1windsorbeauty.is');
}
