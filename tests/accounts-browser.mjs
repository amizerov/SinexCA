import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://127.0.0.1:3004";
const browser=await chromium.launch({channel:"chrome",headless:true});
const first=await browser.newContext({viewport:{width:1440,height:900}}),second=await browser.newContext();
const page=await first.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
const scope={exchange:"binance",marketType:"spot",symbol:"BTCUSDT"};
async function session(context){const response=await context.request.get(`${baseURL}/api/auth/session`);assert.equal(response.status(),200);return(await response.json()).data;}
async function read(context){const response=await context.request.get(`${baseURL}/api/drawings?${new URLSearchParams(scope)}`);assert.equal(response.status(),200);return(await response.json()).data;}
async function save(context,ownerId,revision,levels){return context.request.put(`${baseURL}/api/drawings`,{headers:{"X-Workspace-Id":ownerId},data:{scope,revision,mutationId:crypto.randomUUID(),levels}});}
try {
  const a=await session(first),b=await session(second);assert.notEqual(a.ownerId,b.ownerId);
  const cookie=(await first.cookies()).find(cookie=>cookie.name==="sinex_session");assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,"Lax");
  const level={id:crypto.randomUUID(),price:75000,color:"#63c8ff"};assert.equal((await save(first,a.ownerId,0,[level])).status(),200);assert.deepEqual((await read(second)).levels,[]);
  assert.equal((await save(second,a.ownerId,0,[level])).status(),409,"A caller cannot supply another visitor's workspace");
  await page.goto(baseURL);await page.getByRole("button",{name:"Войти в Sinex broker",exact:true}).click();await page.getByRole("dialog").waitFor();
  assert.equal(await page.getByRole("button",{name:"Продолжить с Google"}).isDisabled(),!a.googleAvailable);
  const email=`qa-${crypto.randomUUID()}@example.com`,password=`test-${crypto.randomUUID()}`;
  await page.getByRole("button",{name:"Регистрация",exact:true}).click();await page.getByLabel("Email",{exact:true}).fill(email);
  await page.getByLabel("Пароль",{exact:true}).fill(password);await page.getByLabel("Повторите пароль",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Создать аккаунт",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});
  const registered=await session(first);assert.equal(registered.user.email,email);assert.notEqual(registered.ownerId,a.ownerId);assert.deepEqual((await read(first)).levels,[level]);
  await page.reload();await page.getByRole("button",{name:`Аккаунт ${email}`,exact:true}).waitFor();
  const otherTab=await first.newPage();await otherTab.goto(baseURL);await otherTab.getByRole("button",{name:`Аккаунт ${email}`,exact:true}).waitFor();
  await page.getByRole("button",{name:`Аккаунт ${email}`,exact:true}).click();await page.getByRole("menuitem",{name:"Выйти",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});
  await otherTab.getByRole("button",{name:"Войти в Sinex broker",exact:true}).waitFor();assert.deepEqual((await read(first)).levels,[]);
  const stale=await save(first,registered.ownerId,1,[level]);assert.equal(stale.status(),409,"A stale tab cannot save account drawings into a new guest session");
  const denied=await first.request.post(`${baseURL}/api/auth/login`,{headers:{origin:"https://other.example"},data:{email,password}});assert.equal(denied.status(),403);
  const login=await second.request.post(`${baseURL}/api/auth/login`,{data:{email,password}});assert.equal(login.status(),200);assert.deepEqual((await read(second)).levels,[level]);
  const wrong=await first.request.post(`${baseURL}/api/auth/login`,{data:{email,password:"wrong-password"}});assert.equal(wrong.status(),401);
  // Callback must reject a forged state without logging in or exposing an error detail.
  const forged=await first.request.get(`${baseURL}/api/auth/google/callback?state=forged&code=forged`,{maxRedirects:0});assert.equal(forged.status(),307);assert.match(forged.headers().location,/auth_error=GOOGLE_FAILED/);
  await page.getByRole("button",{name:"Войти в Sinex broker",exact:true}).click();await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/account-desktop.png"});
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);await page.screenshot({path:".qa/account-mobile.png"});
  assert.deepEqual(errors,[]);console.log("PASS guest isolation, registration UI, guest drawing transfer, persistent session, cross-tab logout, remote login, CSRF and stale workspace protection, Google state rejection, mobile dialog");
}finally{await browser.close();}
