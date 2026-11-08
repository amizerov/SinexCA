import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  const context=await browser.newContext(),page=await context.newPage();
  const session=await context.request.get(`${baseURL}/api/auth/session`);assert.equal(session.status(),200);assert.equal((await session.json()).data.googleAvailable,true);
  const response=await context.request.get(`${baseURL}/api/auth/google`,{maxRedirects:0});assert.equal(response.status(),307);
  const url=new URL(response.headers().location);
  assert.equal(url.origin,"https://accounts.google.com");assert.equal(url.pathname,"/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("redirect_uri"),`${baseURL}/api/auth/google/callback`);
  assert.ok(url.searchParams.get("scope").split(" ").includes("profile"));
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");assert.ok(url.searchParams.get("code_challenge")?.length>=43);
  assert.ok(url.searchParams.get("nonce")?.length>=32);assert.ok(url.searchParams.get("state")?.length>=32);
  const cookies=await context.cookies(`${baseURL}/api/auth/google`);assert.equal(cookies.find(cookie=>cookie.name==="sinex_oauth")?.httpOnly,true);
  await page.goto(baseURL);await page.getByRole("button",{name:"Войти в Sinex",exact:true}).click();await page.getByRole("button",{name:"Продолжить с Google"}).waitFor();assert.equal(await page.getByRole("button",{name:"Продолжить с Google"}).isEnabled(),true);
  await page.getByRole("button",{name:"Продолжить с Google"}).click();
  await page.waitForURL(url=>url.hostname==="accounts.google.com",{timeout:20000});
  await page.waitForLoadState("domcontentloaded");
  const text=await page.locator("body").innerText();
  assert.ok(!/redirect_uri_mismatch|invalid_client|deleted_client|Error 400|Ошибка 400/.test(text),"Google rejected the OAuth client or callback");
  assert.ok(await page.locator('input[type="email"],input[name="identifier"]').count()>0,"Google must show its sign-in page");
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/google-sign-in.png"});
  console.log("PASS Google enabled, correct callback on port 3002, PKCE/state/nonce, protected OAuth cookie, Google accepts client and shows email sign-in. No user credentials entered.");
}finally{await browser.close();}
