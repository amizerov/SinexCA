import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  const assets=["BTC","ETH",...Array.from({length:598},(_,i)=>"COIN"+i)];
  const pairs=assets.map(baseAsset=>({exchange:"binance",marketType:"spot",symbol:baseAsset+"USDT",baseAsset,quoteAsset:"USDT"}));
  const ticker=symbol=>({exchange:"binance",symbol,lastPrice:100,priceChangePercent24h:1,quoteVolume24h:1000,bid:99,ask:101,bidSize:null,askSize:null,high24h:105,low24h:95,exchangeTime:Date.now(),receivedAt:Date.now()});
  let tickerRequests=0,overviewRequests=0,connections=0,closed=0,serverSocket,forceDisconnect=false;
  await context.route("**/api/market/**",async route=>{
    const url=new URL(route.request().url());let data=[];
    if(url.pathname.endsWith("/pairs"))data=pairs;
    if(url.pathname.endsWith("/overview")){overviewRequests++;data=pairs.map(p=>ticker(p.symbol));}
    if(url.pathname.endsWith("/tickers")){tickerRequests++;const symbols=url.searchParams.get("symbols").split(",");assert.equal(symbols.length,1);data=symbols.map(ticker);}
    if(url.pathname.endsWith("/candles"))data=Array.from({length:500},(_,i)=>({time:1700000000+i*3600,open:100+i,high:102+i,low:99+i,close:101+i,volume:1}));
    await route.fulfill({json:{data}});
  });
  await context.routeWebSocket("**/ws/**",socket=>socket.close());
  await context.routeWebSocket("**/stream",socket=>{
    connections++;serverSocket=socket;
    if(forceDisconnect){socket.close();return;}
    let price=80000,timer;
    socket.onMessage(message=>{
      const request=JSON.parse(message);if(request.method!=="SUBSCRIBE")return;
      assert.equal(request.params.length,1,"Only selected pair is subscribed");
      const stream=request.params[0],symbol=stream.split("@")[0].toUpperCase();
      const push=()=>socket.send(JSON.stringify({stream,data:{e:"trade",s:symbol,p:String(++price),T:Date.now()}}));
      push();timer=setInterval(push,100);
    });
    socket.onClose(()=>{closed++;clearInterval(timer);});
  });
  await page.goto(baseURL);await page.waitForFunction(()=>document.querySelectorAll("button.pair-row").length===600);
  await page.locator(".price-line > strong").filter({hasText:/80,/}).waitFor();
  const initial=await page.locator(".price-line > strong").textContent();await page.waitForTimeout(400);
  assert.notEqual(await page.locator(".price-line > strong").textContent(),initial);
  await page.getByRole("button",{name:"15m",exact:true}).click();
  assert.equal(connections,1,"Timeframe does not reconnect trades");
  await page.locator("button.pair-row").filter({hasText:"ETH/USDT"}).click();
  await page.waitForFunction(()=>document.querySelector(".asset-name h1")?.textContent==="ETH/USDT");
  await page.waitForTimeout(400);assert.equal(connections,2);assert.equal(closed,1);
  await page.getByRole("textbox").first().fill("COIN500");
  await page.locator("button.pair-row").filter({hasText:"COIN500/USDT"}).click();
  await page.waitForTimeout(400);assert.equal(connections,3);assert.equal(closed,2);
  assert.equal(await page.locator(".asset-name h1").textContent(),"COIN500/USDT");
  const before=tickerRequests;await page.waitForTimeout(6100);assert.equal(tickerRequests,before);assert.equal(overviewRequests,1);
  forceDisconnect=true;serverSocket.close();await page.waitForTimeout(6100);assert.ok(tickerRequests>before);
  assert.deepEqual(errors,[]);
  console.log("PASS 600 searchable pairs; exactly one selected trade topic; old sockets close; timeframe keeps trade stream; live prices update; minute overview; REST fallback on outage");
}finally{await browser.close();}
