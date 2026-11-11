import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const baseURL=process.env.BASE_URL||"http://localhost:3002",browser=await chromium.launch({channel:"chrome",headless:true});
const password="Workspace-test-password-123456";
async function mockMarkets(context){
  await context.routeWebSocket(/wss:\/\//,socket=>socket.close());
  await context.route("**/api/market/**",route=>{
    const url=new URL(route.request().url()),exchange=url.searchParams.get("exchange")||"binance",quote=exchange==="coinbase"?"USD":"USDT",symbol=url.searchParams.get("symbol");
    return route.fulfill({json:{data:url.pathname.endsWith("/pairs")?["BTC","ETH","SOL"].map(asset=>({exchange,marketType:"spot",symbol:exchange==="coinbase"?`${asset}-USD`:`${asset}USDT`,baseAsset:asset,quoteAsset:quote})):url.pathname.endsWith("/orderbook")?{exchange,symbol,bids:[{price:100,quantity:2}],asks:[{price:101,quantity:3}],receivedAt:Date.now(),exchangeTime:null}:[]}});
  });
}
async function logout(page){await page.locator(".account-button").click();await page.getByRole("menuitem",{name:"Выйти",exact:true}).click();await page.getByRole("button",{name:"Войти в Sinex",exact:true}).waitFor();}
async function login(page,email){
  await page.getByRole("button",{name:"Войти в Sinex",exact:true}).click();const form=page.getByRole("dialog");await form.getByLabel("Email",{exact:true}).fill(email);await form.getByLabel("Пароль",{exact:true}).fill(password);await form.getByRole("button",{name:"Войти",exact:true}).click();await page.getByRole("button",{name:`Аккаунт ${email}`,exact:true}).waitFor();
}
try{
  const a=await browser.newContext({viewport:{width:1440,height:1000}}),clean=await browser.newContext({viewport:{width:1440,height:1000}});await mockMarkets(a);await mockMarkets(clean);
  const page=await a.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  const email=`workspace-a-${crypto.randomUUID()}@example.com`,emailB=`workspace-b-${crypto.randomUUID()}@example.com`;
  await a.request.get(`${baseURL}/api/auth/session`);const registered=await a.request.post(`${baseURL}/api/auth/register`,{data:{email,password}});assert.equal(registered.status(),200);const owner=(await registered.json()).data.ownerId;
  await page.goto(baseURL);await page.getByRole("button",{name:`Аккаунт ${email}`,exact:true}).waitFor();
  await page.getByRole("button",{name:"Coinbase",exact:true}).click();await page.locator(".pair-row").filter({hasText:"ETH/USD"}).click();await page.getByRole("button",{name:"5m",exact:true}).click();
  await page.getByRole("button",{name:"Добавить ETH/USD в избранное",exact:true}).click();
  await page.getByRole("button",{name:"Показать стакан",exact:true}).click();let book=page.getByRole("dialog",{name:/^Стакан /});await book.locator(".book-bids .book-row").waitFor();
  await book.getByRole("button",{name:"Открепить стакан",exact:true}).click();
  const head=await book.locator(".orderbook-window-header").boundingBox();await page.mouse.move(head.x+30,head.y+16);await page.mouse.down();await page.mouse.move(430,190,{steps:8});await page.mouse.up();
  await book.getByRole("button",{name:"Изменить размер стакана",exact:true}).focus();await page.keyboard.press("ArrowRight");await page.keyboard.press("ArrowDown");const geometry=await book.boundingBox();
  // Logout immediately after the edits must flush the debounce before invalidating the session.
  await logout(page);assert.equal(await book.count(),0);assert.equal(await page.getByRole("button",{name:"Binance",exact:true}).getAttribute("aria-pressed"),"true");
  await login(page,email);await book.locator(".book-bids .book-row").waitFor();assert.ok((await book.textContent()).includes("Coinbase · ETH/USD"));assert.equal(await page.getByRole("button",{name:"5m",exact:true}).getAttribute("aria-pressed"),"true");assert.deepEqual(await book.boundingBox(),geometry);
  const remoteSession=await clean.request.post(`${baseURL}/api/auth/login`,{data:{email,password}});assert.equal(remoteSession.status(),200);const other=await clean.newPage();other.on("pageerror",e=>errors.push(e.message));await other.goto(baseURL);
  const remoteBook=other.getByRole("dialog",{name:/^Стакан /});await remoteBook.locator(".book-bids .book-row").waitFor();assert.ok((await remoteBook.textContent()).includes("Coinbase · ETH/USD"));assert.deepEqual(await remoteBook.boundingBox(),geometry);
  assert.equal(await other.getByRole("button",{name:"Убрать ETH/USD из избранного",exact:true}).count(),1,"Favorites restore from the account DB in a clean browser");
  await logout(page);
  assert.equal((await a.request.post(`${baseURL}/api/auth/register`,{data:{email:emailB,password}})).status(),200);await page.reload();await page.getByRole("button",{name:`Аккаунт ${emailB}`,exact:true}).waitFor();
  assert.equal(await book.count(),0);assert.equal(await page.getByRole("button",{name:"Binance",exact:true}).getAttribute("aria-pressed"),"true");
  const otherSettings=(await(await a.request.get(`${baseURL}/api/workspace`)).json()).data.settings;assert.ok(!otherSettings||otherSettings.marketPanel.favorites.length===0,"Other accounts do not inherit favorites");
  assert.equal((await a.request.patch(`${baseURL}/api/workspace`,{headers:{"X-Workspace-Id":owner},data:{selected:"SOL"}})).status(),409,"A stale owner cannot write another account's settings");
  await page.locator(".pair-row").filter({hasText:"SOL/USDT"}).click();await logout(page);await login(page,email);await book.locator(".book-bids .book-row").waitFor();assert.ok((await book.textContent()).includes("ETH/USD"));assert.deepEqual(await book.boundingBox(),geometry);
  await book.getByRole("button",{name:"Закрыть стакан",exact:true}).click();await logout(page);await login(page,email);
  await page.waitForFunction(()=>document.querySelector('[aria-label="Заявки ETH/USD"]')===null);assert.equal(await book.count(),0);
  const saved=(await(await a.request.get(`${baseURL}/api/workspace`)).json()).data.settings;assert.equal(saved.orderBookOpen,false);assert.equal(saved.selected,"ETH");assert.deepEqual(saved.orderBookWindow,{x:geometry.x,y:geometry.y,width:geometry.width,height:geometry.height});
  const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(`${baseURL}/api/workspace`)).status(),401);
  assert.deepEqual(errors,[]);console.log("PASS account workspace: immediate logout flush, login restore, clean-browser DB restore, user isolation, closed-state persistence and owner guards");
}finally{await browser.close();}
