import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://localhost:3002',browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await context.request.get(base+'/api/auth/session'),session=(await response.json()).data;
 assert.equal(typeof session.yandexAvailable,'boolean');
 await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
 await context.route('**/api/market/**',route=>route.fulfill({json:{data:[]}}));
 await page.goto(base);await page.locator('.account-button').click();const dialog=page.locator('dialog.account-dialog[open]');await dialog.waitFor();
 const yandex=dialog.locator('.yandex-button');await yandex.waitFor();assert.match(await yandex.textContent(),/Яндекс/);assert.equal(await yandex.isEnabled(),session.yandexAvailable);
 await page.setViewportSize({width:320,height:568});assert.ok(await yandex.isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const callback=await context.request.get(base+'/api/auth/yandex/callback?state=invalid&code=invalid',{maxRedirects:0});assert.equal(callback.status(),307);assert.equal(new URL(callback.headers().location).searchParams.get('auth_error'),'YANDEX_STATE_EXPIRED');
 if(!session.yandexAvailable){const start=await context.request.get(base+'/api/auth/yandex',{maxRedirects:0});assert.equal(start.status(),307);assert.equal(new URL(start.headers().location).searchParams.get('auth_error'),'YANDEX_UNAVAILABLE');}
 assert.deepEqual(errors,[]);await context.close();console.log('PASS Yandex button, configured availability, mobile layout, invalid callback rejection and unavailable configuration');
}finally{await browser.close();}
