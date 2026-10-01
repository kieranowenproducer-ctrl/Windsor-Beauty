// Agent-only endpoint: the local task-agent posts a finished DRAFT image onto a
// task as an attachment, so a human can download it, check the label reads
// correctly, and then place it manually in the Products panel. NOTHING here
// touches the live shop — it only writes to the task board.
//
// Why a dedicated endpoint: the agent runs on Kieran's PC and cannot reach this
// project's OIDC-authenticated Blob storage directly. This route runs inside the
// deployed app (where Blob access is resolved at request time), receives the
// image over a bearer-secret-gated POST, stores it, and records the attachment.
// Auth is a shared secret (AGENT_TASK_SECRET), matching the CRON_SECRET pattern —
// deliberately NOT the human member-cookie identity the browser uses.
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { tsql } from '@/lib/tasks/db';
import { IMAGE_TYPES, VIDEO_TYPES } from '@/lib/tasks/media';

export const dynamic = 'force-dynamic';

// Direct put() goes through the serverless function, so stay under Vercel's
// ~4.5MB request-body ceiling. Draft images are ~1.5MB and agent screen
// recordings are compressed to fit; large HUMAN video uploads (up to 200MB)
// still use the presigned /upload route from the browser instead.
const MAX_BYTES = 4 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

export async function POST(request: Request) {
  const secret = process.env.AGENT_TASK_SECRET;
  if (!secret) return NextResponse.json({ error: 'AGENT_TASK_SECRET not configured' }, { status: 503 });
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return NextResponse.json({ error: 'File storage is not configured (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID).' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const taskId = String(form?.get('taskId') ?? '').trim();
  const note = String(form?.get('note') ?? '').trim();
  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Provide a file in the "file" field.' }, { status: 400 });
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!IMAGE_TYPES.includes(file.type) && !isVideo) return NextResponse.json({ error: 'Upload an image (JPEG, PNG, WebP, GIF) or a video (MP4, WebM, MOV).' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `File is too large (max 4MB for the agent path; compress ${isVideo ? 'the recording' : 'the image'} first).` }, { status: 400 });

  // The task must exist; we need its workspace for the activity log.
  const rows = await tsql()`SELECT id, workspace_id FROM tasks WHERE id = ${taskId}` as { id: string; workspace_id: string }[];
  const task = rows[0];
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const rawName = String(form?.get('filename') ?? (isVideo ? 'recording' : 'draft')).replace(/[^\w.\- ]+/g, '_').slice(0, 100);
  const ext = EXT[file.type];
  const filename = rawName.toLowerCase().endsWith(`.${ext}`) ? rawName : `${rawName}.${ext}`;

  let url: string;
  try {
    const blob = await put(`tasks/agent/${crypto.randomUUID()}.${ext}`, file, { access: 'public', contentType: file.type });
    url = blob.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.toLowerCase().includes('private store')) {
      return NextResponse.json({ error: 'The Blob store is private; task media needs a public store.' }, { status: 503 });
    }
    return NextResponse.json({ error: message || 'Failed to store the image.' }, { status: 502 });
  }

  // Record the attachment (uploaded_by NULL = the agent, mirroring its NULL-author
  // internal comments). kind='evidence' marks agent-supplied proof; the caption
  // is the per-file explanation shown next to it in the review drawer.
  const caption = note || null;
  const [att] = await tsql()`
    INSERT INTO task_attachments (task_id, filename, url, size_bytes, content_type, uploaded_by, kind, caption)
    VALUES (${task.id}, ${filename}, ${url}, ${file.size}, ${file.type}, NULL, 'evidence', ${caption})
    RETURNING id` as { id: string }[];

  const body = note || (isVideo
    ? 'Screen recording attached by the agent as evidence. Play it in the task to see the workflow end to end.'
    : 'Draft product image attached by the agent. Download it, check the label reads correctly (product name, dosage, purity), then place it manually in the Products panel when you are happy. This has NOT been added to the shop.');
  // 🧾 prefix groups it with the agent's evidence notes in the drawer.
  const threadBody = /^(🤖|🧾|✅|🚀|⚠️)/.test(body) ? body : `🧾 ${body}`;
  await tsql()`INSERT INTO task_comments (task_id, author_id, body, internal_only) VALUES (${task.id}, NULL, ${threadBody}, TRUE)`;
  await tsql()`INSERT INTO task_activity_log (workspace_id, task_id, actor_id, action, detail)
               VALUES (${task.workspace_id}, ${task.id}, NULL, 'attachment_added', ${JSON.stringify({ filename, by: 'agent' })}::jsonb)`;

  return NextResponse.json({ ok: true, url, attachmentId: att.id });
}
