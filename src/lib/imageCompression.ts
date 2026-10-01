// Client-side resize/re-encode before an admin image upload. Modern iPhone
// camera photos routinely land in the 3-8MB range, well above what Vercel's
// Node serverless functions accept as a request body (~4.5MB, platform-level
// — our own MAX_BYTES checks in the upload routes are below that for
// headroom). Shrinking oversized photos here, before they ever hit the
// network, avoids that hard failure and meaningfully shortens upload time on
// cellular, which also narrows the window for a user to tap Save before the
// upload resolves.
//
// True zero-compression direct-to-Blob uploads (bypassing the serverless
// body limit entirely) would need a long-lived BLOB_READ_WRITE_TOKEN env var
// — this project's Blob store is currently connected via Vercel's short-lived
// OIDC credentials instead, which @vercel/blob's client-token signing does
// not support. Until/unless that token is added, this is the closest
// available approximation: resolution and quality are set high enough that
// the difference is not visible anywhere the site actually displays a
// photo, while staying safely under the platform ceiling.
const MAX_DIMENSION = 3000;
const JPEG_QUALITY = 0.92;
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;

export async function compressImageFile(file: File): Promise<File> {
  if (typeof window === 'undefined' || file.size <= SKIP_BELOW_BYTES || file.type === 'image/webp') {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 4 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    // Any unsupported-API or decode failure just falls back to the original
    // file — the upload route's own size/type checks still apply.
    return file;
  }
}
