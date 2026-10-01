import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { EMAIL_PREVIEW_TYPES, buildEmailPreview } from '../src/lib/email/previews.ts';
const browser = await chromium.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true });
const page = await browser.newPage();
const logo='data:image/png;base64,'+readFileSync('public/images/email/email-logo.png').toString('base64');
const results=[];
for(const width of [320,390,700]) for(const colorScheme of ['light','dark']) {
 await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme});
 for(const type of EMAIL_PREVIEW_TYPES){let html=buildEmailPreview(type).html.replace(/https?:[^" ]+\/images\/email\/email-logo-20261001.png/g,logo);await page.setContent(html);let fit=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));results.push({type,width,colorScheme,...fit});if(fit.scroll>width)throw new Error(`${type} overflows at ${width}: ${fit.scroll}`);if(width===390&&colorScheme==='light'&&['invoice','paid','enquiry-reply'].includes(type))await page.screenshot({path:`.email-previews/${type}-phone.png`,fullPage:true});}
}
writeFileSync('.email-previews/layout-results.json',JSON.stringify(results,null,2));console.log(`PASS ${results.length} email layouts: 320, 390 and 700px, light and dark browser modes. Actual inbox apps not checked.`);await browser.close();

