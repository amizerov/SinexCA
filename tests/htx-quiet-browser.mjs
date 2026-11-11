import {chromium} from "playwright-core";
import {gzipSync} from "node:zlib";
import assert from "node:assert/strict";
const base=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];let subscriptions=0,pongs=0;
  page.on("pageerror",e=>errors.push(e.message));
  await context.routeWebSocket(/wss:\/\//,socket=>{
    if(!socket.url().includes("huobi.pro")){socket.close();return;}let timer;
    const send=x=>socket.send(gzipSync(Buffer.from(JSON.stringify(x))));
    socket.onMessage(raw=>{const message=JSON.parse(String(raw));if(message.pong){pongs++;return;}if(!message.sub?.endsWith(".trade.detail"))return;subscriptions++;send({status:"ok",subbed:"market.ethbtc.trade.detail"});send({ch:"market.ethbtc.trade.detail",tick:{data:[{price:.09999,amount:.01,ts:Date.now()-7200000,direction:"buy",id:123}]}});timer=setInterval(()=>send({ping:Date.now()}),250);});socket.onClose(()=>clearInterval(timer));
  });
  await context.route("**/api/paper/chart-trades?*",async r=>{const session=await(await context.request.get(`${base}/api/auth/session`)).json();return r.fulfill({json:{ownerId:session.data.ownerId,fills:[],truncated:false}});});
  await context.route("**/api/market/**",r=>{const u=new URL(r.request().url()),exchange=u.searchParams.get("exchange")||"binance",p=exchange==="htx"?{exchange,marketType:"spot",symbol:"ethbtc",baseAsset:"ETH",quoteAsset:"BTC"}:{exchange,marketType:"spot",symbol:"BTCUSDT",baseAsset:"BTC",quoteAsset:"USDT"},time=Math.floor(Date.now()/3600000)*3600;
    const data=u.pathname.endsWith("/pairs")?[p]:u.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:time-(99-i)*3600,open:.028,high:.03,low:.027,close:.028671,volume:2})):[{exchange,symbol:p.symbol,lastPrice:.028671,high24h:.03,low24h:.027,priceChangePercent24h:-3,quoteVolume24h:null,baseVolume24h:1,receivedAt:Date.now()}];return r.fulfill({json:{data}});});
  const sessionLoaded=page.waitForResponse(r=>r.url().endsWith("/api/auth/session")&&r.status()===200);await page.goto(base);await sessionLoaded;await page.locator(".chart-caption").filter({hasText:"100"}).waitFor();await page.locator(".exchange-tabs button").filter({hasText:/^HTX$/}).click();await page.locator(".stream-pill").filter({hasText:"WS + REST"}).waitFor({timeout:10000}).catch(async e=>{console.log(JSON.stringify({subscriptions,pongs,pill:await page.locator(".stream-pill").innerText(),asset:await page.locator(".asset-name").innerText(),errors}));throw e;});
  assert.ok((await page.locator(".stream-pill").getAttribute("title")).includes("новых сделок нет"));await page.getByText("Новых сделок пока нет",{exact:true}).waitFor();await page.waitForTimeout(750);
  assert.equal(subscriptions,1);assert.ok(pongs>0);assert.ok((await page.locator(".price-line > strong").innerText()).includes("0.028671"));assert.equal(await page.locator(".trade-tape-row").count(),1);assert.deepEqual(errors,[]);console.log("PASS: compressed HTX acknowledgement/heartbeat, old tape stays old, price uses REST, connected-quiet UI and single selected subscription");await context.close();
}finally{await browser.close();}
