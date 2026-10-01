// Shared media rules for task attachments (used by the upload token route
// and the client-side upload UI, so the two can never drift apart).
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // covers full-size iPhone photos
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // ~2-3 min of 1080p iPhone footage

export const isVideoType = (t?: string | null) => Boolean(t && t.startsWith('video/'));

export function fmtBytes(n?: number | null): string {
  if (!n || n <= 0) return '';
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
}
