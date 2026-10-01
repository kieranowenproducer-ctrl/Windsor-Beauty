// Client-side task media upload: validates against the shared rules, asks the
// server for a presigned Blob URL, then PUTs the file DIRECTLY to storage via
// XHR (fetch has no upload progress). The file never passes through the
// serverless function, so big videos work and a progress callback keeps slow
// mobile uploads honest.
import { IMAGE_TYPES, VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, fmtBytes } from '@/lib/tasks/media';

export interface UploadedMedia { url: string; filename: string; size: number; contentType: string }

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v', '3gp': 'video/3gpp',
};

/** Some browsers hand over files with an empty MIME type; fall back to the extension. */
export function mediaType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? '';
}

function putWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void, fallbackUrl?: string): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    // Vercel Blob validates the upload's type against the allowedContentTypes
    // baked into the presigned URL, and it reads that type from the
    // `x-content-type` header — NOT the plain `content-type` header. Sending
    // only `content-type` means Blob sees no declared type in its allow-list and
    // rejects the PUT with HTTP 400 ("Storage rejected the upload"). This was the
    // task-media upload failure on mobile. x-content-type is authoritative for
    // Blob; content-type is kept so the request body is still well-formed.
    xhr.setRequestHeader('x-content-type', contentType);
    xhr.setRequestHeader('content-type', contentType);
    // Slow mobile connections + big videos: allow up to 20 minutes of transfer,
    // then say precisely what happened rather than a generic "failed" (v3 Stage 4).
    xhr.timeout = 20 * 60 * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { url?: string };
          if (body.url) { resolve({ url: body.url }); return; }
        } catch { /* fall through to the server-derived fallback */ }
        // Storage accepted the bytes but the response was unreadable — use the
        // public URL the server derived for this exact pathname.
        if (fallbackUrl) { resolve({ url: fallbackUrl }); return; }
        reject(new Error('Storage accepted the file but returned no URL — please try again'));
      } else if (xhr.status === 403) {
        reject(new Error('The upload link expired (links last 1 hour) — try the upload again for a fresh one'));
      } else if (xhr.status === 413) {
        reject(new Error('Storage rejected the file as too large'));
      } else {
        reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}) — try again; if it keeps happening the storage service may be down`));
      }
    };
    xhr.ontimeout = () => reject(new Error('Upload timed out — the connection is too slow for a file this size. Try a smaller export (1080p instead of 4K) or better wifi'));
    xhr.onerror = () => reject(new Error('Network interrupted during the upload — check your connection and try again'));
    xhr.send(file);
  });
}

export async function uploadTaskMedia(file: File, onProgress: (pct: number) => void): Promise<UploadedMedia> {
  const type = mediaType(file);
  const isVideo = type.startsWith('video/');
  if (!isVideo && !IMAGE_TYPES.includes(type)) {
    throw new Error(`"${file.name}" is not a supported photo (JPEG, PNG, WebP, GIF) or video (.mp4, .mov, .webm)`);
  }
  if (isVideo && !VIDEO_TYPES.includes(type)) {
    throw new Error(`"${file.name}": videos must be .mp4, .mov or .webm`);
  }
  if (!isVideo && file.size > MAX_IMAGE_BYTES) {
    throw new Error(`"${file.name}" (${fmtBytes(file.size)}) is over the 10MB photo limit`);
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error(`"${file.name}" (${fmtBytes(file.size)}) is over the 200MB video limit — trim the clip or export a smaller size`);
  }

  const r = await fetch('/api/admin/tasks/upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: type, size: file.size }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.presignedUrl) {
    // Server errors carry a `stage` so failures are diagnosable, not generic.
    throw new Error(d.error ?? (r.status === 503 ? 'File storage is unavailable right now — tell Kieran' : 'Could not prepare the upload — try again'));
  }

  const done = await putWithProgress(d.presignedUrl, file, type, onProgress, d.publicUrl);
  return { url: done.url, filename: file.name, size: file.size, contentType: type };
}
