// Every price this business is charged, in one file.
//
// WHY THIS FILE EXISTS. On 2026-08-02 the same model was priced two different ways inside the
// same business: the slideshow studio billed Sonnet 5 at $2/$10 per million tokens and the AI
// concierge billed it at $3/$15. Both figures are real published rates. Only one of them is what
// Anthropic is charging today, because Sonnet 5 is on an introductory rate until 31 August. So
// one of the two systems was quietly overstating its own spending by half, and no screen anywhere
// could have shown that, because neither knew the other existed.
//
// The rule this file makes structural: A PRICE IS WRITTEN DOWN ONCE. Not once per app, not once
// per provider, once. Everything that turns usage into money reads from here.
//
// THREE THINGS THAT ARE DELIBERATE AND WORTH READING BEFORE CHANGING ANYTHING.
//
// 1. RATES ARE DATED, AND A CHARGE IS PRICED AT THE RATE THAT APPLIED ON ITS OWN DAY.
//    Not the rate today. When Sonnet 5's introductory price ends, July's charges must still read
//    as what July actually cost. A pricing table with one current number per model rewrites
//    history every time a vendor changes a price, and the first symptom is a monthly total that
//    does not match a bill anybody kept.
//
// 2. THE EXCHANGE RATE IS STORED ON EVERY ROW, NOT APPLIED AT READ TIME.
//    Same reason. `usdToPence` hands back the rate it used so the caller can write it down.
//
// 3. IT IS CODE, NOT A SETTINGS SCREEN.
//    A price that can be edited from a web page can be edited by anyone who can reach that page,
//    leaves no record of who changed it or why, and cannot be reviewed. A price in this file goes
//    through the checks and shows up in git history for ever. Vendors change prices about twice a
//    year, so a deploy is not a burden. `npm run prices` prints everything configured here with
//    the date it was last checked, so a stale rate is visible rather than assumed.
//
// NOTHING IN THIS FILE IS A SECRET. It holds published rates and no credentials of any kind.

/* ── Dated values ─────────────────────────────────────────────────────────── */

/**
 * A value that was true from a date, until the next entry replaced it.
 *
 * `checked` is the day a person last confirmed the figure against the vendor's own page, which is
 * a different question from when it took effect and is the one that goes stale.
 */
export interface Dated<T> {
  from: string;
  value: T;
  checked: string;
  note?: string;
}

/**
 * Pick the entry that applied on a given day.
 *
 * Entries are held oldest first and the last one whose start date has passed wins. A date before
 * every entry falls back to the earliest rather than throwing: a charge that predates the table is
 * a real charge, and refusing to price it would lose it.
 */
function on<T>(table: readonly Dated<T>[], at: Date): Dated<T> {
  const day = at.toISOString().slice(0, 10);
  let chosen = table[0];
  for (const entry of table) {
    if (entry.from <= day) chosen = entry;
  }
  return chosen;
}

/* ── The exchange rate ────────────────────────────────────────────────────── */

/**
 * Pounds per US dollar. Every vendor here bills in dollars and every screen shows pounds.
 *
 * Kieran chose 0.80 on 2026-08-02 over the real rate, deliberately, with the words "be safe". It
 * is the right way round to be wrong and it matches how the rest of this ledger behaves: a figure
 * that reads slightly high gets questioned, and a figure that reads low does not. At these amounts
 * the difference is a fraction of a penny a month.
 *
 * This is a MANUAL rate and it is meant to be. Fetching a live rate daily would make every
 * historical total drift with the currency markets, which is worse than being two percent out.
 */
export const GBP_PER_USD: readonly Dated<number>[] = [
  {
    from: '2026-01-01',
    value: 0.78,
    checked: '2026-07-31',
    note: 'What the slideshow engine assumed before anybody checked.',
  },
  {
    from: '2026-08-02',
    value: 0.80,
    checked: '2026-08-02',
    note: "Kieran's instruction: round up rather than track the market.",
  },
];

/** Dollars to pence, at the rate that applied on the day. Hands the rate back so it can be stored. */
export function usdToPence(usd: number, at: Date = new Date()): {
  pence: number; usd: number; fxRate: number;
} {
  const rate = on(GBP_PER_USD, at).value;
  return { pence: round(usd * rate * 100), usd: round6(usd), fxRate: rate };
}

/* ── Language models, billed per million tokens ───────────────────────────── */

export interface TokenRate {
  /** US dollars per million input tokens. */
  in: number;
  /** US dollars per million output tokens. */
  out: number;
}

/**
 * What a cached token costs, as a multiple of the ordinary input rate.
 *
 * Reading from the cache is a tenth of the price, which is the whole reason the planning prompts
 * are built the way they are. Writing costs MORE than not caching at all: a quarter more for the
 * five minute cache, double for the one hour cache. That is why a cache that never gets read is
 * not merely useless, it is a surcharge, and it is exactly what happened to the slideshow planner
 * for weeks before anybody measured it.
 */
export const CACHE_MULTIPLIER = { read: 0.1, write5m: 1.25, write1h: 2 } as const;

/**
 * The smallest prompt each model will cache. Below it a cache marker is silently ignored.
 *
 * Silently is the important word: there is no error and no warning, the only symptom is a bill
 * that never falls. Haiku's minimum is eight times Opus 5's, which is why the cheap mechanical
 * calls in this workspace are the ones least likely to cache.
 *
 * Verified against Anthropic's own documentation on 2026-08-02. All three were already correct in
 * both apps; they are repeated here so there is one place to check rather than two.
 */
export const CACHE_MINIMUM_TOKENS: Record<string, number> = {
  'claude-opus-5': 512,
  'claude-sonnet-5': 1024,
  'claude-haiku-4-5-20251001': 4096,
  // The alias. Kept so anything recorded under it still prices; nothing sends it any more. The
  // API reports the dated name back whichever spelling is sent, so that is the one every system
  // in this estate now uses. Settled 2026-08-03; see concierge/engine.ts.
  'claude-haiku-4-5': 4096,
};

/**
 * Published Anthropic rates.
 *
 * Sonnet 5 is the one that caused this file. Its introductory price runs to 31 August 2026 and the
 * list price applies from 1 September, so both are here with their dates and the changeover needs
 * no edit on the day: a charge in August prices at $2/$10 and a charge in September prices at
 * $3/$15, for ever, whichever day anybody happens to run the report.
 */
export const MODEL_RATES: Record<string, readonly Dated<TokenRate>[]> = {
  'claude-opus-5': [
    { from: '2026-01-01', value: { in: 5, out: 25 }, checked: '2026-08-02' },
  ],
  'claude-sonnet-5': [
    {
      from: '2026-01-01',
      value: { in: 2, out: 10 },
      checked: '2026-08-02',
      note: 'Introductory rate, ends 2026-08-31.',
    },
    {
      from: '2026-09-01',
      value: { in: 3, out: 15 },
      checked: '2026-08-02',
      note: 'List price. Takes effect on its own, no edit needed on the day.',
    },
  ],
  'claude-haiku-4-5-20251001': [
    { from: '2026-01-01', value: { in: 1, out: 5 }, checked: '2026-08-02' },
  ],
  'claude-haiku-4-5': [
    {
      from: '2026-01-01',
      value: { in: 1, out: 5 },
      checked: '2026-08-02',
      note: 'The alias. Nothing sends it after 2026-08-03; kept so older charges still price.',
    },
  ],
  'gpt-4o-mini': [
    {
      from: '2026-01-01',
      value: { in: 0.15, out: 0.6 },
      checked: '2026-08-02',
      note: 'The fallback when no Anthropic key is present. Rarely used.',
    },
  ],
};

/**
 * The unknown model is priced at the dearest rate we know of, never at zero.
 *
 * A model nobody has added to the table is the shape of an unmetered call, and an unmetered call
 * is how a budget quietly stops working. Overstating it makes the row obvious on the dashboard;
 * a zero makes it invisible, which is the failure this whole system exists to prevent.
 */
const UNKNOWN_MODEL: TokenRate = { in: 5, out: 25 };

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** What one language model call cost, from the vendor's own usage figures. */
export function priceTokens(
  model: string, usage: TokenUsage, at: Date = new Date(),
): { pence: number; usd: number; fxRate: number; known: boolean } {
  const table = MODEL_RATES[model];
  const rate = table ? on(table, at).value : UNKNOWN_MODEL;

  const fresh = usage.input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;

  const usd = (
    fresh * rate.in
    + written * rate.in * CACHE_MULTIPLIER.write5m
    + read * rate.in * CACHE_MULTIPLIER.read
    + out * rate.out
  ) / 1_000_000;

  return { ...usdToPence(usd, at), known: Boolean(table) };
}

/** Was the cached part big enough to actually cache? Worth asking rather than assuming. */
export function willCache(model: string, prefixTokens: number): boolean {
  const minimum = CACHE_MINIMUM_TOKENS[model];
  return minimum !== undefined && prefixTokens >= minimum;
}

/* ── Pictures ─────────────────────────────────────────────────────────────── */

/**
 * gpt-image-1, US dollars per million tokens.
 *
 * Three rates, not two, because a picture that was shown reference pictures pays a different rate
 * for what it looked at than for what it drew.
 *
 * WHAT IS MEASURED AND WHAT IS READ. The TOKEN COUNTS come from the vendor's own usage block on
 * the real response, so nothing here estimates how big a picture is or how many attempts it took.
 * Only the RATES come from a page, and a published rate is the one part of a bill that is stable.
 */
export const IMAGE_RATES: readonly Dated<{
  textIn: number; imageIn: number; imageOut: number;
}>[] = [
  {
    from: '2026-01-01',
    value: { textIn: 5, imageIn: 10, imageOut: 40 },
    checked: '2026-07-31',
    note: 'OpenAI gpt-image-1. Retires 2026-10-23; do not build anything new on it.',
  },
];

export interface ImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

/**
 * What one picture cost, from its own usage figures.
 *
 * When the vendor does not break the input down, all of it is priced at the IMAGE rate, which is
 * the dearer of the two. Deliberate, and the same direction of error as everything else here: the
 * overstatement it can cause is a fraction of a penny on a prompt of a few hundred words, and the
 * alternative is a number that reads low and therefore never gets checked.
 */
export function priceImage(usage: ImageUsage, at: Date = new Date()) {
  const rate = on(IMAGE_RATES, at).value;
  const input = usage.input_tokens ?? 0;
  const textIn = usage.input_tokens_details?.text_tokens ?? null;
  const imageIn = usage.input_tokens_details?.image_tokens ?? null;
  const out = usage.output_tokens ?? 0;

  const usd = textIn === null && imageIn === null
    ? (input * rate.imageIn + out * rate.imageOut) / 1_000_000
    : ((textIn ?? 0) * rate.textIn + (imageIn ?? 0) * rate.imageIn + out * rate.imageOut) / 1_000_000;

  return usdToPence(usd, at);
}

/* ── Listening and speaking ───────────────────────────────────────────────── */

/** US dollars per minute of audio, per transcription model. */
export const TRANSCRIBE_RATES: Record<string, readonly Dated<number>[]> = {
  'gpt-4o-mini-transcribe': [
    {
      from: '2026-01-01',
      value: 0.003,
      checked: '2026-07-31',
      note: 'Half the price of whisper-1 and better on proper nouns.',
    },
  ],
  'whisper-1': [
    {
      from: '2026-01-01',
      value: 0.006,
      checked: '2026-08-02',
      note: 'Still used by the Windsor Glow admin voice fields.',
    },
  ],
};

export function priceTranscription(model: string, seconds: number, at: Date = new Date()) {
  const table = TRANSCRIBE_RATES[model];
  // An unknown transcription model is priced at the dearer of the two we know, for the reason
  // given at UNKNOWN_MODEL above.
  const perMinute = table ? on(table, at).value : 0.006;
  return { ...usdToPence((seconds / 60) * perMinute, at), known: Boolean(table) };
}

/**
 * ElevenLabs bills characters of input against a monthly allowance rather than per call.
 *
 * The starter tier is 40,000 characters for about £4 a month, which is 0.01p a character. Held as
 * pence rather than dollars because that is how the allowance is bought, so there is no exchange
 * rate in it and none is stored.
 */
export const PENCE_PER_SPOKEN_CHARACTER: readonly Dated<number>[] = [
  { from: '2026-01-01', value: 0.01, checked: '2026-07-31' },
];

export function priceSpeech(characters: number, at: Date = new Date()): {
  pence: number; usd: null; fxRate: null;
} {
  return { pence: round(characters * on(PENCE_PER_SPOKEN_CHARACTER, at).value), usd: null, fxRate: null };
}

/* ── Retrieval ────────────────────────────────────────────────────────────── */

/**
 * US dollars per million tokens for embeddings.
 *
 * Every concierge turn that reaches the model embeds the question first, and until 2026-08-02
 * that call was priced at nothing anywhere. It is genuinely tiny, roughly two hundredths of a
 * penny a turn, but "too small to bother with" is how the last four unmetered paths got that way.
 *
 * This was the one figure in this file carried on trust rather than checked. It said so in its own
 * `checked` field, it announced itself in `npm run prices`, and every charge derived from it was
 * flagged as an estimate. Confirmed against OpenAI's own pricing page on 2026-08-02 and the
 * figure was right, which is a good outcome but not the point. The point is that it was possible
 * to tell it had not been checked.
 */
export const EMBEDDING_RATES: Record<string, readonly Dated<number>[]> = {
  'text-embedding-3-small': [
    {
      from: '2026-01-01',
      value: 0.02,
      checked: '2026-08-02',
      note: 'Confirmed against developers.openai.com/api/docs/pricing.',
    },
  ],
  'text-embedding-3-large': [
    {
      from: '2026-01-01',
      value: 0.13,
      checked: '2026-08-02',
      note: 'Not used by anything here. Listed so the unknown-model fallback below is a real '
        + 'published rate rather than a number somebody picked.',
    },
  ],
};

/** The dearest embedding rate published. An unpriced call must never read as free. */
const UNKNOWN_EMBEDDING = 0.13;

/**
 * Has a rate actually been confirmed against the vendor, or is it only written down?
 *
 * A `checked` date that is not a date is the marker for a figure nobody has verified. This exists
 * so a charge derived from an unconfirmed rate can be flagged as an estimate on the row itself,
 * rather than the doubt living only in a comment in this file where no screen can see it.
 */
function confirmed<T>(entry: Dated<T>): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(entry.checked);
}

export function priceEmbedding(model: string, tokens: number, at: Date = new Date()) {
  const table = EMBEDDING_RATES[model];
  const entry = table ? on(table, at) : null;
  const perMillion = entry ? entry.value : UNKNOWN_EMBEDDING;
  return {
    ...usdToPence((tokens / 1_000_000) * perMillion, at),
    known: Boolean(table),
    /** False while the rate itself is unverified, which makes the charge an estimate. */
    confirmed: entry ? confirmed(entry) : false,
  };
}

/* ── Saying what is configured ────────────────────────────────────────────── */

export interface RateLine {
  what: string;
  rate: string;
  from: string;
  checked: string;
  note?: string;
}

/**
 * Everything this file knows, as rows, for `npm run prices`.
 *
 * The point is the `checked` column. A rate that was last confirmed months ago is not wrong, but
 * it is the first thing to suspect when a total stops matching a bill, and a table nobody can
 * print is a table nobody audits.
 */
export function allRates(): RateLine[] {
  const lines: RateLine[] = [];

  for (const entry of GBP_PER_USD) {
    lines.push({
      what: 'Exchange rate', rate: `£${entry.value.toFixed(2)} per $1`,
      from: entry.from, checked: entry.checked, note: entry.note,
    });
  }
  for (const [model, table] of Object.entries(MODEL_RATES)) {
    for (const entry of table) {
      lines.push({
        what: model, rate: `$${entry.value.in} in / $${entry.value.out} out per million tokens`,
        from: entry.from, checked: entry.checked, note: entry.note,
      });
    }
  }
  for (const entry of IMAGE_RATES) {
    lines.push({
      what: 'gpt-image-1',
      rate: `$${entry.value.textIn} text in / $${entry.value.imageIn} image in / $${entry.value.imageOut} out per million`,
      from: entry.from, checked: entry.checked, note: entry.note,
    });
  }
  for (const [model, table] of Object.entries(TRANSCRIBE_RATES)) {
    for (const entry of table) {
      lines.push({
        what: model, rate: `$${entry.value} per minute`,
        from: entry.from, checked: entry.checked, note: entry.note,
      });
    }
  }
  for (const [model, table] of Object.entries(EMBEDDING_RATES)) {
    for (const entry of table) {
      lines.push({
        what: model, rate: `$${entry.value} per million tokens`,
        from: entry.from, checked: entry.checked, note: entry.note,
      });
    }
  }
  for (const entry of PENCE_PER_SPOKEN_CHARACTER) {
    lines.push({
      what: 'ElevenLabs speech', rate: `${entry.value}p per character`,
      from: entry.from, checked: entry.checked, note: entry.note,
    });
  }
  return lines;
}

/** Four decimal places of a penny, and never a negative zero. */
function round(value: number): number {
  const r = Math.round(value * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
}

function round6(value: number): number {
  const r = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(r, -0) ? 0 : r;
}
