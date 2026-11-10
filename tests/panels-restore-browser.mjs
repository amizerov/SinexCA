import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.request.get((process.env.BASE_URL||'http://localhost:3002')+'/api/auth/session');
 let hold=false,release;const gate=new Promise(resolve=>release=resolve);let depth=0;
 await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
 await context.route('**/api/auth/session',async route=>{if(hold)await gate;await route.continue();});
 await context.route('**/api/market/**',async route=>{
  const u=new URL(route.request().url()),exchange=u.searchParams.get('exchange')||'binance';
  if(u.pathname.endsWith('/pairs')&&hold)await gate;
  if(u.pathname.endsWith('/orderbook'))depth++;
  const data=u.pathname.endsWith('/pairs')?[{exchange,marketType:'spot',symbol:'ETHUSDT',baseAsset:'ETH',quoteAsset:'USDT'}]:u.pathname.endsWith('/orderbook')?{exchange,symbol:'ETHUSDT',bids:[{price:99,quantity:1}],asks:[{price:100,quantity:2}],receivedAt:Date.now(),exchangeTime:null}:[];
  await route.fulfill({json:{data}}).catch(()=>{});
 });
 const base=process.env.BASE_URL||'http://localhost:3002';await page.goto(base);
 await page.locator('.orderbook-button:enabled').click();await page.locator('.trades-toggle-button:enabled').click();
 await page.locator('.orderbook-window').waitFor();await page.locator('.trades-window').waitFor();
 await page.locator('.pair-select').click();
 hold=true;depth=0;await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.orderbook-window').waitFor({timeout:5000});await page.locator('.trades-window').waitFor({timeout:1000});await page.locator('.markets-panel').waitFor({timeout:1000});
 assert.equal(depth,0,'No orderbook request before the actual market symbol is known');
 assert.match(await page.locator('.orderbook-window h2').textContent(),/ETH/);assert.match(await page.locator('.trades-window h2').textContent(),/ETH/);
 release();await page.waitForFunction(()=>document.querySelector('.book-bids .book-row'));
 assert.ok(depth>0);assert.deepEqual(errors,[]);await context.close();
 console.log('PASS: saved book, trades and markets appear while session refresh and market catalog are delayed; book subscribes only after catalog arrives');
}finally{await browser.close();}
