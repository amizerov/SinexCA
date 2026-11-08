import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];let sockets=0;
  page.on("pageerror",error=>errors.push(error.message));
  await context.routeWebSocket(/wss:\/\//,socket=>{
    sockets++;let timer;
    if(socket.url().includes("@kline_")){
      const symbol=socket.url().split("/ws/")[1].split("@")[0].toUpperCase();
      timer=setInterval(()=>socket.send(JSON.stringify({e:"kline",s:symbol,k:{t:Math.floor(Date.now()/3600000)*3600000,i:"1h",o:"100",h:"102",l:"99",c:"101",v:"2"}})),250);
    }else socket.onMessage(message=>{const event=JSON.parse(String(message));if(event.method==="SUBSCRIBE"){const symbol=event.params[0].split("@")[0].toUpperCase();timer=setInterval(()=>socket.send(JSON.stringify({data:{e:"trade",s:symbol,p:"101",T:Date.now()}})),250);}});
    socket.onClose(()=>clearInterval(timer));
  });
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange="binance",quote=url.searchParams.get("quote"),pairs=[...['BTC','ETH','SOL'].map(baseAsset=>({exchange,marketType:"spot",symbol:baseAsset+'USDT',baseAsset,quoteAsset:'USDT'})),...['ETH','SOL'].map(baseAsset=>({exchange,marketType:"spot",symbol:baseAsset+'BTC',baseAsset,quoteAsset:'BTC'}))];
    const data=url.pathname.endsWith("/pairs")?pairs:url.pathname.endsWith("/candles")?Array.from({length:100},(_,i)=>({time:Math.floor(Date.now()/3600000)*3600-(99-i)*3600,open:100,high:102,low:99,close:101,volume:2})):url.pathname.endsWith("/orderbook")?{exchange,symbol:url.searchParams.get("symbol"),bids:[{price:100,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:pairs.filter(p=>!quote||quote==="all"||p.quoteAsset===quote).map(p=>({exchange,symbol:p.symbol,lastPrice:101,high24h:102,low24h:99,priceChangePercent24h:1,quoteVolume24h:1000,receivedAt:Date.now()}));
    return route.fulfill({json:{data}});
  });
  await page.goto(baseURL);await page.locator('[aria-label="Показать стакан"]:enabled').waitFor();
  const panel=page.locator(".markets-panel");await page.locator('.pair-list[aria-busy="false"]').waitFor();
  const initial=await panel.boundingBox(),chart=await page.locator(".chart-canvas").boundingBox();assert.ok(initial.x>=chart.x+chart.width);assert.ok((await panel.locator(".pair-row").first().boundingBox()).height<33);
  const originalTitle=await page.locator(".asset-name h1").textContent();await panel.getByRole("button",{name:"Добавить SOL/USDT в избранное",exact:true}).click();assert.equal(await page.locator(".asset-name h1").textContent(),originalTitle,"Favorite does not select the pair");
  await panel.getByRole("button",{name:"Только избранные",exact:true}).click();assert.equal(await panel.locator(".pair-row").count(),1);await panel.locator(".pair-select").click();await page.locator(".asset-name h1").filter({hasText:"SOL/USDT"}).waitFor();
  await panel.getByRole("button",{name:"Только избранные",exact:true}).click();await panel.getByRole("group",{name:"Валюты пар"}).getByRole("button",{name:"BTC",exact:true}).click();await page.locator(".asset-name h1").filter({hasText:"SOL/BTC"}).waitFor();await page.locator('.pair-list[aria-busy="false"]').waitFor();assert.equal(await panel.getByRole("button",{name:"Добавить SOL/BTC в избранное",exact:true}).count(),1);
  await page.locator(".stream-pill").filter({hasText:"Онлайн"}).waitFor();const beforeMove=sockets;
  const handle=page.getByRole("separator",{name:"Ширина списка пар"}),edge=await handle.boundingBox();await page.mouse.move(edge.x+2,edge.y+80);await page.mouse.down();await page.mouse.move(edge.x-48,edge.y+80,{steps:6});await page.mouse.up();const dockWidth=(await panel.boundingBox()).width;assert.ok(dockWidth>initial.width+40);
  await panel.getByRole("button",{name:"Открепить список пар",exact:true}).click();await page.getByRole("dialog",{name:"Выбор торговой пары",exact:true}).waitFor();
  const header=await panel.locator(".markets-panel-header").boundingBox();await page.mouse.move(header.x+45,header.y+15);await page.mouse.down();await page.mouse.move(380,170,{steps:8});await page.mouse.up();
  await panel.getByRole("button",{name:"Изменить размер списка пар",exact:true}).focus();await page.keyboard.press("ArrowRight");await page.keyboard.press("ArrowDown");const geometry=await panel.boundingBox();assert.ok(geometry.x<500);assert.equal(sockets,beforeMove,"Moving and resizing markets do not restart price/candle subscriptions");
  await page.reload();await page.getByRole("dialog",{name:"Выбор торговой пары",exact:true}).waitFor();assert.deepEqual(await panel.boundingBox(),geometry);await page.locator(".asset-name h1").filter({hasText:"SOL/BTC"}).waitFor();
  await panel.getByRole("button",{name:"Расположение списка пар",exact:true}).click();const menu=page.getByRole("menu",{name:"Расположение списка пар",exact:true});await menu.getByRole("menuitemradio",{name:"Закрепить слева",exact:true}).click();assert.ok((await panel.boundingBox()).x<(await page.locator(".chart-canvas").boundingBox()).x);assert.equal((await panel.boundingBox()).width,dockWidth);
  await panel.getByRole("button",{name:"Расположение списка пар",exact:true}).click();await menu.getByRole("menuitemradio",{name:"Закрепить справа",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Показать рынки",exact:true}).count(),0);await panel.getByRole("button",{name:"Скрыть список пар",exact:true}).click();await panel.waitFor({state:"hidden"});await page.getByRole("button",{name:"Показать рынки",exact:true}).click();await panel.waitFor();assert.equal(await page.getByRole("button",{name:"Показать рынки",exact:true}).count(),0);
  await panel.getByRole("combobox",{name:"Валюта котировки",exact:true}).selectOption("USDT");await page.locator('.pair-list[aria-busy="false"]').waitFor();assert.equal(await panel.getByRole("button",{name:"Убрать SOL/USDT из избранного",exact:true}).count(),1);
  await page.goto(`${baseURL}/account`);await page.getByRole("link",{name:"К графику",exact:true}).click();await panel.waitFor();await page.locator('.pair-list[aria-busy="false"]').waitFor();assert.equal((await panel.boundingBox()).width,dockWidth);await panel.getByRole("button",{name:"Убрать SOL/USDT из избранного",exact:true}).waitFor();assert.equal(await panel.getByRole("button",{name:"Убрать SOL/USDT из избранного",exact:true}).count(),1);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/markets-panel-desktop.png"});
  await page.getByRole("button",{name:"Показать стакан",exact:true}).click();await page.getByRole("dialog",{name:/^Стакан /}).waitFor();assert.equal(await page.getByRole("button",{name:"Показать стакан",exact:true}).count(),0);
  for(const width of [1920,1440,1280,1100,1024,768,600,320]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false,`${width}: page overflows`);
    const controls=await page.locator(".timeframe-toolbar").evaluate(node=>{const box=node.getBoundingClientRect();return [...node.children].filter(child=>getComputedStyle(child).display!=="none").every(child=>{const rect=child.getBoundingClientRect();return rect.left>=box.left&&rect.right<=box.right+1;});});assert.ok(controls,`${width}: chart controls must fit with both side panels`);
  }
  await page.getByRole("dialog",{name:/^Стакан /}).getByRole("button",{name:"Закрыть стакан"}).click();
  await page.getByRole("button",{name:"Показать стакан",exact:true}).waitFor();
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);assert.ok((await panel.boundingBox()).y>(await page.locator(".chart-canvas").boundingBox()).y);
  await panel.getByRole("button",{name:"Открепить список пар",exact:true}).click();const mobile=await panel.boundingBox();assert.ok(mobile.x>=0&&mobile.y>=0&&mobile.x+mobile.width<=320&&mobile.y+mobile.height<=568);await page.screenshot({path:".qa/markets-panel-mobile.png"});
  await panel.getByRole("button",{name:"Скрыть список пар",exact:true}).click();await page.reload();await page.getByRole("button",{name:"Показать рынки",exact:true}).waitFor();assert.equal(await panel.count(),0);assert.deepEqual(errors,[]);
  console.log("PASS right/left/floating markets, compact columns, scoped favorites, quote tabs, drag/resize, single streams, reload/navigation, hide/reopen and mobile bounds");
}finally{await browser.close();}
