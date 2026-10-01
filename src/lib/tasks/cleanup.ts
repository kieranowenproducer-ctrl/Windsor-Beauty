// Retention cleanup for task media.
//
// Two passes, run daily off the sentinel cron:
//   1. BACKFILL — stamp an expiry on videos belonging to tasks that are done.
//   2. DELETE   — remove the expired files from Blob, leaving a text record.
//
// WHY THE BACKFILL EXISTS (the bug it fixes)
// The expiry used to be stamped in exactly one place: the admin panel's
// "Complete" button (api/admin/tasks/task/[id]/route.ts). That is not the path
// this system actually uses. Our flow is agent finishes -> colleague approves ->
// the scheduler ships, and `status='done'` is written in FIVE other places
// (task-agent/ship.mjs x4, task-agent/finish-task.mjs x1) — none of which
// stamped an expiry. Every attachment therefore sat at expires_at NULL, the
// delete pass below could never match a single row, and 0 bytes were ever
// reclaimed while ~100 MB of instruction videos piled up.
//
// Rather than stamp the expiry in six call sites and trust nobody to add a
// seventh, the backfill derives it from the task's own state. It does not matter
// which code path marked the task done, or whether that path existed when this
// was written: if a task is done and its video has no expiry, this stamps one.
// Idempotent, self-healing, and it clears the existing backlog on first run.
import { del } from '@vercel/blob';
import { tsql, tasksConfigured } from './db';

/**
 * Days a completed task's videos are kept when the workspace has no
 * `video_retention_days` setting. Zero means delete as soon as the task is
 * approved and cleared — Kieran's instruction, and the right default: once the
 * work is signed off the instruction video has served its purpose, and the
 * attachment row, its filename and the whole text history survive deletion, so
 * the record of what was asked for is not lost. Only the heavy file goes.
 */
export const DEFAULT_VIDEO_RETENTION_DAYS = 0;

/**
 * The one place a stored `video_retention_days` is turned into a number.
 *
 * It exists because every caller had written `Number(value ?? '30') || 30`, and
 * 0 is falsy — so `0 || 30` is 30, and "delete immediately" was the single value
 * that could not survive being read. That bug was in the completion path AND in
 * both routes that report the setting back to the admin screen, which would have
 * cheerfully displayed "30 days" while the stored setting said 0.
 */
export function retentionDaysFrom(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_VIDEO_RETENTION_DAYS;
}

export interface CleanupResult {
  /** Videos given an expiry by this run (previously NULL on a done task). */
  backfilled: number;
  checked: number;
  removed: number;
  /** Bytes reclaimed from Blob storage by this run. */
  bytesFreed: number;
  errors: number;
}

export async function cleanupExpiredTaskMedia(): Promise<CleanupResult> {
  const result: CleanupResult = { backfilled: 0, checked: 0, removed: 0, bytesFreed: 0, errors: 0 };
  if (!tasksConfigured()) return result;

  // ── Pass 1: backfill ───────────────────────────────────────────────────────
  // Deliberately runs even without Blob credentials: stamping an expiry is a
  // database-only operation, so the moment a token IS present the delete pass
  // has work queued rather than starting from zero.
  //
  // Dated from completed_at, not NOW(), so a task finished weeks ago expires
  // immediately instead of being handed a fresh window by this deploy. Photos
  // and text history are untouched on purpose — they are the permanent record
  // and cost almost nothing; the videos are ~99% of the storage.
  const backfilled = await tsql()`
    UPDATE task_attachments a
    SET expires_at = COALESCE(t.completed_at, NOW())
      + make_interval(days => COALESCE(
          (SELECT NULLIF(s.value, '')::int FROM task_settings s
            WHERE s.workspace_id = t.workspace_id AND s.key = 'video_retention_days'),
          ${DEFAULT_VIDEO_RETENTION_DAYS}
        ))
    FROM tasks t
    WHERE a.task_id = t.id
      AND t.status = 'done'
      AND a.removed_at IS NULL
      AND a.expires_at IS NULL
      AND a.content_type LIKE 'video/%'
    RETURNING a.id` as { id: string }[];
  result.backfilled = backfilled.length;

  // ── Pass 2: delete ─────────────────────────────────────────────────────────
  // Needs Blob credentials. Without them we stop here having still backfilled,
  // so nothing is lost — the next run with a token clears the queue.
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return result;

  const expired = await tsql()`
    SELECT id, task_id, url, filename, size_bytes
    FROM task_attachments
    WHERE removed_at IS NULL AND expires_at IS NOT NULL AND expires_at < NOW()
    LIMIT 50` as { id: string; task_id: string; url: string; filename: string; size_bytes: number | null }[];
  result.checked = expired.length;

  for (const att of expired) {
    try {
      await del(att.url);
      await tsql()`
        UPDATE task_attachments
        SET removed_at = NOW(), removed_note = 'Removed automatically after the retention period'
        WHERE id = ${att.id}`;
      await tsql()`
        INSERT INTO task_activity_log (workspace_id, task_id, actor_id, action, detail)
        SELECT t.workspace_id, t.id, NULL, 'attachment_expired', ${JSON.stringify({ filename: att.filename })}::jsonb
        FROM tasks t WHERE t.id = ${att.task_id}`.catch(() => {});
      result.removed++;
      result.bytesFreed += Number(att.size_bytes ?? 0);
    } catch {
      result.errors++; // leave the row untouched; tomorrow's pass retries
    }
  }
  return result;
}
