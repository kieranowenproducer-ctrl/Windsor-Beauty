// Agent-only endpoint: run the task-media retention sweep now.
//
// Why this exists: Kieran wants a task's instruction videos deleted as soon as
// the work is approved and cleared, not "some time tomorrow". Approval lands via
// the colleague's Approve, after which the local scheduler (task-agent/ship.mjs)
// marks the task done — and that scheduler runs on Kieran's PC, which cannot
// reach this project's OIDC-authenticated Blob storage. So it calls this route
// instead, which runs inside the deployed app where Blob access resolves at
// request time. Same shape and same shared-secret auth as agent-attach.
//
// Named agent-* to match the other bearer-secret endpoints, and it must also be
// listed in AGENT_BEARER_ROUTES in proxy.ts — otherwise the admin-cookie
// gate 401s the request before this handler ever runs.
//
// The nightly sentinel cron still calls the identical function, as a backstop
// for anything this misses (a failed call, a task completed by some other path).
// Running twice is harmless: the sweep is idempotent and only ever acts on rows
// that are already expired and not yet removed.
import { NextResponse } from 'next/server';
import { cleanupExpiredTaskMedia } from '@/lib/tasks/cleanup';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.AGENT_TASK_SECRET;
  if (!secret) return NextResponse.json({ error: 'AGENT_TASK_SECRET not configured' }, { status: 503 });
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await cleanupExpiredTaskMedia();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 }
    );
  }
}
