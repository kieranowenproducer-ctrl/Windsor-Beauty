// Migration 002 (idempotent): multi-brand layer for the socialengine DB.
// Adds social_brands + social_platform_accounts, brand_id columns, and
// Phase-3-ready video source/storage columns. Backfills everything existing
// to the windsor-glow brand. Reversible: purely additive, no drops.
// Run: node scripts/social-engine-migrate-brands.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/^SOCIAL_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error('SOCIAL_DATABASE_URL missing'); process.exit(1); }
const sql = neon(url);

const ddl = [
  `CREATE TABLE IF NOT EXISTS social_brands (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, accent TEXT,
     compliance_profile TEXT NOT NULL DEFAULT 'standard'
       CHECK (compliance_profile IN ('peptide','standard','none')),
     default_disclaimer TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `ALTER TABLE social_videos ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES social_brands(id)`,
  `ALTER TABLE social_videos ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload'`,
  `ALTER TABLE social_videos ADD COLUMN IF NOT EXISTS source_ref TEXT`,
  `ALTER TABLE social_videos ADD COLUMN IF NOT EXISTS file_blob_url TEXT`,
  `ALTER TABLE social_videos ADD COLUMN IF NOT EXISTS transcript TEXT`,
  `ALTER TABLE social_activity_log ADD COLUMN IF NOT EXISTS brand_id UUID`,
  `CREATE TABLE IF NOT EXISTS social_platform_accounts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     brand_id UUID NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
     platform_id TEXT NOT NULL REFERENCES social_platforms(id),
     account_label TEXT,
     provider TEXT NOT NULL DEFAULT 'mock',
     credentials_env_key TEXT,
     connected BOOLEAN NOT NULL DEFAULT FALSE,
     last_checked_at TIMESTAMPTZ, notes TEXT,
     UNIQUE (brand_id, platform_id))`,
  `ALTER TABLE social_scheduled_posts ADD COLUMN IF NOT EXISTS platform_account_id UUID REFERENCES social_platform_accounts(id)`,
  `CREATE INDEX IF NOT EXISTS idx_videos_brand ON social_videos(brand_id)`,
];
for (const s of ddl) await sql.query(s);
console.log('schema migrated (brands, platform accounts, source/storage columns)');

// Seed brands
const [wg] = await sql`
  INSERT INTO social_brands (slug, name, accent, compliance_profile, default_disclaimer)
  VALUES ('windsor-glow', 'Windsor Glow', '#b45309', 'peptide', 'For research and education only. Not medical advice.')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
await sql`
  INSERT INTO social_brands (slug, name, accent, compliance_profile, default_disclaimer)
  VALUES ('kj-guitar', 'KJ Guitar', '#B0682F', 'standard', NULL)
  ON CONFLICT (slug) DO NOTHING`;
console.log('brands seeded: windsor-glow (peptide profile), kj-guitar (standard)');

// Backfill existing rows to windsor-glow
const v = await sql`UPDATE social_videos SET brand_id = ${wg.id} WHERE brand_id IS NULL RETURNING id`;
await sql`UPDATE social_activity_log SET brand_id = ${wg.id} WHERE brand_id IS NULL`;
console.log(`backfilled ${v.length} videos to windsor-glow`);

// Per-brand platform accounts for WG (mock provider until keys exist).
// UPLOAD_POST_API_KEY is the planned Phase-6 primary (one key, all platforms).
const platforms = await sql`SELECT id FROM social_platforms`;
for (const p of platforms) {
  await sql`
    INSERT INTO social_platform_accounts (brand_id, platform_id, account_label, provider, credentials_env_key, notes)
    VALUES (${wg.id}, ${p.id}, 'Windsor Glow', 'mock', 'UPLOAD_POST_API_KEY',
            'Mock until Upload-Post is connected (master plan Phase 6)')
    ON CONFLICT (brand_id, platform_id) DO NOTHING`;
}
console.log(`platform accounts seeded for windsor-glow (${platforms.length})`);
console.log('DONE');
