// Posting provider abstraction. Real platform APIs plug in later by
// implementing SocialProvider and flipping the registry entry; until then
// MockProvider simulates the full lifecycle so every workflow is testable.
// Official APIs only — no scraping or browser automation, ever.

export interface PublishInput {
  platformId: string;
  videoUrl: string | null;
  caption: string;
  hashtags: string | null;
  scheduledPostId: string;
}
export interface PublishResult { ok: boolean; platformPostId?: string; postUrl?: string; error?: string }
export interface PostMetrics { views: number; likes: number; comments: number; shares: number; saves?: number; watchTimeSeconds?: number }

export interface SocialProvider {
  readonly name: string;
  validateConnection(): Promise<{ connected: boolean; detail: string }>;
  publishPost(input: PublishInput): Promise<PublishResult>;
  fetchPostMetrics(platformPostId: string): Promise<PostMetrics | null>;
  refreshToken(): Promise<boolean>;
  getAccountInfo(): Promise<{ label: string } | null>;
}

// ── Mock provider: deterministic-ish fake lifecycle for end-to-end testing ──
export class MockProvider implements SocialProvider {
  readonly name = 'mock';
  constructor(private platformId: string) {}
  async validateConnection() {
    return { connected: true, detail: 'Mock provider (no real platform connection)' };
  }
  async publishPost(input: PublishInput): Promise<PublishResult> {
    const id = `mock_${this.platformId}_${input.scheduledPostId.slice(0, 8)}`;
    return { ok: true, platformPostId: id, postUrl: `https://example.com/${this.platformId}/${id}` };
  }
  async fetchPostMetrics(platformPostId: string): Promise<PostMetrics> {
    // Pseudo-random but stable per post id, so repeated imports look consistent
    let seed = 0;
    for (const ch of platformPostId) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
    const rand = (max: number, salt: number) => Math.floor(((seed * (salt + 7)) % 997) / 997 * max);
    const views = 500 + rand(20000, 1);
    return {
      views,
      likes: Math.floor(views * (0.03 + rand(80, 2) / 1000)),
      comments: Math.floor(views * (0.002 + rand(10, 3) / 1000)),
      shares: Math.floor(views * (0.005 + rand(15, 4) / 1000)),
      saves: Math.floor(views * (0.004 + rand(12, 5) / 1000)),
      watchTimeSeconds: views * (8 + rand(25, 6)),
    };
  }
  async refreshToken() { return true; }
  async getAccountInfo() { return { label: `Mock ${this.platformId} account` }; }
}

// Placeholder real providers: constructed but report not-connected until the
// required env keys exist. Implement the TODOs when credentials arrive.
class NotConnectedProvider implements SocialProvider {
  constructor(readonly name: string, private envKeys: string[]) {}
  private missing(): string[] { return this.envKeys.filter((k) => !process.env[k]); }
  async validateConnection() {
    const missing = this.missing();
    return missing.length
      ? { connected: false, detail: `Missing env: ${missing.join(', ')}` }
      : { connected: false, detail: 'Credentials present. API implementation pending.' };
  }
  async publishPost(): Promise<PublishResult> { return { ok: false, error: `${this.name} API not implemented yet` }; }
  async fetchPostMetrics() { return null; }
  async refreshToken() { return false; }
  async getAccountInfo() { return null; }
}

export function getProvider(platformId: string, providerName: string): SocialProvider {
  if (providerName === 'mock') return new MockProvider(platformId);
  switch (platformId) {
    case 'instagram': return new NotConnectedProvider('instagram', ['META_APP_ID', 'META_APP_SECRET', 'IG_BUSINESS_ACCOUNT_ID', 'META_ACCESS_TOKEN']);
    case 'facebook': return new NotConnectedProvider('facebook', ['META_APP_ID', 'META_APP_SECRET', 'FB_PAGE_ID', 'META_ACCESS_TOKEN']);
    case 'tiktok': return new NotConnectedProvider('tiktok', ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_ACCESS_TOKEN']);
    case 'youtube_shorts': return new NotConnectedProvider('youtube', ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']);
    default: return new MockProvider(platformId);
  }
}
