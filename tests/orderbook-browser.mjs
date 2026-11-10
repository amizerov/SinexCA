import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];let requests=0,closed=0;
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>{
    if(socket.url().includes("@depth20")){
      let update=0;const send=()=>socket.send(JSON.stringify({lastUpdateId:++update,bids:Array.from({length:20},(_,i)=>[(100.12345-i*.01).toFixed(5),"2"]),asks:Array.from({length:20},(_,i)=>[(100.12346+i*.01).toFixed(5),"3"])}));
      send();const timer=setInterval(send,100);socket.onClose(()=>{closed++;clearInterval(timer);});
    }else socket.close();
  });
  await context.route("**/api/market/**",async route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",coinbase=exchange==="coinbase",symbol=coinbase?"BTC-USD":"BTCUSDT";
    if(url.pathname.endsWith("/orderbook")){
      requests++;await new Promise(resolve=>setTimeout(resolve,700));
      return route.fulfill({json:{data:{exchange,symbol,bids:[{price:90,quantity:4}],asks:[{price:91,quantity:5}],receivedAt:Date.now(),exchangeTime:null}}}).catch(()=>{});
    }
    return route.fulfill({json:{data:url.pathname.endsWith("/pairs")?[{exchange,marketType:"spot",symbol,baseAsset:"BTC",quoteAsset:coinbase?"USD":"USDT"}]:[]}});
  });
  await page.goto(baseURL);const trigger=page.getByRole("button",{name:"Показать стакан",exact:true});await trigger.waitFor();
  assert.equal(requests,0,"Closed dialog never requests market depth");
  await trigger.click();const dialog=page.getByRole("dialog",{name:/^Стакан /});await dialog.waitFor();
  await dialog.getByRole("status",{name:"WebSocket",exact:true}).waitFor();
  await dialog.getByRole("cell",{name:"100,12345",exact:true}).waitFor();
  if(await dialog.getByRole("button",{name:"Открепить стакан",exact:true}).count())await dialog.getByRole("button",{name:"Открепить стакан",exact:true}).click();
  await page.waitForTimeout(1000);assert.equal(await dialog.getByRole("cell",{name:"90",exact:true}).count(),0,"Late REST response cannot replace newer stream data");
  assert.equal(await dialog.getAttribute("aria-modal"),"false");assert.equal(await page.locator("dialog[open]").count(),0);
  assert.equal(await dialog.getByRole("combobox").count(),0);
  assert.equal(await dialog.locator(".book-footnote").count(),0);
  assert.match(await dialog.getByRole("columnheader").first().textContent(),/^Цена/);
  const bid=dialog.locator(".book-bids .book-row").first(),ask=dialog.locator(".book-asks .book-row").last();
  assert.equal(await bid.getByRole("cell").nth(1).textContent(),"2");assert.equal(await ask.getByRole("cell").nth(1).textContent(),"3");
  assert.equal(await dialog.locator('[data-book-total="buy"]').textContent(),"Σ 40 BTC");assert.equal(await dialog.locator('[data-book-total="sell"]').textContent(),"Σ 60 BTC");
  async function checkCenteredBook(){assert.ok(await dialog.locator('.book-depth-scroll').evaluate(node=>{const box=node.getBoundingClientRect(),spread=node.querySelector('.book-spread').getBoundingClientRect();return getComputedStyle(node).overflowY==='clip'&&node.scrollTop===0&&Math.abs((spread.top+spread.bottom-box.top-box.bottom)/2)<1;}),'Spread remains centered without a scroll container');}
  await checkCenteredBook();
  const initial=await dialog.boundingBox();assert.ok(initial.width<=310);
  const header=dialog.locator(".orderbook-window-header"),head=await header.boundingBox();
  await page.mouse.move(head.x+40,head.y+16);await page.mouse.down();await page.mouse.move(head.x-460,head.y+76,{steps:8});await page.mouse.up();
  const moved=await dialog.boundingBox();assert.ok(moved.x<initial.x-400);assert.ok(moved.y>initial.y+40);
  await page.mouse.move(moved.x+moved.width-3,moved.y+moved.height-3);await page.mouse.down();await page.mouse.move(moved.x+moved.width+77,moved.y+moved.height+97,{steps:8});await page.mouse.up();
  await checkCenteredBook();
  const resized=await dialog.boundingBox();assert.ok(resized.width>moved.width+60);assert.ok(resized.height>moved.height+80);
  const interval=page.getByRole("button",{name:"1m",exact:true});await interval.click();assert.equal(await interval.getAttribute("aria-pressed"),"true");assert.equal(await dialog.isVisible(),true,"Chart stays interactive while the book is open");
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("sinex:workspace:guest")).settings.orderBookWindow);assert.equal(saved.width,resized.width);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/orderbook-desktop.png"});
  await header.focus();await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});await page.waitForTimeout(1200);const afterClose=requests;await page.waitForTimeout(1200);assert.equal(requests,afterClose);assert.ok(closed>=1,"Socket closes on dialog dismiss");
  await page.getByRole("button",{name:"Coinbase",exact:true}).click();await trigger.click();await dialog.waitFor();
  await dialog.getByRole("cell",{name:"90",exact:true}).waitFor();assert.ok((await dialog.textContent()).includes("BTC/USD"));await dialog.getByRole("status",{name:"REST · 1с",exact:true}).waitFor();
  assert.equal((await dialog.boundingBox()).width,resized.width);assert.equal((await dialog.boundingBox()).x,resized.x);
  await page.reload();await dialog.getByRole("cell",{name:"90",exact:true}).waitFor();
  assert.ok((await dialog.textContent()).includes("Coinbase · BTC/USD"));
  assert.equal((await dialog.boundingBox()).width,resized.width);assert.equal((await dialog.boundingBox()).x,resized.x);
  await page.goto(`${baseURL}/account`);await page.getByRole("link",{name:"К графику",exact:true}).waitFor();
  assert.equal(await page.getByRole("dialog",{name:/^Стакан /}).count(),0,"The account page does not keep a background orderbook subscription");
  await page.getByRole("link",{name:"К графику",exact:true}).click();await dialog.getByRole("cell",{name:"90",exact:true}).waitFor();
  assert.ok((await dialog.textContent()).includes("Coinbase · BTC/USD"));
  assert.equal((await dialog.boundingBox()).width,resized.width);assert.equal((await dialog.boundingBox()).x,resized.x);
  assert.equal(await page.getByRole("button",{name:"Coinbase",exact:true}).getAttribute("aria-pressed"),"true");
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await dialog.evaluate(node=>{const box=node.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;}));
  await page.screenshot({path:".qa/orderbook-mobile.png"});await dialog.getByRole("button",{name:"Закрыть стакан"}).click();
  await page.reload();await page.getByRole("button",{name:"Показать стакан",exact:true}).waitFor();assert.equal(await dialog.count(),0,"Closing the window persists after reload");
  assert.deepEqual(errors,[]);console.log("PASS floating orderbook, volumes, drag/resize, route/reload/closed state and market persistence, WS/REST race, cleanup and mobile bounds");
}finally{await browser.close();}
