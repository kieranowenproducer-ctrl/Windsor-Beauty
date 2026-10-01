// One-time (idempotent) setup for the Social Content Engine database.
// Separate `socialengine` DB (same pattern as the task engine): zero contact
// with the live store DB. Creates schema, seeds the 4 platforms + demo data.
// Run: node scripts/social-engine-setup.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const envPath = new URL('../.env.local', import.meta.url);
const env = readFileSync(envPath, 'utf8');
const base = (env.match(/^NEON_ADMIN_URL=(.+)$/m) || env.match(/^DATABASE_URL=(.+)$/m))?.[1]?.trim();
if (!base) { console.error('NEON_ADMIN_URL missing from .env.local'); process.exit(1); }

const DB = 'socialengine';
const u = new URL(base); u.pathname = `/${DB}`;
const socialUrl = u.toString();

const root = neon(base);
if ((await root`SELECT 1 FROM pg_database WHERE datname = ${DB}`).length === 0) {
  await root.query(`CREATE DATABASE ${DB}`);
  console.log(`created database "${DB}"`);
} else console.log(`database "${DB}" exists`);

const sql = neon(socialUrl);
const ddl = [
  `CREATE TABLE IF NOT EXISTS social_videos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title TEXT NOT NULL, description TEXT, video_url TEXT, thumbnail_url TEXT,
     category TEXT, topic TEXT, duration_seconds INT,
     status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
       ('draft','ready_for_caption','caption_ready','compliance_review','approved','scheduled','posted','failed','archived')),
     compliance_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (compliance_status IN ('unchecked','warnings','clear','blocked')),
     notes TEXT, uploaded_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS social_platforms (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
     connection_status TEXT NOT NULL DEFAULT 'not_connected',
     can_post BOOLEAN NOT NULL DEFAULT FALSE, can_analytics BOOLEAN NOT NULL DEFAULT FALSE,
     char_limit INT, video_guidance TEXT, hashtag_guidance TEXT, notes TEXT,
     credentials_env_keys TEXT[])`,
  `CREATE TABLE IF NOT EXISTS social_caption_variants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     video_id UUID NOT NULL REFERENCES social_videos(id) ON DELETE CASCADE,
     platform_id TEXT REFERENCES social_platforms(id),
     style TEXT NOT NULL CHECK (style IN
       ('educational','short_viral','professional','curiosity_hook','myth_busting','yt_title','yt_description')),
     caption TEXT NOT NULL DEFAULT '', hook TEXT, hashtags TEXT, disclaimer TEXT,
     tone TEXT, cta_style TEXT,
     status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','rejected')),
     performance_score NUMERIC, notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS social_compliance_checks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     video_id UUID REFERENCES social_videos(id) ON DELETE CASCADE,
     caption_id UUID REFERENCES social_caption_variants(id) ON DELETE CASCADE,
     warnings JSONB NOT NULL DEFAULT '[]', warning_count INT NOT NULL DEFAULT 0,
     checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS social_scheduled_posts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     video_id UUID NOT NULL REFERENCES social_videos(id) ON DELETE CASCADE,
     platform_id TEXT NOT NULL REFERENCES social_platforms(id),
     caption_id UUID REFERENCES social_caption_variants(id) ON DELETE SET NULL,
     scheduled_at TIMESTAMPTZ NOT NULL, timezone TEXT NOT NULL DEFAULT 'Europe/London',
     status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
       ('draft','awaiting_approval','approved','scheduled','posting_queued','posted','failed','cancelled')),
     approval_note TEXT, error_message TEXT,
     platform_post_id TEXT, post_url TEXT, posted_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_sched_when ON social_scheduled_posts(scheduled_at)`,
  `CREATE TABLE IF NOT EXISTS social_post_metrics (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     scheduled_post_id UUID NOT NULL REFERENCES social_scheduled_posts(id) ON DELETE CASCADE,
     captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), source TEXT NOT NULL DEFAULT 'manual',
     views INT DEFAULT 0, likes INT DEFAULT 0, comments INT DEFAULT 0, shares INT DEFAULT 0,
     saves INT, watch_time_seconds INT, avg_view_duration_seconds NUMERIC, clicks INT,
     follower_delta INT)`,
  `CREATE TABLE IF NOT EXISTS social_recommendations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     kind TEXT NOT NULL, platform_id TEXT, recommendation TEXT NOT NULL,
     evidence JSONB, generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS social_api_connections (
     platform_id TEXT PRIMARY KEY REFERENCES social_platforms(id),
     provider TEXT NOT NULL DEFAULT 'mock',
     env_keys_required TEXT[], connected BOOLEAN NOT NULL DEFAULT FALSE,
     account_label TEXT, last_checked_at TIMESTAMPTZ, notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS social_activity_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     actor TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
];
for (const s of ddl) await sql.query(s);
console.log('schema ready (9 tables)');

// Seed platforms (idempotent)
const platforms = [
  ['instagram','Instagram',2200,'Reels: 9:16 MP4, up to 90s ideal. Cover image recommended.','20 to 30 mixed-size hashtags; first comment strategy works.','Content Publishing API requires a Business account + Meta app review.',['META_APP_ID','META_APP_SECRET','IG_BUSINESS_ACCOUNT_ID','META_ACCESS_TOKEN']],
  ['facebook','Facebook',63206,'Reels or feed video, 9:16 or 4:5. Native upload outperforms links.','3 to 5 targeted hashtags max.','Uses the same Meta Graph API app as Instagram.',['META_APP_ID','META_APP_SECRET','FB_PAGE_ID','META_ACCESS_TOKEN']],
  ['tiktok','TikTok',2200,'9:16 MP4/WebM, 3s to 10min. Hook in first 2 seconds.','3 to 6 hashtags; 1 broad + niche mix.','Content Posting API requires an approved TikTok developer app (audited).',['TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET','TIKTOK_ACCESS_TOKEN']],
  ['youtube_shorts','YouTube Shorts',100,'9:16, under 60s, #Shorts in title or description.','#Shorts plus 2 to 3 topical tags.','YouTube Data API v3; quota costs per upload are significant.',['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN']],
];
for (const [id,name,limit,vg,hg,notes,keys] of platforms) {
  await sql`INSERT INTO social_platforms (id,name,char_limit,video_guidance,hashtag_guidance,notes,credentials_env_keys)
    VALUES (${id},${name},${limit},${vg},${hg},${notes},${keys}) ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO social_api_connections (platform_id, provider, env_keys_required, notes)
    VALUES (${id},'mock',${keys},'Mock provider active until real credentials are added')
    ON CONFLICT (platform_id) DO NOTHING`;
}
console.log('platforms seeded (4, mock connections)');

// Demo video + caption + scheduled post + mock metrics (only if library empty)
if ((await sql`SELECT 1 FROM social_videos LIMIT 1`).length === 0) {
  const [v] = await sql`INSERT INTO social_videos (title, description, category, topic, status, uploaded_by, duration_seconds, notes)
    VALUES ('What is a peptide? (60s explainer)','Demo record seeded by setup. Replace with a real finished video.','Education','Peptide basics','caption_ready','setup-seed',58,'Seeded example: safe to delete.')
    RETURNING id`;
  const [c] = await sql`INSERT INTO social_caption_variants (video_id, platform_id, style, caption, hook, hashtags, disclaimer, tone, status)
    VALUES (${v.id},'instagram','educational','Peptides are short chains of amino acids that act as signalling molecules in research contexts. Here is what that actually means, in one minute.','Everyone talks about peptides. Almost nobody explains them.','#peptides #scienceexplained #labresearch','For research and education only. Not medical advice.','calm expert','approved')
    RETURNING id`;
  await sql`INSERT INTO social_scheduled_posts (video_id, platform_id, caption_id, scheduled_at, status)
    VALUES (${v.id},'instagram',${c.id},NOW() + interval '1 day','awaiting_approval')`;
  console.log('demo video + caption + scheduled post seeded');
}

if (!env.includes('SOCIAL_DATABASE_URL=')) {
  writeFileSync(envPath, env.replace(/\n?$/, '\n') + `SOCIAL_DATABASE_URL=${socialUrl}\n`);
  console.log('SOCIAL_DATABASE_URL appended to .env.local');
}
console.log('DONE');
