import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({channel:"chrome",headless:true}),base=process.env.BASE_URL||"http://127.0.0.1:3017";
async function run(authorized){
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),errors=[];
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance";
    const data=url.pathname.endsWith("/pairs")?["BTC","ETH"].map(baseAsset=>({exchange,marketType:"spot",symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:"USDT"})):url.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:1700000000+i*3600,open:100,high:102,low:99,close:101,volume:10})):url.pathname.endsWith("/orderbook")?{exchange,symbol:url.searchParams.get("symbol"),bids:[{price:100,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:[];
    return route.fulfill({json:{data}});
  });
  if(authorized){await context.request.get(`${base}/api/auth/session`);assert.equal((await context.request.post(`${base}/api/auth/register`,{data:{email:`windows-${crypto.randomUUID()}@example.com`,password:"Windows-test-password-123456"}})).status(),200);}
  let workspaceReads=0;
  context.on("request",r=>{if(new URL(r.url()).pathname==="/api/workspace"&&r.method()==="GET")workspaceReads++;});
  const a=await context.newPage();a.on("pageerror",e=>errors.push(e.message));await a.goto(base);await a.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();
  async function open(page){await page.locator(".current-layout").click();return page.getByRole("dialog",{name:"Управление макетами",exact:true});}
  async function copy(page,name){const manager=await open(page);await manager.getByRole("button",{name:"Сохранить как…",exact:true}).click();await page.getByLabel("Название макета",{exact:true}).fill(name);await page.getByRole("button",{name:"Создать",exact:true}).click();await page.getByRole("dialog",{name:"Управление макетами",exact:true}).getByRole("button",{name:"Закрыть",exact:true}).click();}
  async function choose(page,name){const manager=await open(page);await manager.getByRole("button",{name,exact:true}).click();const prompt=page.getByRole("dialog",{name:"Сохранить изменения?",exact:true});if(await prompt.count())await prompt.getByRole("button",{name:"Перейти без сохранения",exact:true}).click();await page.locator(".layout-dialog").waitFor({state:"detached"});}
  const expectWindow=async(page,name,exchange,tf)=>{await page.locator(".current-layout").filter({hasText:`Макет: ${name}`}).waitFor();assert.equal(await page.locator(".exchange-select").inputValue(),exchange);assert.equal(await page.locator(".timeframe-select").inputValue(),tf);};
  await copy(a,"Монитор 1");await a.locator(".timeframe-select").selectOption("5m",{force:true});
  const b=await context.newPage();b.on("pageerror",e=>errors.push(e.message));await b.goto(base);await b.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();
  await b.locator(".exchange-select").selectOption("bybit",{force:true});await b.locator(".pair-row").filter({hasText:"ETH/USDT"}).click();await b.locator(".timeframe-select").selectOption("15m",{force:true});await copy(b,"Монитор 2");await b.locator(".timeframe-select").selectOption("30m",{force:true});
  await a.bringToFront();await expectWindow(a,"Монитор 1","binance","5m");await a.reload();await a.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();await expectWindow(a,"Монитор 1","binance","5m");
  await b.bringToFront();await b.reload();await b.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();await expectWindow(b,"Монитор 2","bybit","30m");
  await a.bringToFront();await choose(a,"Монитор 2");await expectWindow(a,"Монитор 2","bybit","15m");
  await b.bringToFront();await expectWindow(b,"Монитор 2","bybit","30m");await choose(b,"Монитор 1");await expectWindow(b,"Монитор 1","binance","1h");
  await a.bringToFront();await expectWindow(a,"Монитор 2","bybit","15m");await a.locator(".timeframe-select").selectOption("4h",{force:true});let manager=await open(a);await manager.getByRole("button",{name:"Сохранить текущий",exact:true}).click();await manager.getByRole("button",{name:"Закрыть",exact:true}).click();
  await b.bringToFront();await expectWindow(b,"Монитор 1","binance","1h");await b.reload();await b.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();await expectWindow(b,"Монитор 1","binance","1h");
  manager=await open(b);assert.equal(await manager.getByRole("button",{name:"Монитор 2",exact:true}).count(),1);await manager.getByRole("button",{name:"Закрыть",exact:true}).click();
  await a.reload();await a.locator(".chart-caption").filter({hasText:"100 свечей"}).waitFor();await expectWindow(a,"Монитор 2","bybit","4h");
  assert.ok(workspaceReads<70,`No refresh ping-pong: ${workspaceReads} reads`);assert.deepEqual(errors,[]);
  console.log(`PASS ${authorized?"account":"guest"}: independent layouts, exchanges, intervals and drafts; focus/reload; shared library; no refresh loop`);await context.close();
}
try{await run(false);await run(true);}finally{await browser.close();}
