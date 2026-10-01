import { ensureSchema } from './schema';
import { requireDb } from './client';

export type PearlReviewStatus = 'unreviewed' | 'good' | 'needs_improvement';
export type PearlSourceStatus =
  /* Accepted on arrival: there is no approval gate. 'waiting' is only still
     here so rows written before 19 Aug 2026 typecheck; nothing creates one. */
  | 'accepted'
  | 'waiting'
  | 'processing'
  | 'needs_review'
  | 'ready'
  | 'added'
  | 'update_available'
  | 'failed'
  | 'rejected'
  | 'disabled';

export interface PearlSourceRow {
  id: number;
  name: string;
  url: string;
  notes: string | null;
  status: PearlSourceStatus;
  task_id: string | null;
  submitted_by: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PearlHistoryRow {
  id: number;
  change_type: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  detail: unknown;
  actor: string | null;
  created_at: string;
}

export interface PearlTestCaseRow {
  id: number;
  question: string;
  expected_outcome: string;
  status: 'draft' | 'active' | 'retired';
  source_question_id: number | null;
  last_result: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function missingPearlSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  // 42P01 missing table, 42703 missing column, 23514 check violation. The
  // last one is here because widening a CHECK list (new proposal kinds) only
  // lands on a live database when ensureSchema runs; the first insert with a
  // new kind trips the stale constraint, ensureSchema refreshes it, and the
  // retry succeeds. A genuinely invalid value still fails on the retry.
  return code === '42P01' || code === '42703' || code === '23514';
}

export async function withPearlSchema<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!missingPearlSchema(error)) throw error;
    await ensureSchema();
    return work();
  }
}

export async function pearlActor(): Promise<string> {
  try {
    const { getMember } = await import('@/lib/tasks/identity');
    const member = await getMember();
    return member?.name?.trim() || 'Windsor Glow admin';
  } catch {
    return 'Windsor Glow admin';
  }
}

export async function recordPearlChange(params: {
  changeType: string;
  entityType: string;
  entityId?: string | number | null;
  summary: string;
  detail?: Record<string, unknown>;
  actor?: string | null;
}): Promise<void> {
  const db = requireDb();
  const detail = JSON.stringify(params.detail || {});
  await withPearlSchema(async () => {
    await db`
      INSERT INTO pearl_change_history
        (change_type, entity_type, entity_id, summary, detail, actor)
      VALUES
        (${params.changeType}, ${params.entityType}, ${params.entityId == null ? null : String(params.entityId)},
         ${params.summary.slice(0, 500)}, ${detail}::jsonb, ${params.actor || null})
    `;
  });
}

export async function reviewPearlQuestion(params: {
  id: number;
  status: Exclude<PearlReviewStatus, 'unreviewed'>;
  note?: string | null;
  taskId?: string | null;
  actor: string;
}) {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    UPDATE research_chat_log SET
      review_status = ${params.status},
      review_note = ${params.note?.trim().slice(0, 2000) || null},
      reviewed_by = ${params.actor},
      reviewed_at = now(),
      linked_task_id = COALESCE(${params.taskId || null}, linked_task_id)
    WHERE id = ${params.id}
    RETURNING id, question, review_status, review_note, reviewed_by, reviewed_at, linked_task_id
  `);
  return rows[0] || null;
}

export async function createPearlSource(params: {
  name: string;
  url: string;
  notes?: string | null;
  actor: string;
}): Promise<PearlSourceRow> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    INSERT INTO pearl_sources (name, url, notes, submitted_by)
    VALUES (${params.name}, ${params.url}, ${params.notes?.trim().slice(0, 2000) || null}, ${params.actor})
    RETURNING *
  `);
  return rows[0] as PearlSourceRow;
}

export async function updatePearlSourceTask(id: number, taskId: string) {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    UPDATE pearl_sources SET task_id = ${taskId}, updated_at = now()
    WHERE id = ${id} AND archived_at IS NULL
    RETURNING *
  `);
  return (rows[0] as PearlSourceRow | undefined) || null;
}

export async function listPearlSources(limit = 50): Promise<PearlSourceRow[]> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    SELECT id, name, url, notes, status, task_id, submitted_by, error_message, created_at, updated_at
    FROM pearl_sources
    WHERE archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rows as PearlSourceRow[];
}

export async function listPearlHistory(limit = 80): Promise<PearlHistoryRow[]> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    SELECT id, change_type, entity_type, entity_id, summary, detail, actor, created_at
    FROM pearl_change_history
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rows as PearlHistoryRow[];
}

/** When `proposalId` is set the row is stamped with it under a uniqueness
 *  rule, so a retried approval finds its earlier test instead of writing a
 *  second copy — the retry returns null and nothing is duplicated. */
export async function createPearlTestCase(params: {
  question: string;
  expectedOutcome: string;
  sourceQuestionId?: number | null;
  proposalId?: number | null;
  actor: string;
}): Promise<PearlTestCaseRow | null> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    INSERT INTO pearl_test_cases (question, expected_outcome, source_question_id, proposal_id, created_by)
    VALUES (${params.question.slice(0, 2000)}, ${params.expectedOutcome.slice(0, 4000)},
            ${params.sourceQuestionId || null}, ${params.proposalId || null}, ${params.actor})
    ON CONFLICT (proposal_id) WHERE proposal_id IS NOT NULL DO NOTHING
    RETURNING *
  `);
  return (rows[0] as PearlTestCaseRow) || null;
}

/** Store the result of running one saved test. `lastResult` is the JSON the
 *  shared snapshot module produces; it carries the accepted picture forward. */
export async function updatePearlTestCaseResult(id: number, lastResult: string): Promise<void> {
  const db = requireDb();
  await withPearlSchema(() => db`
    UPDATE pearl_test_cases SET last_result = ${lastResult.slice(0, 8000)}, updated_at = now()
    WHERE id = ${id}
  `);
}

/** Insert starter tests, skipping any question already saved (case-insensitive).
 *  Returns the rows actually inserted. */
export async function seedPearlTestCases(
  seeds: Array<{ question: string; expectedOutcome: string }>,
  actor: string,
): Promise<PearlTestCaseRow[]> {
  const db = requireDb();
  const inserted: PearlTestCaseRow[] = [];
  await withPearlSchema(async () => {
    for (const seed of seeds) {
      const rows = await db`
        INSERT INTO pearl_test_cases (question, expected_outcome, created_by)
        SELECT ${seed.question.slice(0, 2000)}, ${seed.expectedOutcome.slice(0, 4000)}, ${actor}
        WHERE NOT EXISTS (
          SELECT 1 FROM pearl_test_cases WHERE lower(question) = lower(${seed.question.slice(0, 2000)})
        )
        RETURNING *
      `;
      if (rows[0]) inserted.push(rows[0] as PearlTestCaseRow);
    }
  });
  return inserted;
}

/** Retired tests are left out: the runner already selects only 'active' ones,
 *  so listing them would show rows that never run again. Nothing is lost - the
 *  retirement, with the question, is kept in the change history. */
export async function listPearlTestCases(limit = 50): Promise<PearlTestCaseRow[]> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    SELECT id, question, expected_outcome, status, source_question_id, last_result, created_by, created_at, updated_at
    FROM pearl_test_cases
    WHERE status <> 'retired'
    ORDER BY status = 'active' DESC, updated_at DESC
    LIMIT ${limit}
  `);
  return rows as PearlTestCaseRow[];
}

export interface PearlCitationOverrideRow {
  id: number;
  compound_slug: string;
  action: 'remove' | 'add';
  url: string;
  label: string | null;
  detail: string | null;
  reason: string | null;
  proposal_id: number | null;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
}

/** Written ONLY by approving a citation_correction proposal (see the
 *  proposals decide route). Suggesting a correction never touches this. */
export async function createPearlCitationOverride(params: {
  compoundSlug: string;
  action: 'remove' | 'add';
  url: string;
  label?: string | null;
  detail?: string | null;
  reason?: string | null;
  proposalId?: number | null;
  actor: string;
}): Promise<PearlCitationOverrideRow | null> {
  const db = requireDb();
  /* The proposal-id stamp is unique, so a retried approval cannot write the
     same correction twice — the retry simply finds nothing to insert. */
  const rows = await withPearlSchema(() => db`
    INSERT INTO pearl_citation_overrides (compound_slug, action, url, label, detail, reason, proposal_id, created_by)
    VALUES (${params.compoundSlug}, ${params.action}, ${params.url.slice(0, 2000)},
            ${params.label?.slice(0, 300) || null}, ${params.detail?.slice(0, 500) || null},
            ${params.reason?.slice(0, 2000) || null}, ${params.proposalId || null}, ${params.actor})
    ON CONFLICT (proposal_id) WHERE proposal_id IS NOT NULL DO NOTHING
    RETURNING *
  `);
  return (rows[0] as PearlCitationOverrideRow) || null;
}

/** Approved citation corrections in the runtime shape the answer engine
 *  reads. They travel in the same records array as approved wording (the
 *  member desk already fetches and forwards it), under recordType
 *  "citation", which the terminology resolver ignores. */
export async function listApprovedPearlCitationRecords(): Promise<Array<Record<string, unknown>>> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    SELECT * FROM pearl_citation_overrides
    WHERE enabled = TRUE AND archived_at IS NULL
    ORDER BY id ASC
  `) as PearlCitationOverrideRow[];
  return rows.map((row) => ({
    id: `citation-${row.id}`,
    recordType: 'citation',
    reviewStatus: 'approved',
    enabled: true,
    compoundSlug: row.compound_slug,
    action: row.action,
    url: row.url,
    label: row.label,
    detail: row.detail,
  }));
}

/** How many proposals are waiting for a decision. On the Overview this is
 *  the one number that says "someone needs to approve or reject work". */
export async function countWaitingPearlProposals(): Promise<number> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    SELECT COUNT(*)::int AS waiting FROM pearl_proposals WHERE status = 'proposed'
  `) as Array<{ waiting: number }>;
  return rows[0]?.waiting ?? 0;
}

/* ---- Answer layouts (Kieran's feature, 18 Aug 2026) ---- */

export interface PearlLayoutBlock {
  type: 'section' | 'custom' | 'rest';
  title?: string;
  hidden?: boolean;
  id?: string;
  heading?: string;
  text?: string;
  approved?: boolean;
}

export interface PearlLayoutRow {
  id: number;
  name: string;
  blocks: PearlLayoutBlock[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface PearlLayoutAssignmentRow {
  id: number;
  layout_id: number;
  target_kind: 'compound' | 'category';
  target_value: string;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
}

export async function listPearlLayouts(): Promise<{ layouts: PearlLayoutRow[]; assignments: PearlLayoutAssignmentRow[] }> {
  const db = requireDb();
  const [layouts, assignments] = await withPearlSchema(() => Promise.all([
    db`SELECT * FROM pearl_answer_layouts WHERE archived_at IS NULL ORDER BY updated_at DESC`,
    db`SELECT a.* FROM pearl_layout_assignments a
       JOIN pearl_answer_layouts l ON l.id = a.layout_id
       WHERE l.archived_at IS NULL ORDER BY a.id ASC`,
  ]));
  return { layouts: layouts as PearlLayoutRow[], assignments: assignments as PearlLayoutAssignmentRow[] };
}

/** Save a layout. The approval discipline is enforced HERE, not trusted from
 *  the browser: a custom block keeps its approved flag only when its words
 *  are byte-identical to the already-saved approved version. New or edited
 *  words always come back unapproved, and the caller files a proposal for
 *  each of them. Returns the pending custom blocks so it can. */
export async function savePearlLayout(
  params: { id?: number | null; name: string; blocks: unknown },
  actor: string,
): Promise<{ layout: PearlLayoutRow; pending: PearlLayoutBlock[] }> {
  const db = requireDb();
  const existing = params.id
    ? ((await withPearlSchema(() => db`SELECT * FROM pearl_answer_layouts WHERE id = ${params.id} AND archived_at IS NULL`)) as PearlLayoutRow[])[0] || null
    : null;
  if (params.id && !existing) throw new Error('No layout has that id.');
  const previous = new Map<string, PearlLayoutBlock>(
    (existing?.blocks || []).filter((block) => block.type === 'custom' && block.id).map((block) => [block.id!, block]),
  );

  const clean: PearlLayoutBlock[] = [];
  const pending: PearlLayoutBlock[] = [];
  let sawRest = false;
  let counter = 0;
  for (const raw of Array.isArray(params.blocks) ? params.blocks : []) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as PearlLayoutBlock;
    if (block.type === 'section' && String(block.title || '').trim()) {
      clean.push({ type: 'section', title: String(block.title).trim().slice(0, 200), ...(block.hidden ? { hidden: true } : {}) });
    } else if (block.type === 'rest' && !sawRest) {
      sawRest = true;
      clean.push({ type: 'rest' });
    } else if (block.type === 'custom') {
      const text = String(block.text || '').trim().slice(0, 2000);
      if (!text) continue;
      counter += 1;
      const id = String(block.id || '').trim() || `c${Date.now().toString(36)}-${counter}`;
      const heading = String(block.heading || '').trim().slice(0, 200);
      const prior = previous.get(id);
      const unchanged = Boolean(prior && prior.text === text && String(prior.heading || '') === heading);
      const approved = unchanged && prior?.approved === true;
      const saved: PearlLayoutBlock = { type: 'custom', id, heading, text, approved };
      clean.push(saved);
      if (!approved) pending.push(saved);
    }
  }

  const encoded = JSON.stringify(clean);
  const name = params.name.trim().slice(0, 200) || 'Untitled layout';
  const rows = existing
    ? await withPearlSchema(() => db`
        UPDATE pearl_answer_layouts SET name = ${name}, blocks = ${encoded}::jsonb, updated_by = ${actor}, updated_at = now()
        WHERE id = ${existing.id} RETURNING *
      `)
    : await withPearlSchema(() => db`
        INSERT INTO pearl_answer_layouts (name, blocks, created_by, updated_by)
        VALUES (${name}, ${encoded}::jsonb, ${actor}, ${actor}) RETURNING *
      `);
  return { layout: rows[0] as PearlLayoutRow, pending };
}

export async function setPearlLayoutAssignment(
  params: { layoutId: number; targetKind: 'compound' | 'category'; targetValue: string; enabled: boolean },
  actor: string,
): Promise<PearlLayoutAssignmentRow> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    INSERT INTO pearl_layout_assignments (layout_id, target_kind, target_value, enabled, created_by)
    VALUES (${params.layoutId}, ${params.targetKind}, ${params.targetValue.trim().slice(0, 200)}, ${params.enabled}, ${actor})
    ON CONFLICT (layout_id, target_kind, target_value)
    DO UPDATE SET enabled = EXCLUDED.enabled
    RETURNING *
  `);
  return rows[0] as PearlLayoutAssignmentRow;
}

export async function deletePearlLayoutAssignment(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`DELETE FROM pearl_layout_assignments WHERE id = ${id} RETURNING id`);
  return rows.length > 0;
}

/** Executed by approving a layout_text proposal. The words must still match
 *  the proposal exactly - if the layout was edited since, nothing happens
 *  and the caller reports it honestly. */
export async function approvePearlLayoutText(layoutId: number, blockId: string, text: string): Promise<boolean> {
  const db = requireDb();
  const rows = (await withPearlSchema(() => db`
    SELECT * FROM pearl_answer_layouts WHERE id = ${layoutId} AND archived_at IS NULL
  `)) as PearlLayoutRow[];
  const layout = rows[0];
  if (!layout) return false;
  let matched = false;
  const blocks = (layout.blocks || []).map((block) => {
    if (block.type === 'custom' && block.id === blockId && String(block.text || '') === text) {
      matched = true;
      return { ...block, approved: true };
    }
    return block;
  });
  if (!matched) return false;
  await withPearlSchema(() => db`
    UPDATE pearl_answer_layouts SET blocks = ${JSON.stringify(blocks)}::jsonb, updated_at = now()
    WHERE id = ${layoutId}
  `);
  return true;
}

/** Live layouts in the runtime shape the answer engine reads. Only switched-on
 *  assignments travel, and unapproved custom words are stripped before the
 *  record ever leaves the server - members cannot receive them at all. */
export async function listApprovedPearlLayoutRecords(): Promise<Array<Record<string, unknown>>> {
  const db = requireDb();
  const rows = await withPearlSchema(() => db`
    SELECT a.id AS assignment_id, a.target_kind, a.target_value, l.name, l.blocks
    FROM pearl_layout_assignments a
    JOIN pearl_answer_layouts l ON l.id = a.layout_id
    WHERE a.enabled = TRUE AND l.archived_at IS NULL
    ORDER BY a.id ASC
  `) as Array<{ assignment_id: number; target_kind: string; target_value: string; name: string; blocks: PearlLayoutBlock[] }>;
  return rows.map((row) => ({
    id: `layout-${row.assignment_id}`,
    recordType: 'layout',
    reviewStatus: 'approved',
    enabled: true,
    targetKind: row.target_kind,
    targetValue: row.target_kind === 'category' ? row.target_value.toLowerCase() : row.target_value,
    name: row.name,
    blocks: (row.blocks || []).filter((block) => block.type !== 'custom' || block.approved === true),
  }));
}
