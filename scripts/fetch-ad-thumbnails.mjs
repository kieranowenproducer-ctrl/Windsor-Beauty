/**
 * Saves a picture of each advert so the report can show what each one actually looked like.
 *
 *     node scripts/fetch-ad-thumbnails.mjs
 *
 * Meta's thumbnail addresses expire within hours, so the picture is downloaded and written to
 * disk as a file the report can embed. It asks Meta ONCE for every account, never in a loop:
 * this ad account is on development access and has hit "too many API calls" before.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const { listAds, accountIds, isMetaAdsConfigured } = await import('../src/lib/ads/meta.ts');
if (!isMetaAdsConfigured()) { console.error('Meta is not configured here: no META_SYSTEM_USER_TOKEN.'); process.exit(1); }

const DIR = 'C:/Users/kiera/Downloads/Windsor Glow ad pictures';
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

// Meta's `thumbnail_url` is a fixed 64 by 64 pixels and ignores any size asked of it, which is
// too small to recognise an advert by. `image_url` is the full-size creative, and for a boosted
// post `effective_object_story_id` points at the post itself. Ask for all three in one call per
// account and use the best that comes back.
const GRAPH = 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_SYSTEM_USER_TOKEN;
const seen = new Map();
for (const act of accountIds()) {
  console.log('asking Meta for the adverts on ' + act + ' (one call)…');
  const url = GRAPH + '/' + act + '/ads?limit=500&access_token=' + encodeURIComponent(TOKEN)
    + '&fields=' + encodeURIComponent('id,name,campaign_id,creative{image_url,thumbnail_url,instagram_permalink_url,effective_object_story_id,object_story_spec}');
  const res = await fetch(url);
  const body = await res.json();
  if (body.error) { console.error('  Meta said: ' + body.error.message); continue; }
  for (const ad of body.data ?? []) {
    const c = ad.creative ?? {};
    if (!seen.has(ad.id)) seen.set(ad.id, {
      id: ad.id, name: ad.name, campaignId: ad.campaign_id,
      thumbnailUrl: c.image_url || c.thumbnail_url || null,
      fullSize: Boolean(c.image_url),
      instagramUrl: c.instagram_permalink_url ?? null,
      storyId: c.effective_object_story_id ?? null,
    });
  }
  console.log('  ' + (body.data?.length ?? 0) + ' adverts');
}

// A boosted post has no uploaded creative image, so `image_url` comes back empty and all Meta
// offers is the 64 pixel thumbnail. The post itself does have a full picture, and one batched
// call fetches every one of them at once rather than one call per advert.
const needStory = [...seen.values()].filter((a) => !a.fullSize && a.storyId);
if (needStory.length) {
  const ids = [...new Set(needStory.map((a) => a.storyId))];
  console.log('fetching the full picture for ' + ids.length + ' boosted posts…');
  // One call each, in order, with a breath between them. The batched "?ids=" form was removed in
  // v26, and this account is on development access, so a steady walk beats a burst.
  const picture = new Map();
  for (const id of ids) {
    const url = GRAPH + '/' + encodeURIComponent(id) + '?fields=full_picture,permalink_url&access_token=' + encodeURIComponent(TOKEN);
    const body = await fetch(url).then((r) => r.json()).catch(() => ({}));
    if (body.error) { console.error('  ' + id + ': ' + body.error.message); continue; }
    if (body.full_picture) picture.set(id, body.full_picture);
    await new Promise((r) => setTimeout(r, 400));
  }
  for (const a of needStory) {
    const p = picture.get(a.storyId);
    if (p) { a.thumbnailUrl = p; a.fullSize = true; }
  }

  // Meta's own post pictures need a permission this token does not carry, so for anything still
  // stuck at 64 pixels we go to the public Instagram post instead and take the picture it shows
  // to anybody. No login, nothing private: the same image a stranger sees on the post.
  const stillSmall = [...seen.values()].filter((a) => !a.fullSize && a.instagramUrl);
  if (stillSmall.length) {
    console.log('reading the public Instagram post for ' + stillSmall.length + ' adverts…');
    for (const a of stillSmall) {
      try {
        const page = await fetch(a.instagramUrl, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then((r) => r.text());
        const m = page.match(/og:image"\s+content="([^"]+)"/);
        if (m) { a.thumbnailUrl = m[1].replace(/&amp;/g, '&'); a.fullSize = true; }
      } catch { /* leave it on the small thumbnail */ }
      await new Promise((r) => setTimeout(r, 600));
    }
    console.log('  got ' + stillSmall.filter((a) => a.fullSize).length + ' of ' + stillSmall.length);
  }
  console.log('  got ' + needStory.filter((a) => a.fullSize).length + ' of ' + needStory.length);
}

const index = [];
for (const [id, ad] of seen) {
  const safe = (ad.name || id).replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 70);
  if (!ad.thumbnailUrl) { console.log('no picture: ' + safe); index.push({ id, name: ad.name, file: null, campaignId: ad.campaignId, instagramUrl: ad.instagramUrl }); continue; }
  // Meta hands back a 64 by 64 pixel thumbnail by default, which is too small to recognise an
  // advert by. The same address takes a size, so ask for something a person can actually see.
  const big = ad.thumbnailUrl.includes('?')
    ? ad.thumbnailUrl.replace(/([?&])(width|height)=\d+/g, '$1$2=600') + '&width=600&height=600'
    : ad.thumbnailUrl + '?width=600&height=600';
  try {
    const res = await fetch(big).catch(() => fetch(ad.thumbnailUrl));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (res.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
    const file = safe + ' [' + id + '].' + ext;
    writeFileSync(DIR + '/' + file, buf);
    index.push({ id, name: ad.name, campaignId: ad.campaignId, file, bytes: buf.length, dataUri: 'data:image/' + ext + ';base64,' + buf.toString('base64'), instagramUrl: ad.instagramUrl });
    console.log('saved ' + file + ' (' + Math.round(buf.length / 1024) + ' KB)');
  } catch (e) {
    console.log('could not download for ' + safe + ': ' + e.message);
    index.push({ id, name: ad.name, file: null, campaignId: ad.campaignId, instagramUrl: ad.instagramUrl });
  }
}

writeFileSync('scripts/ad-thumbnails.json', JSON.stringify(index, null, 2), 'utf8');
console.log('\nwrote scripts/ad-thumbnails.json with ' + index.filter((x) => x.dataUri).length + ' pictures');
console.log('pictures also saved as files in: ' + DIR);
