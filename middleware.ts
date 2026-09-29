import { NextResponse } from "next/server";

// Maintenance mode: while on, every page on the live site shows the
// "under maintenance" screen below instead of the shop.
//
// On by default. To reopen the site, set MAINTENANCE_MODE=off in the Vercel
// project settings and redeploy (or change the line below and push).
// Running locally with `npm run dev` always shows the real site, so work
// can carry on while the public site is closed.
const MAINTENANCE_ON =
  process.env.MAINTENANCE_MODE !== "off" && process.env.NODE_ENV !== "development";

const PAGE = `<!doctype html>
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
    padding:32px 20px;background:#FBF7F1;color:#2B2723;
    font-family:"Outfit",system-ui,sans-serif;font-weight:300;
    -webkit-font-smoothing:antialiased;text-align:center;
  }
  main{max-width:440px;width:100%}
  .mark{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:34px;letter-spacing:.04em}
  .sub{margin-top:6px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8A8278}
  .rule{width:48px;height:1px;background:#C7A769;margin:36px auto}
  h1{font-family:"Cormorant Garamond",serif;font-weight:400;font-size:28px;line-height:1.25}
  p{margin-top:16px;font-size:15px;line-height:1.7;color:#8A8278}
</style>
</head>
<body>
<main>
  <div class="mark">Windsor Beauty</div>
  <div class="sub">Skincare &middot; London</div>
  <div class="rule"></div>
  <h1>We are making a few improvements</h1>
  <p>Our shop is closed for a short while as we work on the website. Please check back soon.</p>
</main>
</body>
</html>`;

export function middleware() {
  if (!MAINTENANCE_ON) return NextResponse.next();
  // 503 tells search engines the closure is temporary, so rankings are kept.
  return new NextResponse(PAGE, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "86400",
      "Cache-Control": "no-store",
    },
  });
}

// Every page and API route is covered; only the build's own files and images are left out.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
