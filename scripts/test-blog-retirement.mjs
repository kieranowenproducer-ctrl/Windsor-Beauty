// Proves retired Windsor Glow blog material cannot be served or consulted by the live app.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const absent = [
  'src/app/blog/page.tsx',
  'src/app/blog/[slug]/page.tsx',
  'src/app/admin/blog/page.tsx',
  'src/app/api/blog/related/route.ts',
  'src/app/api/admin/tasks/agent-blog-search/route.ts',
  'src/lib/db/blog.ts',
  'src/data/blogSeedPosts.ts',
  'public/images/blog',
];

for (const file of absent) assert.equal(existsSync(file), false, `${file} must not remain in the live app`);

const schema = readFileSync('src/lib/db/schema-parts/reviews-and-blog.ts', 'utf8');
const sidebar = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
const sitemap = readFileSync('src/app/sitemap.ts', 'utf8');
const footer = readFileSync('src/lib/footerContent.ts', 'utf8');

assert.doesNotMatch(schema, /blog_posts/);
assert.doesNotMatch(sidebar, /\/admin\/blog/);
assert.doesNotMatch(sitemap, /\/blog/);
assert.doesNotMatch(footer, /href: '\/blog'/);

console.log('Blog retirement checks passed.');
