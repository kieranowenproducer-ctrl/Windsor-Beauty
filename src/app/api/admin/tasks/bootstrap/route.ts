// GET: everything the tasks UI needs on load. POST: pick identity / add member.
// Protected by the admin middleware (all /api/admin/* requires the admin session).
import { NextRequest, NextResponse } from 'next/server';
import { tsql, tasksConfigured, getWorkspace, listMembers, getTaskSetting, setTaskSetting } from '@/lib/tasks/db';
import { getMember, signMemberId, MEMBER_COOKIE } from '@/lib/tasks/identity';
import { retentionDaysFrom } from '@/lib/tasks/cleanup';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!tasksConfigured()) {
    return NextResponse.json({ configured: false });
  }
  const ws = await getWorkspace();
  if (!ws) return NextResponse.json({ configured: false });
  const [members, me, companies, retention] = await Promise.all([
    listMembers(ws.id),
    getMember(),
    tsql()`
      SELECT p.id, p.name,
             COUNT(t.id) FILTER (WHERE t.status <> 'done')::int AS open_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.workspace_id = ${ws.id} AND p.archived = FALSE
      GROUP BY p.id ORDER BY p.sort_order, p.created_at`,
    getTaskSetting(ws.id, 'video_retention_days'),
  ]);
  return NextResponse.json({
    configured: true, workspace: ws, members, me, companies,
    retentionDays: retentionDaysFrom(retention as string | null),
  });
}

export async function POST(req: NextRequest) {
  const ws = await getWorkspace();
  if (!ws) return NextResponse.json({ error: 'Task system not set up yet' }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  // Add a teammate (name + email), then optionally select them
  if (body.action === 'add_member') {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'A name and a valid email are required' }, { status: 400 });
    }
    const [user] = await tsql()`
      INSERT INTO task_users (email, name) VALUES (${email}, ${name})
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id` as { id: string }[];
    await tsql()`
      INSERT INTO workspace_members (workspace_id, user_id, role, notify_email)
      VALUES (${ws.id}, ${user.id}, 'staff', ${email})
      ON CONFLICT (workspace_id, user_id) DO NOTHING`;
    return NextResponse.json({ ok: true, members: await listMembers(ws.id) });
  }

  // Space management: how many days completed tasks keep their videos.
  // 0 is allowed and means "delete as soon as the task is approved and cleared"
  // (Kieran's instruction). The floor used to be 1, which made that unsettable.
  if (body.action === 'set_retention') {
    if (!Number.isFinite(Number(body.days))) return NextResponse.json({ error: 'Enter a number of days' }, { status: 400 });
    const days = Math.min(365, Math.max(0, Math.round(Number(body.days))));
    await setTaskSetting(ws.id, 'video_retention_days', String(days));
    return NextResponse.json({ ok: true, retentionDays: days });
  }

  // Select who is working at this device
  const memberId = String(body.memberId ?? '');
  const members = await listMembers(ws.id);
  const member = members.find((m) => m.id === memberId);
  if (!member) return NextResponse.json({ error: 'Unknown member' }, { status: 400 });
  const res = NextResponse.json({ ok: true, me: member });
  res.cookies.set(MEMBER_COOKIE, signMemberId(member.id), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 180, path: '/',
  });
  return res;
}
