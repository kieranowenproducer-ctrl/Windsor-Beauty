import { getSiteContent, isDbConfigured } from '@/lib/db';
import { DEFAULT_ANNOUNCEMENT_TEXT } from '@/lib/policyDefaults';
import AnnouncementTicker from './AnnouncementTicker';

// Reads the admin-editable announcement on the server; the strip itself is a
// client component because stopping it needs a button. See AnnouncementTicker.
export default async function AnnouncementBar() {
  let text = DEFAULT_ANNOUNCEMENT_TEXT;

  if (isDbConfigured()) {
    const content = await getSiteContent('announcement-bar').catch(() => null);
    if (content?.body?.trim()) text = content.body.trim();
  }

  return <AnnouncementTicker text={text} />;
}
