import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";

const browser=await chromium.launch({channel:"chrome",headless:true});
const base=process.env.BASE_URL||"http://127.0.0.1:3000";
try{
  const context=await browser.newContext({viewport:{width:1800,height:1000}});
  await context.addInitScript(()=>{
    window.__marketSockets=[];
    const NativeSocket=window.WebSocket;
    window.WebSocket=class extends NativeSocket{constructor(...args){super(...args);window.__marketSockets.push(this);}};
  });
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(base);
  const modes=page.getByRole("group",{name:"Тип рынка",exact:true});
  await modes.getByRole("button",{name:"Фьючерсы",exact:true}).click();
  await page.locator(".asset-identity p").filter({hasText:"Фьючерсы"}).waitFor();
  for(const exchange of ["Binance","Bybit","OKX","Bitget","Gate","Kraken","Coinbase","KuCoin","Bitfinex","HTX","MEXC","WhiteBIT","Crypto.com","BingX"]){
    await page.getByRole("group",{name:"Биржи",exact:true}).getByRole("button",{name:exchange,exact:true}).click();
    await page.locator(".asset-identity p").filter({hasText:`${exchange} · Фьючерсы`}).waitFor();
    await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:30000});
    await page.locator(".book-row").first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.stream-pill')?.textContent.includes('Онлайн'),{},{timeout:25000});
    await page.locator(".book-row").first().waitFor();
    const sockets=await page.evaluate(()=>window.__marketSockets.filter(socket=>socket.readyState<2&&socket.url.startsWith('wss://')).map(socket=>socket.url));
    assert(sockets.length>=2);
    assert(sockets.every(url=>!url.includes('binance.vision')&&!url.includes('/public/spot')),JSON.stringify(sockets));
    assert.equal(await page.getByRole("button",{name:"Создать тестовую заявку",exact:true}).isDisabled(),true);
    console.log(`${exchange}: futures candles, depth and live trades passed`);
  }
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.market-type-switch button:last-child')?.getAttribute('aria-pressed')==='true');
  await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:30000});
  await mkdir(".qa",{recursive:true});
  await page.screenshot({path:".qa/futures-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const bounds=await page.locator(".topbar").evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth}));
  assert(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));
  await page.screenshot({path:".qa/futures-mobile.png",fullPage:true});
  await modes.getByRole("button",{name:"Спот",exact:true}).click();
  await page.locator(".asset-identity p").filter({hasText:"Spot"}).waitFor();
  await page.locator(".chart-caption").filter({hasText:"500 свечей"}).waitFor({timeout:30000});
  assert.deepEqual(errors,[]);
  console.log("Futures persistence, mobile layout and return to spot passed");
}finally{await browser.close();}
