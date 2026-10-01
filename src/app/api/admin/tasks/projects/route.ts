import { NextRequest, NextResponse } from 'next/server';
import { tsql, getWorkspace, logActivity } from '@/lib/tasks/db';
import { getMember } from '@/lib/tasks/identity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const [ws, me] = await Promise.all([getWorkspace(), getMember()]);
  if (!ws || !me) return NextResponse.json({ error: 'Pick who you are first' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  const [project] = await tsql()`
    INSERT INTO projects (workspace_id, name, description)
    VALUES (${ws.id}, ${name}, ${String(body.description ?? '').trim() || null})
    RETURNING id, name, description` as { id: string; name: string; description: string | null }[];
  await logActivity(ws.id, null, me.id, 'project_created', { project: name });
  return NextResponse.json({ ok: true, project });
}
