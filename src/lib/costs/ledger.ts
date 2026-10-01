// The one place a provider charge is written down, for every system this business runs.
//
// PORTABLE ON PURPOSE. This file imports nothing from either app. It takes a `sql` function and
// nothing else, because it has to run unchanged inside the social engine AND inside the Windsor
// Glow shop, which are separate deployments with separate databases and no shared package. The
// Windsor Glow copy is byte-identical and `npm run check:safety` compares them, so the two cannot
// quietly drift the way the two pricing tables did.
//
// THE RULE THIS FILE MAKES STRUCTURAL: IF A PROVIDER IS PAID, A ROW GOES IN ai_costs.
// Not "as well as somewhere else", and not "unless it is awkward". Every way that rule has been
// broken so far, and there have been six, ended the same way: a real number on a real screen that
// was quietly short, which is worse than no number at all, because nobody distrusts it and so
// nobody checks it.
//
// The six, kept as the record of what this file is defending against:
//   plan.ts        wrote its own insert for language model calls
//   build.ts       wrote a second, nearly identical one for generated slides
//   speech.ts      wrote voice charges to slideshow_audio and nowhere else
//   transcribe     worked out what a call cost, returned it to the browser, forgot it
//   music.ts       generated beds against a paid allowance and recorded nothing at all
//   the concierge  metered its own turns into a different table in a different currency

/**
 * A tagged template that runs SQL. Deliberately loose.
 *
 * The obvious signature, returning `Promise<unknown[]>`, does not accept a Neon client: theirs
 * resolves to a union that includes a full result object, and the two apps configure it
 * differently. Naming the real type would mean importing the driver, which would end this file's
 * one useful property, that it can be copied into another codebase and just work. The rows are
 * cast where they are read instead, which is where the shape is actually known.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

/**
 * Which system the money was spent by. A closed set, checked by the database as well as here.
 *
 *   slideshow_studio   making a video: planning, pictures, voice, quality checks
 *   social_engine      the rest of the dashboard: caption drafting, transcribing an upload
 *   ai_concierge       a customer conversation on windsorglow.com
 *   admin              the Windsor Glow admin panel, for instance voice notes into a form
 *   manual             entered by hand, for spending no code can see. Higgsfield credits.
 */
export type Area = 'slideshow_studio' | 'social_engine' | 'ai_concierge' | 'admin' | 'manual';

/** What was being paid for. Named, because an operation nobody can name is one nobody notices. */
export type Operation =
  | 'interpretation' | 'brief' | 'storyboard' | 'tidy'
  | 'generate' | 'qc'
  | 'voice' | 'transcribe'
  | 'caption' | 'distillation'
  /** A customer turn that reached the model. */
  | 'concierge_reply'
  /** Turning a question into a vector so the knowledge base can be searched. */
  | 'embedding'
  /** Anything recorded by hand. */
  | 'manual';

/** Whether the money bought anything. A failure that was still charged is still a charge. */
export type ChargeStatus = 'ok' | 'failed' | 'cancelled' | 'refunded';

export interface Charge {
  area: Area;
  operation: Operation;
  provider: string;
  model?: string | null;

  /**
   * Always known where there is a brand, which is everywhere in the social engine. The concierge
   * has no brand of its own and passes the Windsor Glow one, so a single month reads as one
   * business rather than two.
   */
  brandId: string;

  /**
   * WHO. A staff name for the dashboard, `customer` for a member of the public, `system` for a
   * cron or the render worker that spends while nobody is watching.
   *
   * A CUSTOMER IS NEVER NAMED HERE. The concierge passes the word "customer" and puts the
   * conversation id in its own field. The cost dashboard has no business knowing who was asking,
   * only that a conversation happened and what it came to.
   */
  actor?: string | null;
  actorKind?: 'staff' | 'customer' | 'system' | null;

  /** Money. `pence` is what screens show; the other two are what it was before conversion. */
  pence: number;
  usd?: number | null;
  fxRate?: number | null;

  /**
   * True while the figure is our arithmetic rather than the provider's own.
   *
   * The dashboard labels these, because a guess presented as a measurement is how a cost model
   * stops being believed. `reviseCharge` clears it when the real figure arrives.
   */
  isEstimate?: boolean;

  status?: ChargeStatus;
  /** Why it failed, in plain words, for the row that says money went on nothing. */
  error?: string | null;

  /** Whatever makes the figure checkable later: token counts, characters, seconds. */
  units?: unknown;

  /** What it was for. All optional; a charge with none of them is still a charge. */
  projectId?: string | null;
  slideId?: string | null;
  conversationId?: string | null;
  enquiryId?: number | null;
  refKind?: string | null;
  refId?: string | null;

  /**
   * Our handle on the provider call, unique per provider.
   *
   * What makes writing a charge idempotent, so a retry cannot bill the accounts twice and a
   * backfill can be run again safely. Leave it null when there is no stable handle: a null is
   * never deduplicated, which is the right way round, because a genuine second payment must never
   * be swallowed by a unique index.
   */
  requestId?: string | null;

  /**
   * Skip the cost notification for this charge.
   *
   * Set for anything a customer triggered, so nothing about money can ever reach the public side,
   * and for charges nobody pressed a button for.
   */
  silent?: boolean;
}

async function write(sql: Sql, entry: Charge): Promise<string | null> {
  const rows = await sql`
    INSERT INTO ai_costs
      (brand_id, area, operation, provider, model, actor, actor_kind,
       project_id, slide_id, conversation_id, enquiry_id, ref_kind, ref_id,
       units, cost_pence, cost_usd, fx_rate, currency,
       is_estimate, status, error, request_id, seen_at)
    VALUES
      (${entry.brandId}, ${entry.area}, ${entry.operation}, ${entry.provider},
       ${entry.model ?? null}, ${entry.actor ?? null}, ${entry.actorKind ?? null},
       ${entry.projectId ?? null}, ${entry.slideId ?? null}, ${entry.conversationId ?? null},
       ${entry.enquiryId ?? null}, ${entry.refKind ?? null}, ${entry.refId ?? null},
       ${JSON.stringify(entry.units ?? {})}::jsonb,
       ${entry.pence}, ${entry.usd ?? null}, ${entry.fxRate ?? null}, 'GBP',
       ${entry.isEstimate ?? false}, ${entry.status ?? 'ok'}, ${entry.error ?? null},
       ${entry.requestId ?? null},
       ${entry.silent ? new Date().toISOString() : null})
    ON CONFLICT DO NOTHING
    RETURNING id` as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * A spending limit that the act of charging must not cross.
 *
 * Passed to `chargeWithinCeiling`, which is the only way to be sure. See that function.
 */
export interface Ceiling {
  /** Only charges from this moment onward count towards it. */
  sinceISO: string;
  /** The most the window may come to in pence, this charge included. */
  limitPence: number;
  /**
   * Which areas count. One ledger serves three systems and they do not share a purse, so a
   * concierge conversation must not eat into the studio's month.
   */
  areas: readonly Area[];
  /**
   * What two callers queue behind, so that two brands never wait on each other.
   *
   * Anything stable and unique to the purse being protected. The brand id is the usual answer.
   */
  lockKey: string;
}

/**
 * The neon client, which can also run several statements as one transaction.
 *
 * `Sql` on its own is deliberately the smallest possible shape so this file stays copyable. This
 * adds only what the atomic ceiling needs, and it is a separate type so nothing else has to care.
 */
export type SqlWithTransaction = Sql & {
  /* Method shorthand, and `any`, both deliberately. The driver's own signature is generic over
   * two boolean type parameters and takes either an array or a builder function; naming a
   * narrower shape here makes the real client fail to satisfy it, which is a type error about
   * nothing. This file's whole point is to describe the least it needs. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(queries: any[]): Promise<any[]>;
};

export interface CeilingResult {
  /** The row id, or null when nothing was written. */
  id: string | null;
  /** False means the ceiling refused it and NO row was written. */
  allowed: boolean;
  /** What had already been spent in the window, before this charge. */
  spentPence: number;
}

/**
 * Write a charge, but only if it does not cross a ceiling. One transaction, so it cannot race.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT TWO STATEMENTS. Checking a ceiling and then spending against
 * it are two different moments, and everything bad lives in the gap between them. The studio used
 * to sum the month, compare, return, and write the charge separately, so two callers who both
 * asked at £59.90 were both told yes and both spent. The overshoot was about 11p, which is small,
 * and it was the ceiling, which is not.
 *
 * Three things make this airtight rather than merely narrower:
 *
 *   1. It is a TRANSACTION, so the lock below is held from the first statement to the last. The
 *      neon HTTP driver has no session, so `transaction([...])` is the only way to hold one at
 *      all, and a single statement would not do: Postgres gives no guarantee about whether a lock
 *      in one part of a statement is taken before a sum in another part is read.
 *   2. `pg_advisory_xact_lock` serialises callers protecting the same purse. The second caller
 *      waits until the first has committed, and then reads a total that includes it.
 *   3. The sum and the insert are ONE statement, so the figure the decision is made on is the
 *      figure the row is written against. Nothing can move in between.
 *
 * It refuses by writing nothing. `allowed: false` means the money did not leave, because in this
 * engine a charge is written BEFORE the provider is called, and a caller that cannot record a
 * spend does not make it.
 */
export async function chargeWithinCeiling(
  sql: SqlWithTransaction, entry: Charge, ceiling: Ceiling,
): Promise<CeilingResult> {
  const [, decided] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${ceiling.lockKey})) AS locked`,
    sql`
      WITH room AS (
        SELECT coalesce(sum(cost_pence), 0)::float8 AS spent
          FROM ai_costs
         WHERE brand_id = ${entry.brandId}::uuid
           AND area = ANY(${ceiling.areas as string[]}::text[])
           AND created_at >= ${ceiling.sinceISO}::timestamptz
      ),
      ins AS (
        INSERT INTO ai_costs
          (brand_id, area, operation, provider, model, actor, actor_kind,
           project_id, slide_id, conversation_id, enquiry_id, ref_kind, ref_id,
           units, cost_pence, cost_usd, fx_rate, currency,
           is_estimate, status, error, request_id, seen_at)
        SELECT
           ${entry.brandId}::uuid, ${entry.area}::text, ${entry.operation}::text,
           ${entry.provider}::text, ${entry.model ?? null}::text, ${entry.actor ?? null}::text,
           ${entry.actorKind ?? null}::text,
           ${entry.projectId ?? null}::uuid, ${entry.slideId ?? null}::uuid,
           ${entry.conversationId ?? null}::text, ${entry.enquiryId ?? null}::int,
           ${entry.refKind ?? null}::text, ${entry.refId ?? null}::text,
           ${JSON.stringify(entry.units ?? {})}::jsonb,
           ${entry.pence}::numeric, ${entry.usd ?? null}::numeric, ${entry.fxRate ?? null}::numeric,
           'GBP'::text,
           ${entry.isEstimate ?? false}::boolean, ${entry.status ?? 'ok'}::text,
           ${entry.error ?? null}::text, ${entry.requestId ?? null}::text,
           ${entry.silent ? new Date().toISOString() : null}::timestamptz
          FROM room
         WHERE room.spent + ${entry.pence}::numeric <= ${ceiling.limitPence}::numeric
        ON CONFLICT DO NOTHING
        RETURNING id
      )
      SELECT room.spent::float8 AS spent,
             (room.spent + ${entry.pence}::numeric <= ${ceiling.limitPence}::numeric) AS allowed,
             (SELECT id FROM ins) AS id
        FROM room`,
  ]);

  const row = (decided as { spent: number; allowed: boolean; id: string | null }[])[0];
  return {
    id: row?.id ?? null,
    allowed: Boolean(row?.allowed),
    spentPence: Number(row?.spent ?? 0),
  };
}

/**
 * Write a charge for money that has not left yet. Throws if it cannot.
 *
 * For calls made before the provider is asked, so that being unable to record a spend is a reason
 * not to make it. A row saying money may have gone when the call then failed is the correct
 * direction to be wrong in; the reverse is how a bill arrives for something no table has heard of.
 *
 * Hands back the row id so a caller that wrote an estimate can come back with the measured figure.
 * Null means the row was deduplicated away by `request_id`, so the charge is already on the books.
 */
export function charge(sql: Sql, entry: Charge): Promise<string | null> {
  return write(sql, entry);
}

/**
 * Write a charge for money that has already gone. Never throws.
 *
 * The call is made and paid for by the time this runs, so refusing to carry on would lose the
 * work as well as the money. It complains loudly to the log rather than saying nothing, because a
 * ledger that silently drops rows is precisely the failure this file exists to remove: the code
 * this replaced ended its insert with `.catch(() => {})`.
 */
export async function chargeSpent(sql: Sql, entry: Charge): Promise<string | null> {
  try {
    return await write(sql, entry);
  } catch (error) {
    console.error(
      `[ledger] ${entry.provider} ${entry.operation} in ${entry.area} cost ${entry.pence}p `
      + `and the row would not write: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Replace an estimate with what the provider says it really charged.
 *
 * The only way a written charge may change, and it exists for one shape of call: the ones
 * recorded BEFORE they are made, because being unable to write a row is a reason not to spend,
 * and whose real figure only exists AFTER they come back.
 *
 * It revises rather than inserting a second row, so a picture that cost 3.8p never reads as one
 * that cost 13.8p. And it never deletes: if the correction cannot be written the estimate stands,
 * which keeps a charge on the books rather than losing one.
 */
export async function reviseCharge(sql: Sql, id: string, actual: {
  pence: number;
  usd?: number | null;
  fxRate?: number | null;
  units?: unknown;
  requestId?: string | null;
  model?: string | null;
  status?: ChargeStatus;
  error?: string | null;
}): Promise<void> {
  try {
    await sql`
      UPDATE ai_costs
         SET cost_pence  = ${actual.pence},
             cost_usd    = coalesce(${actual.usd ?? null}, cost_usd),
             fx_rate     = coalesce(${actual.fxRate ?? null}, fx_rate),
             units       = ${JSON.stringify(actual.units ?? {})}::jsonb,
             request_id  = coalesce(${actual.requestId ?? null}, request_id),
             model       = coalesce(${actual.model ?? null}, model),
             status      = ${actual.status ?? 'ok'},
             error       = ${actual.error ?? null},
             is_estimate = false
       WHERE id = ${id}`;
  } catch (error) {
    console.error(`[ledger] could not replace the estimate on ${id} with the measured `
      + `${actual.pence}p: ${(error as Error).message}`);
  }
}

/**
 * Mark a charge as one that failed, keeping the money on the books.
 *
 * Used when a call was paid for and produced nothing. The charge stays, because the money did
 * leave, and the status and reason make the dashboard able to say so rather than showing a spend
 * with no explanation.
 */
export async function markChargeFailed(sql: Sql, id: string, reason: string): Promise<void> {
  try {
    await sql`UPDATE ai_costs SET status = 'failed', error = ${reason.slice(0, 500)} WHERE id = ${id}`;
  } catch (error) {
    console.error(`[ledger] could not mark ${id} failed: ${(error as Error).message}`);
  }
}

/**
 * Drop a charge that was written before a call that then turned out to cost nothing.
 *
 * The one case where removing a row is right: a charge recorded up front for a request the
 * provider refused before doing any work, where nothing was billed. Deliberately narrow, and it
 * requires the caller to have the row id, so it can never be reached by a query that matches
 * more than it meant to. That is not a hypothetical: a cleanup meant to remove one session's
 * throwaway projects once matched five real ones and took their charges with them.
 */
export async function cancelCharge(sql: Sql, id: string, reason: string): Promise<void> {
  try {
    await sql`UPDATE ai_costs
                 SET status = 'cancelled', cost_pence = 0, cost_usd = 0,
                     error = ${reason.slice(0, 500)}
               WHERE id = ${id}`;
  } catch (error) {
    console.error(`[ledger] could not cancel ${id}: ${(error as Error).message}`);
  }
}
