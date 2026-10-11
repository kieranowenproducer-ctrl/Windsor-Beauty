// Browser checkout choices with isolated account/catalogue responses; no order is submitted.
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const base=process.env.CHECK_BASE??'http://localhost:3010';
const root=join(process.env.LOCALAPPDATA,'ms-playwright');
const executablePath=readdirSync(root).filter(n=>n.startsWith('chromium-')).sort().reverse().map(n=>join(root,n,'chrome-win64','chrome.exe')).find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
const product={id:'test',name:'Test Serum',slug:'test-serum',categories:['Skin'],variants:[{dosage:'30ml',price:20}]};
try {
  for (const width of [390,1280]) for (const eligible of [true,false]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const customer={id:1,email:eligible?'angela.jones99a@gmail.com':'other@example.invalid',firstName:'Test',lastName:'Customer',phone:'07123456789',addressLine1:'1 Test Lane',addressCity:'Windsor',addressPostcode:'SL4 1AA',addressCountry:'GB',handDeliveryEligible:eligible};
    await context.addInitScript(()=>{
      localStorage.setItem('wb_entry_confirmed_v2',String(Date.now()));
      sessionStorage.setItem('wb_entry_confirmed','true');
      sessionStorage.setItem('wb_discount_popup_seen','true');
      localStorage.setItem('wb_cart_v2',JSON.stringify({owner:'customer:1',items:[{productId:'test',name:'Test Serum',slug:'test-serum',variant:'30ml',price:20,quantity:1}]}));
    });
    const responses={
      '/api/account/me':{customer},
      '/api/account/welcome-code':{},
      '/api/products/catalogue':{overrides:{'test-serum':product}},
      '/api/products/visibility':{hidden:[]},
      '/api/products/stock':{stock:{'test-serum':{'30ml':10}}},
      '/api/products/hair-bundle':{bundle:null},
      '/api/cart/validate':{allowedSlugs:['test-serum']},
      '/api/shipping-rates':{ukStandardRate:10,internationalRate:40},
      '/api/cart/promotion-preview':{subtotal:20,subtotalAfterRules:20,ruleDiscountAmount:0,appliedRules:[],freeItems:[]},
    };
    await context.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.includes('place-order')||path.includes('/payment/')) throw new Error('Order/payment forbidden');
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(responses[path]??{})});
    });
    const page=await context.newPage();
    await page.goto(base+'/checkout');
    await page.getByLabel('Email Address').waitFor();
    await page.getByRole('button',{name:'Continue to Shipping'}).click();
    const hand=page.locator('input[name="shipping"][value="hand"]');
    await page.getByText('Shipping Method',{exact:true}).waitFor();
    assert.equal(await hand.count(),eligible?1:0);
    if(eligible){
      assert.equal(await hand.isChecked(),true);
      assert.match(await hand.locator('xpath=ancestor::label').innerText(),/£0\.00/);
      await page.getByText('UK Delivery',{exact:true}).click();
      assert.equal(await page.locator('input[value="uk"]').isChecked(),true);
      await page.getByText('Hand delivered',{exact:true}).click();
      assert.equal(await hand.isChecked(),true);
      await page.getByRole('button',{name:'Continue to Payment'}).click();
      await page.getByRole('button',{name:/Pay by Bank/}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:process.env.TEMP+`/beauty-hand-delivery-${width}.png`,fullPage:false});
    }
    await context.close();
  }
  console.log('PASS: desktop and phone show £0 hand delivery only for eligible account, select it by default, retain postal alternative and reach payment without overflow.');
} finally {await browser.close();}
