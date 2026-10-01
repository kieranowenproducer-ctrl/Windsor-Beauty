// THE HOLDING SCREEN. Windsor Beauty is not open to the public yet.
//
// While this is on, every visitor to the live site gets the "We are making a few
// improvements" screen below instead of the shop: every page, and every back-end
// address too (checkout, payments, contact form, scheduled jobs, webhooks), so
// nothing unfinished can be reached or set off from outside.
//
// On by default. It only comes off when MAINTENANCE_MODE=off is set in the
// Vercel project settings and the site is redeployed. That is the launch switch
// and it is a deliberate act: nothing in the code turns it off.
//
// Two ways to see the real shop while it is on:
//   1. `npm run dev` on your own computer always shows the real site.
//   2. On the live site, sign in at /admin/login. Signed-in staff see the real
//      shop; everybody else keeps seeing the holding screen.
//   3. Type the access code into the box on the holding screen. That browser then
//      sees the real shop for 30 days. The code is 1379 unless PREVIEW_ACCESS_CODE
//      is set on the live host. It is a short code for showing people round, not
//      a lock: anything that must stay private belongs behind the admin sign-in.
import { NextResponse } from 'next/server';
import tailwindConfig from '../../tailwind.config.js';
const brand = tailwindConfig.theme!.extend!.colors as { white: string; gold: Record<number, string>; stone: Record<number, string> };

export function isHoldingScreenOn(): boolean {
  return process.env.MAINTENANCE_MODE !== 'off' && process.env.NODE_ENV !== 'development';
}

export const PREVIEW_COOKIE = 'wb_preview_access';

export function previewAccessCode(): string {
  return process.env.PREVIEW_ACCESS_CODE?.trim() || '1379';
}

const page = (wrongCode: boolean) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Windsor Beauty | Back soon</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Outfit:wght@300;400&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    padding:32px 20px;background:${brand.stone[50]};color:${brand.stone[900]};
    font-family:"Outfit",system-ui,sans-serif;font-weight:300;
    -webkit-font-smoothing:antialiased;text-align:center;
  }
  main{max-width:440px;width:100%}
  .logo{display:block;width:240px;max-width:100%;height:auto;margin:0 auto 12px}
  .mark{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:34px;letter-spacing:.04em}
  .sub{margin-top:6px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:${brand.stone[600]}}
  .rule{width:48px;height:1px;background:${brand.gold[400]};margin:36px auto}
  h1{font-family:"Cormorant Garamond",serif;font-weight:400;font-size:28px;line-height:1.25}
  p{margin-top:16px;font-size:15px;line-height:1.7;color:${brand.stone[600]}}
  form{margin-top:44px;display:flex;gap:8px;justify-content:center}
  label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  input{width:150px;padding:11px 12px;border:1px solid ${brand.gold[200]};background:${brand.white};color:${brand.stone[900]};font:inherit;font-size:14px;letter-spacing:.2em;text-align:center}
  input:focus{outline:2px solid ${brand.gold[400]};outline-offset:1px}
  button{padding:11px 18px;border:0;background:${brand.gold[700]};color:${brand.white};font:inherit;font-size:11px;letter-spacing:.2em;text-transform:uppercase;cursor:pointer}
  button:hover{background:${brand.gold[800]}}
  .err{margin-top:12px;font-size:13px;color:#9A3B2E}
</style>
</head>
<body>
<main>
  <img class="logo" src="/images/windsor-beauty-logo-transparent.png" alt="Windsor Beauty">
  <div class="sub">Skincare &middot; London</div>
  <div class="rule"></div>
  <h1>We are making a few improvements</h1>
  <p>Our shop is closed for a short while as we work on the website. Please check back soon.</p>
  <form method="get" action="/">
    <label for="access">Access code</label>
    <input id="access" name="access" type="password" inputmode="numeric" autocomplete="off" placeholder="Access code" required>
    <button type="submit">Enter</button>
  </form>
  ${wrongCode ? '<p class="err" role="alert">That code was not recognised. Please try again.</p>' : ''}
</main>
</body>
</html>`;

// 503 tells search engines the closure is temporary.
export function holdingResponse(pathname: string, wrongCode = false): NextResponse {
  const headers = { 'Retry-After': '86400', 'Cache-Control': 'no-store' };
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Windsor Beauty is not open yet.' }, { status: 503, headers });
  }
  return new NextResponse(page(wrongCode), {
    status: 503,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
