import { requireDb } from './client';

// Append-only record of every question asked in PEARL, with the
// answer that was given, read by /admin/research-questions.
// See ensureSchema() for the table.
//
// Why this exists: PEARL answers inside the member's own browser, so
// before this nothing anywhere knew a single question had ever been asked. Kieran
// wants the questions kept against the member who asked them, so we can see what
// members actually want to know, spot trends, and use real questions to improve
// the tool.
//
// ADMIN ONLY. Nothing here is ever returned to a customer, including the customer
// who asked. There is no member-facing history.
//
// Writing is deliberately fire-and-forget, like the sign-in log: failing to keep a
// record must never stop somebody getting their answer.

export interface ResearchAnswerRecord {
  kind?: string | null;
  title?: string | null;
  summary?: string | null;
  compounds?: string[] | null;
  /* The whole answer object exactly as it was shown. The engine's wording can
     change; what a member actually saw cannot be rebuilt from the question. */
  raw?: unknown;
}

export interface ResearchQuestionRow {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  is_staff: boolean;
  question: string;
  answer_kind: string | null;
  answer_title: string | null;
  answer_summary: string | null;
  answer_json: unknown;
  compounds: string[] | null;
  ip_address: string | null;
  user_agent: string | null;
  review_status: 'unreviewed' | 'good' | 'needs_improvement';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  linked_task_id: string | null;
  created_at: string;
}

export type ResearchQuestionView =
  | 'all'
  | 'members'
  | 'staff'
  | 'today'
  | 'week'
  | 'attention'
  | 'unanswered'
  | 'terms-review'
  | 'errors';

export interface ResearchQuestionStats {
  total: number;
  members: number;
  today: number;
  week: number;
  unanswered: number;
  termsReview: number;
  errors: number;
  /* The honest "needs a look" number: unclear wording or a clarify answer,
     each question counted once. The overview tile uses this. */
  attention: number;
}

export interface ResearchMemberSummary {
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  question_count: number;
  last_asked: string;
}

export interface ResearchCountSummary {
  label: string;
  count: number;
}

export interface ResearchQuestionAuditPage {
  questions: ResearchQuestionRow[];
  total: number;
  stats: ResearchQuestionStats;
  members: ResearchMemberSummary[];
  topCompounds: ResearchCountSummary[];
  languageGaps: ResearchCountSummary[];
}

/* Ceilings, so one oversized paste cannot bloat the table or the admin page.
   Generous enough that a real question and a real answer are never clipped. */
const MAX_QUESTION = 2000;
const MAX_SUMMARY = 4000;
const MAX_ANSWER_JSON = 20000;
const MAX_COMPOUNDS = 25;

function clip(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

// Same derivation the sign-in log and /api/verify use.
export function requestContext(request?: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  if (!request) return { ip: null, userAgent: null };
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip') || null;
  return { ip, userAgent: request.headers.get('user-agent') || null };
}

// Never throws. Callers use it without awaiting, so an unhandled rejection here
// would be an unhandled rejection in the member's chat request.
export async function recordResearchQuestion(params: {
  customerId?: number | null;
  name?: string | null;
  email?: string | null;
  isStaff?: boolean;
  question: string;
  answer?: ResearchAnswerRecord | null;
  request?: Request;
}): Promise<void> {
  const question = clip(params.question, MAX_QUESTION);
  if (!question) return;

  const { ip, userAgent } = requestContext(params.request);
  const answer = params.answer ?? {};

  const compounds = Array.isArray(answer.compounds)
    ? answer.compounds
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .slice(0, MAX_COMPOUNDS)
        .map((c) => c.trim())
    : [];

  let answerJson: string | null = null;
  if (answer.raw !== undefined && answer.raw !== null) {
    try {
      const encoded = JSON.stringify(answer.raw);
      /* An answer larger than the ceiling is dropped rather than stored half
         written: broken JSON in the column would be worse than none. The
         readable parts (kind, title, summary) are stored either way. */
      answerJson = encoded.length > MAX_ANSWER_JSON ? null : encoded;
    } catch {
      answerJson = null;
    }
  }

  const insert = async () => {
    const db = requireDb();
    await db`
      INSERT INTO research_chat_log
        (customer_id, customer_name, customer_email, is_staff, question,
         answer_kind, answer_title, answer_summary, answer_json, compounds,
         ip_address, user_agent)
      VALUES (
        ${params.customerId ?? null},
        ${clip(params.name, 200)},
        ${clip(params.email, 320)},
        ${params.isStaff === true},
        ${question},
        ${clip(answer.kind, 60)},
        ${clip(answer.title, 400)},
        ${clip(answer.summary, MAX_SUMMARY)},
        ${answerJson}::jsonb,
        ${compounds}::text[],
        ${ip},
        ${userAgent}
      )
    `;
  };

  try {
    await insert();
  } catch {
    // The first question asked after this ships runs before the table exists.
    // Same self-healing retry the sign-in log and the admin routes use, so no
    // question is lost waiting for somebody to open the admin page.
    try {
      const { ensureSchema } = await import('./schema');
      await ensureSchema();
      await insert();
    } catch (err) {
      console.error('[researchQuestions] could not record question:', err);
    }
  }
}

export async function listResearchQuestions(limit = 500): Promise<ResearchQuestionRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT id, customer_id, customer_name, customer_email, is_staff, question,
           answer_kind, answer_title, answer_summary, answer_json, compounds,
           ip_address, user_agent, review_status, review_note, reviewed_by,
           reviewed_at, linked_task_id, created_at
    FROM research_chat_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as ResearchQuestionRow[];
}

function numberOf(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function getResearchQuestionById(id: number): Promise<ResearchQuestionRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT id, customer_id, customer_name, customer_email, is_staff, question,
           answer_kind, answer_title, answer_summary, answer_json, compounds,
           ip_address, user_agent, review_status, review_note, reviewed_by,
           reviewed_at, linked_task_id, created_at
    FROM research_chat_log
    WHERE id = ${id}
    LIMIT 1
  `;
  return (rows[0] as ResearchQuestionRow | undefined) ?? null;
}

export async function listResearchQuestionAuditPage(params: {
  view?: ResearchQuestionView;
  search?: string;
  compound?: string;
  customerId?: number | null;
  page?: number;
  pageSize?: number;
} = {}): Promise<ResearchQuestionAuditPage> {
  const db = requireDb();
  const view = params.view ?? 'all';
  const search = params.search?.trim() || null;
  const likeSearch = search ? `%${search}%` : null;
  const compound = params.compound?.trim() || null;
  const customerId = Number.isInteger(params.customerId) ? params.customerId! : null;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(20, params.pageSize ?? 100));
  const offset = (page - 1) * pageSize;

  const rows = await db`
    SELECT id, customer_id, customer_name, customer_email, is_staff, question,
           answer_kind, answer_title, answer_summary, answer_json, compounds,
           ip_address, user_agent, review_status, review_note, reviewed_by,
           reviewed_at, linked_task_id,
           created_at, COUNT(*) OVER() AS filtered_count
    FROM research_chat_log
    WHERE
      (
        ${view} = 'all'
        OR (${view} = 'members' AND is_staff = FALSE)
        OR (${view} = 'staff' AND is_staff = TRUE)
        OR (${view} = 'today' AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'))
        OR (${view} = 'week' AND created_at >= now() - interval '7 days')
        OR (${view} = 'attention' AND (
          COALESCE((answer_json ->> 'needsLanguageReview')::boolean, FALSE) = TRUE
          OR answer_json ->> 'kind' = 'clarify'
        ))
        OR (${view} = 'unanswered' AND COALESCE((answer_json ->> 'needsLanguageReview')::boolean, FALSE) = TRUE)
        OR (${view} = 'terms-review' AND answer_json #>> '{interpretation,status}' IN ('unknown', 'ambiguous'))
        OR (${view} = 'errors' AND (answer_json IS NULL OR answer_title IS NULL OR answer_summary IS NULL))
      )
      AND (
        ${likeSearch}::text IS NULL
        OR question ILIKE ${likeSearch}
        OR COALESCE(customer_name, '') ILIKE ${likeSearch}
        OR COALESCE(customer_email, '') ILIKE ${likeSearch}
        OR COALESCE(answer_title, '') ILIKE ${likeSearch}
        OR EXISTS (SELECT 1 FROM unnest(COALESCE(compounds, ARRAY[]::text[])) item WHERE item ILIKE ${likeSearch})
      )
      AND (${compound}::text IS NULL OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(compounds, ARRAY[]::text[])) item
        WHERE lower(item) = lower(${compound})
      ))
      AND (${customerId}::int IS NULL OR customer_id = ${customerId})
    ORDER BY created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const total = rows.length > 0
    ? numberOf((rows[0] as unknown as { filtered_count: unknown }).filtered_count)
    : 0;
  const questions = rows.map((row) => {
    const { filtered_count: _filteredCount, ...question } = row as unknown as ResearchQuestionRow & { filtered_count: unknown };
    return question as ResearchQuestionRow;
  });

  const [statsRows, memberRows, compoundRows, gapRows] = await Promise.all([
    db`
      SELECT
        count(*)::int AS total,
        count(DISTINCT CASE WHEN is_staff = FALSE THEN
          CASE WHEN customer_id IS NOT NULL THEN 'id:' || customer_id::text
               ELSE 'email:' || COALESCE(lower(customer_email), 'unknown') END
        END)::int AS members,
        count(*) FILTER (WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'))::int AS today,
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS week,
        count(*) FILTER (WHERE COALESCE((answer_json ->> 'needsLanguageReview')::boolean, FALSE) = TRUE)::int AS unanswered,
        count(*) FILTER (WHERE COALESCE((answer_json ->> 'needsLanguageReview')::boolean, FALSE) = TRUE
          OR answer_json ->> 'kind' = 'clarify')::int AS attention,
        count(*) FILTER (WHERE answer_json #>> '{interpretation,status}' IN ('unknown', 'ambiguous'))::int AS terms_review,
        count(*) FILTER (WHERE answer_json IS NULL OR answer_title IS NULL OR answer_summary IS NULL)::int AS errors
      FROM research_chat_log
    `,
    db`
      SELECT customer_id,
             max(customer_name) AS customer_name,
             max(customer_email) AS customer_email,
             count(*)::int AS question_count,
             max(created_at) AS last_asked
      FROM research_chat_log
      WHERE is_staff = FALSE
      GROUP BY customer_id, lower(COALESCE(customer_email, ''))
      ORDER BY question_count DESC, last_asked DESC
    `,
    db`
      SELECT item AS label, count(*)::int AS count
      FROM research_chat_log, unnest(COALESCE(compounds, ARRAY[]::text[])) item
      WHERE is_staff = FALSE
      GROUP BY item
      ORDER BY count DESC, item ASC
      LIMIT 12
    `,
    db`
      SELECT min(question) AS label, count(*)::int AS count
      FROM research_chat_log
      WHERE is_staff = FALSE
        AND COALESCE((answer_json ->> 'needsLanguageReview')::boolean, FALSE) = TRUE
      GROUP BY lower(regexp_replace(question, '[^a-zA-Z0-9]+', ' ', 'g'))
      ORDER BY count DESC, label ASC
      LIMIT 8
    `,
  ]);

  const rawStats = statsRows[0] as Record<string, unknown> | undefined;
  return {
    questions,
    total,
    stats: {
      total: numberOf(rawStats?.total),
      members: numberOf(rawStats?.members),
      today: numberOf(rawStats?.today),
      week: numberOf(rawStats?.week),
      unanswered: numberOf(rawStats?.unanswered),
      termsReview: numberOf(rawStats?.terms_review),
      errors: numberOf(rawStats?.errors),
      attention: numberOf(rawStats?.attention),
    },
    members: memberRows.map((row) => ({
      customer_id: row.customer_id === null ? null : numberOf(row.customer_id),
      customer_name: typeof row.customer_name === 'string' ? row.customer_name : null,
      customer_email: typeof row.customer_email === 'string' ? row.customer_email : null,
      question_count: numberOf(row.question_count),
      last_asked: String(row.last_asked),
    })),
    topCompounds: compoundRows.map((row) => ({ label: String(row.label), count: numberOf(row.count) })),
    languageGaps: gapRows.map((row) => ({ label: String(row.label), count: numberOf(row.count) })),
  };
}
