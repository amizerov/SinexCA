import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL=process.env.BASE_URL||"http://localhost:3002";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  const photo="https://lh3.googleusercontent.com/a/sinex-test-avatar";
  await context.route("**/api/auth/session",async route=>{
    const response=await route.fetch(),data=await response.json();
    data.data.user={id:"profile-fixture",email:"test@example.com",displayName:"Test User",avatarUrl:photo,googleLinked:true,passwordEnabled:false};
    await route.fulfill({response,json:data});
  });
  let failPhoto=false;
  await context.route(photo,route=>failPhoto?route.abort():route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#b4ed8b"/></svg>'}));
  await page.goto(baseURL);await page.locator(".account-label").filter({hasText:"Test User"}).waitFor();
  await page.waitForFunction(()=>document.querySelector(".account-avatar img")?.naturalWidth>0);
  await page.getByRole("button",{name:"Аккаунт test@example.com",exact:true}).click();await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator(".account-name").textContent(),"Test User");assert.equal(await page.locator(".account-profile .account-email").textContent(),"test@example.com");
  assert.equal(await page.getByRole("button",{name:"Обновить профиль Google",exact:true}).isEnabled(),true);
  await mkdir(".qa",{recursive:true});await page.screenshot({path:".qa/profile-desktop.png"});
  await page.getByRole("button",{name:"Закрыть",exact:true}).click();await page.setViewportSize({width:320,height:568});
  assert.equal(await page.locator(".account-button .account-avatar").isVisible(),true);assert.equal(await page.locator(".account-label").isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  failPhoto=true;await page.reload();await page.waitForFunction(()=>document.querySelector(".account-button .account-avatar")?.textContent==="TU");
  assert.equal(await page.locator(".account-button .account-avatar img").count(),0);
  await page.getByRole("button",{name:"Аккаунт test@example.com",exact:true}).click();await page.screenshot({path:".qa/profile-mobile.png"});
  assert.deepEqual(errors,[]);console.log("PASS profile fixture: name and avatar in header/dialog, Google refresh action, mobile avatar, failed-image initials fallback; no real account data modified");
}finally{await browser.close();}
