import {chromium} from "playwright-core";
import assert from "node:assert/strict";

const base=process.env.BASE_URL||"http://127.0.0.1:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.route("**/api/auth/session",route=>route.fulfill({json:{data:{ownerId:"guest-panels",user:null,googleAvailable:false,yandexAvailable:false}}}));
  await context.route("**/api/paper/orders",route=>route.fulfill({json:{ownerId:"guest-panels",orders:[],fills:[],account:{balances:[]},health:{checkedAt:Date.now(),errors:[]}}}));
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",symbol="BTCUSDT",pair={exchange,marketType:"spot",symbol,baseAsset:"BTC",quoteAsset:"USDT"};
    const data=url.pathname.endsWith("/pairs")?[pair]:url.pathname.endsWith("/orderbook")?{exchange,symbol,bids:[{price:99,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:url.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:Math.floor(Date.now()/3600000)*3600-(99-i)*3600,open:100,high:105,low:95,close:100,volume:2})):[{exchange,symbol,lastPrice:100,high24h:105,low24h:95,priceChangePercent24h:0,quoteVolume24h:10000,receivedAt:Date.now()}];
    return route.fulfill({json:{data}});
  });
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await page.goto(base);
  const book=page.getByRole("dialog",{name:"Стакан BTC",exact:true}),trades=page.getByRole("dialog",{name:"Сделки BTC",exact:true}),markets=page.locator('[data-dock-panel="markets"]');
  await book.waitFor();await trades.waitFor();await markets.waitFor();await page.locator(".column-stacked").waitFor();
  await page.waitForFunction(()=>localStorage.getItem("sinex:guest-panels:v1")==="1");
  assert.ok((await book.getAttribute("class")).includes("orderbook-docked"));
  assert.equal(await page.locator('.column-right [data-dock-panel="markets"]').count(),1);
  assert.equal(await page.locator('.column-right [data-dock-panel="trades"]').count(),1);
  assert.equal(await page.getByRole("button",{name:/^Показать (стакан|рынки|сделки)$/}).count(),0);

  await book.getByRole("button",{name:"Закрыть стакан",exact:true}).click();
  await trades.getByRole("button",{name:"Закрыть сделки",exact:true}).click();
  await markets.getByRole("button",{name:"Скрыть список пар",exact:true}).click();
  await page.reload();
  await page.getByRole("button",{name:"Показать стакан",exact:true}).waitFor();
  await page.getByRole("button",{name:"Показать сделки",exact:true}).waitFor();
  await page.getByRole("button",{name:"Показать рынки",exact:true}).waitFor();
  assert.equal(await page.locator(".book-terminal,.trades-window,.markets-panel").count(),0);
  assert.deepEqual(errors,[]);
  console.log("PASS: clean guest sees order book, markets and public trades by default; explicit closing persists");
}finally{await browser.close();}
