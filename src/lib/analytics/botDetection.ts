/**
 * Is this visit a person, or a machine?
 *
 * WHY THIS EXISTS (task 522d09f1, 7 September 2026).
 *
 * Ross's affiliate link read "1 visit" before a single human being had opened it. The one visit
 * was WhatsApp: when you paste a link into a chat, WhatsApp fetches the page itself to draw the
 * little preview card with the title and image. That fetch looks exactly like a visit, so it was
 * counted as one. Search engines, monitoring tools and our own test scripts do the same thing.
 *
 * On a campaign with fifty visits one stray preview does not matter. On a brand new one it is the
 * difference between "nobody has clicked yet" and "somebody has", which is the entire question the
 * screen exists to answer.
 *
 * WHAT THIS IS NOT. It is not security and it cannot be. Anything can claim to be an iPhone, and
 * plenty of scrapers do. This catches the machines that announce themselves honestly, which is all
 * of the ones that were actually distorting the figures. A determined faker gets counted, and that
 * is an accepted limit rather than a bug to chase.
 *
 * WHY IT IS ITS OWN FILE. Four separate queries count visits and one records them. A list of robot
 * names copied into five places is five lists waiting to disagree, and the disagreement would show
 * up as two different visit totals on two different screens with nothing to say which was right.
 */

/**
 * Matched against the browser's own description of itself, lower-cased.
 *
 * Grouped so that the next person to edit this can see WHY each entry is here. Order does not
 * matter; a single hit is enough.
 */
const BOT_SIGNATURES: readonly string[] = [
  // Chat and social apps fetching a page to draw a preview card. These are the ones that were
  // actually inflating the campaign figures, because the links are shared by message.
  'whatsapp',
  'facebookexternalhit',
  'facebot',
  'twitterbot',
  'slackbot',
  'slack-imgproxy',
  'discordbot',
  'telegrambot',
  'linkedinbot',
  'skypeuripreview',
  'line-poker',
  'pinterestbot',
  'redditbot',
  'iframely',
  'embedly',
  'quora link preview',
  'vkshare',
  'w3c_validator',

  // Search engines and the crawlers that feed AI training sets. Harmless, but not customers.
  'googlebot',
  'google-inspectiontool',
  'storebot-google',
  'bingbot',
  'bingpreview',
  'applebot',
  'duckduckbot',
  'yandexbot',
  'baiduspider',
  'sogou',
  'exabot',
  'petalbot',
  'bytespider',
  'gptbot',
  'oai-searchbot',
  'chatgpt-user',
  'claudebot',
  'claude-web',
  'anthropic-ai',
  'perplexitybot',
  'ccbot',
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'seznambot',

  // Uptime and security monitoring, including our own Sentinel health check.
  'uptimerobot',
  'pingdom',
  'statuscake',
  'betteruptime',
  'site24x7',
  'newrelicpinger',
  'datadog',
  'vercel-screenshot',
  'vercel-favicon',
  'vercelbot',

  // Scripts and automated browsers. Covers our own testing, which was two of the four
  // non-human visits on the live shop when this was written.
  'headlesschrome',
  'playwright',
  'puppeteer',
  'phantomjs',
  'selenium',
  'curl/',
  'wget',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'httpx',
  'go-http-client',
  'node-fetch',
  'axios/',
  'okhttp',
  'java/',
  'libwww-perl',
  'guzzlehttp',
  'apache-httpclient',
  'postmanruntime',
  'insomnia',

  // Catch-alls for the robots nobody has thought of yet.
  'crawler',
  'spider',
  'scraper',
];

/**
 * A name ENDING in "bot", so "SomeBrandNewBot/1.0", "archive.org_bot" and "Slackbot-LinkExpanding"
 * are all caught without a hand-written entry each. Robots that arrive next year are covered by
 * this rather than by somebody noticing and editing the list.
 *
 * DELIBERATELY anchored at the end of the word, not a plain substring test. The failure that
 * matters here is the quiet one: a real customer recorded as a robot is worse than a robot
 * recorded as a customer, because an inflated number looks wrong and gets questioned while a
 * deflated one just looks like a bad week.
 *
 * Three in-app browsers were removed from the list above for the same reason. Pinterest, Snapchat
 * and Viber all put their own name in the user agent when a REAL PERSON taps a link inside the app,
 * which is exactly the customer these links are shared with. Only their preview fetchers are listed.
 */
const BOT_WORD = /bot\b/;

/**
 * True when the visit came from a machine rather than a person.
 *
 * A MISSING user agent counts as a bot. Every real browser sends one; something that sends none
 * is a script, and treating it as a person is the assumption that put a phantom visit on Ross's
 * link in the first place.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim().toLowerCase();
  if (!ua) return true;
  if (BOT_SIGNATURES.some((signature) => ua.includes(signature))) return true;
  return BOT_WORD.test(ua);
}

/**
 * A short, human name for what the machine was, for the admin screen.
 *
 * The screen says "2 previews and robots, not counted" and this is what fills in the detail when
 * somebody opens it. Kieran should be able to see WHAT was excluded, not just that something was:
 * a number that quietly got smaller with no way to check it is worse than the wrong number.
 */
export function describeBot(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? '').trim().toLowerCase();
  if (!ua) return 'Unknown script';
  if (ua.includes('whatsapp')) return 'WhatsApp link preview';
  if (ua.includes('facebookexternalhit') || ua.includes('facebot')) return 'Facebook link preview';
  if (ua.includes('twitterbot')) return 'X link preview';
  if (ua.includes('slackbot') || ua.includes('slack-imgproxy')) return 'Slack link preview';
  if (ua.includes('discordbot')) return 'Discord link preview';
  if (ua.includes('telegrambot')) return 'Telegram link preview';
  if (ua.includes('linkedinbot')) return 'LinkedIn link preview';
  if (ua.includes('googlebot') || ua.includes('google-inspectiontool')) return 'Google';
  if (ua.includes('bingbot') || ua.includes('bingpreview')) return 'Bing';
  if (ua.includes('applebot')) return 'Apple';
  if (ua.includes('gptbot') || ua.includes('claudebot') || ua.includes('perplexitybot') || ua.includes('ccbot')) {
    return 'AI crawler';
  }
  if (ua.includes('uptimerobot') || ua.includes('pingdom') || ua.includes('statuscake')) return 'Uptime monitor';
  if (ua.includes('headlesschrome') || ua.includes('playwright') || ua.includes('puppeteer')) return 'Automated browser';
  if (ua.startsWith('curl/') || ua.includes('wget') || ua.includes('python-requests')) return 'Test script';
  return 'Robot';
}
