import type { requireDb } from '../client';

// Advertising history and learning (3 Sept 2026, Kieran: "make it as automated
// as possible ... something that learns from analytics").
//
// The Ad Results page reads Meta live; these tables are the MEMORY behind it.
// A daily cron copies each day's figures in, so trends, week-on-week
// comparisons, alerts and the adviser all read our own history instead of
// hammering Meta, and the history survives whatever Meta later trims.
export async function ensureAds(db: ReturnType<typeof requireDb>) {
  // One row per day per thing measured. level is 'account', 'campaign' or 'ad';
  // entity_id is the Meta id at that level ('account' rows use the ad account id).
  // Money is minor units of the account currency, same convention as the reader.
  await db`
    CREATE TABLE IF NOT EXISTS ad_daily_metrics (
      metric_date DATE NOT NULL,
      level TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_name TEXT,
      status TEXT,
      objective TEXT,
      spend_minor BIGINT NOT NULL DEFAULT 0,
      impressions BIGINT NOT NULL DEFAULT 0,
      reach BIGINT NOT NULL DEFAULT 0,
      clicks BIGINT NOT NULL DEFAULT 0,
      video_views BIGINT NOT NULL DEFAULT 0,
      purchases INTEGER NOT NULL DEFAULT 0,
      purchase_value_minor BIGINT NOT NULL DEFAULT 0,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (metric_date, level, entity_id)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS ad_daily_metrics_level_idx ON ad_daily_metrics (level, metric_date DESC)`;

  // Daily account-level breakdowns: where ads ran, who saw them, which country.
  // dimension is 'placement', 'agegender' or 'country'.
  await db`
    CREATE TABLE IF NOT EXISTS ad_daily_slices (
      metric_date DATE NOT NULL,
      dimension TEXT NOT NULL,
      label TEXT NOT NULL,
      spend_minor BIGINT NOT NULL DEFAULT 0,
      impressions BIGINT NOT NULL DEFAULT 0,
      clicks BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (metric_date, dimension, label)
    )
  `;

  // Every alert the ads watchdog has sent, so the same alert is not sent again
  // every single day while the condition persists.
  await db`
    CREATE TABLE IF NOT EXISTS ad_alert_log (
      id SERIAL PRIMARY KEY,
      alert_key TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS ad_alert_log_key_idx ON ad_alert_log (alert_key, created_at DESC)`;

  // Which film or creative each Meta ad used, typed in by a person on the Ad
  // Results page. The adviser uses it to compare creative styles.
  await db`
    CREATE TABLE IF NOT EXISTS ad_creative_links (
      ad_id TEXT PRIMARY KEY,
      ad_name TEXT,
      creative_label TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Added 4 Sept 2026 (ADSLAB item 4), the additive way: Kieran runs two ads
  // against each other, so an ad can be "A" or "B" and carry a note saying
  // what it is testing. Both replace Meta's automatic ad name on screen.
  await db`ALTER TABLE ad_creative_links ADD COLUMN IF NOT EXISTS experiment_note TEXT`;
  await db`ALTER TABLE ad_creative_links ADD COLUMN IF NOT EXISTS slot TEXT`;
  // A local archive switch. It only tidies Windsor Glow's admin panel; the ad
  // and every historical figure remain untouched inside Meta.
  await db`ALTER TABLE ad_creative_links ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ`;

  // Advice the adviser has written, kept so the page shows the latest one
  // without paying for a rewrite on every view, and so old advice can be
  // compared with what actually happened. cost_minor is pence spent on the AI.
  await db`
    CREATE TABLE IF NOT EXISTS ad_advice (
      id SERIAL PRIMARY KEY,
      signals JSONB NOT NULL,
      advice TEXT NOT NULL,
      model TEXT,
      cost_minor INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
