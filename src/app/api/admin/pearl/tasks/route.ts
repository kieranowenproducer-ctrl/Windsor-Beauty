import { NextResponse } from 'next/server';
import { createPearlTask } from '@/lib/pearl/taskBridge';
import { isDbConfigured } from '@/lib/db';
import { pearlActor, recordPearlChange } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 5000) : '';
  const priority = ['low', 'medium', 'high', 'urgent'].includes(String(body.priority))
    ? String(body.priority) as 'low' | 'medium' | 'high' | 'urgent'
    : 'medium';
  if (!title) return NextResponse.json({ error: 'Give the task a clear title.' }, { status: 400 });
  try {
    const task = await createPearlTask({ title, description, priority });
    if (isDbConfigured()) {
      const actor = await pearlActor();
      await recordPearlChange({
        changeType: 'task_created', entityType: 'task', entityId: task.id,
        summary: `Created Pearl task “${task.title.replace(/^PEARL:\s*/i, '')}”.`, actor,
        detail: { taskNumber: task.task_number, priority },
      });
    }
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create the task.' }, { status: 409 });
  }
}
