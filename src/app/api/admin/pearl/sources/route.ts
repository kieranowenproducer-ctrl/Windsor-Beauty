import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { createPearlSource, pearlActor, recordPearlChange, updatePearlSourceTask } from '@/lib/db/pearlAdmin';
import { createPearlTask } from '@/lib/pearl/taskBridge';
import { validatePearlSourceUrl } from '@/lib/concierge/research/source-safety.mjs';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
  const checked = validatePearlSourceUrl(body.url);
  if (!name) return NextResponse.json({ error: 'Give this source a clear name.' }, { status: 400 });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const safeUrl = String(checked.url);

  try {
    const actor = await pearlActor();
    const source = await createPearlSource({ name, url: safeUrl, notes, actor });
    let task = null;
    let taskWarning = '';
    try {
      /* Not a review task. The decision to include this source is already made
         by the person who added it, and re-asking it is exactly what the
         "Samuel decides what goes into PEARL" rule removes. What is left is the
         reading work, which is a build job, so the task says so and carries
         everything that job needs. */
      task = await createPearlTask({
        title: `Read this source into PEARL: ${name}`,
        description: [
          'Area: Pearl knowledge source',
          `Source: ${safeUrl}`,
          notes ? `Note from whoever added it: ${notes}` : '',
          '',
          'This source is accepted. It is not waiting for a decision and must not be argued back.',
          'The work is to read it into the library, in full:',
          '',
          '1. Add a READER_SETTINGS entry in scripts/source-reader-settings.mjs (where its pages live, and which part of a page is which field).',
          '2. Add the source definition and its reader to the explicit list in main() in scripts/build-research-evidence.mjs. A definition on its own does nothing.',
          '3. Prove it alone first: npm run source:try -- <sourceId>',
          '4. Rebuild the library, attended, then npm run pearl:check to see what moved.',
          '',
          'In full means in full. Do not take half a site.',
        ].filter(Boolean).join('\n'),
        priority: 'medium',
      });
      await updatePearlSourceTask(source.id, task.id);
    } catch (error) {
      taskWarning = error instanceof Error ? error.message : 'The review task could not be created.';
    }
    await recordPearlChange({
      changeType: 'source_submitted', entityType: 'source', entityId: source.id,
      summary: `Added “${name}” as a PEARL source.`, actor,
      detail: { url: safeUrl, taskId: task?.id || null, taskWarning: taskWarning || null },
    });
    return NextResponse.json({ source: { ...source, task_id: task?.id || null }, task, taskWarning });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') return NextResponse.json({ error: 'That source has already been added.' }, { status: 409 });
    console.error('[admin/pearl/sources] POST failed:', error);
    return NextResponse.json({ error: 'Could not add this source.' }, { status: 500 });
  }
}
