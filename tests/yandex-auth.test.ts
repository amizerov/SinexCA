import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AccountStore,AccountError,OWNER_EMAIL} from "../lib/server/account-store";
import {readYandexIdentity,exchangeYandexCode,yandexConfig} from "../lib/auth/yandex";

const profile={displayName:"Andrey",avatarUrl:"https://avatars.yandex.net/get-yapic/123/abc/islands-200"};
test("Yandex registration and returning login preserve owner, custom profile and provider isolation",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-yandex-")),store=new AccountStore(join(directory,"test.sqlite"),false);
  try{
    const guest=store.createGuest(),created=store.yandex("ya-1","one@example.com",guest.session,profile);
    assert.equal(created.session.user?.displayName,"Andrey");assert.equal(created.session.user?.avatarUrl,profile.avatarUrl);assert.equal(store.session(guest.token),null);
    store.updateDisplayName(created.session.user!.id,"Custom name");store.removeAvatar(created.session.user!.id);
    const again=store.yandex("ya-1","one@example.com",store.createGuest().session,profile);
    assert.equal(again.session.ownerId,created.session.ownerId);assert.equal(again.session.user?.displayName,"Custom name");assert.equal(again.session.user?.avatarUrl,null);
    assert.throws(()=>store.register("one@example.com","hash",store.createGuest().session),AccountError);
    assert.throws(()=>store.google("google-1","one@example.com",store.createGuest().session),error=>error instanceof AccountError&&error.code==="LINK_REQUIRED");
    assert.throws(()=>store.yandex("ya-2","one@example.com",store.createGuest().session,profile),AccountError);
    const password=store.register("password@example.com","hash",store.createGuest().session);
    const linked=store.yandex("ya-pass","password@example.com",store.createGuest().session,profile);
    assert.equal(linked.session.user?.id,password.session.user?.id);
    assert.equal(linked.session.ownerId,password.session.ownerId);
    assert.equal(linked.session.user?.passwordEnabled,true);
    assert.equal(store.userByEmail("password@example.com")?.password_hash,"hash");
    const returning=store.yandex("ya-pass","password@example.com",store.createGuest().session,profile);
    assert.equal(returning.session.ownerId,password.session.ownerId);
    const otherProvider=store.google("google-only","another@example.com",store.createGuest().session);
    assert.throws(()=>store.yandex("ya-other","another@example.com",store.createGuest().session,profile),error=>error instanceof AccountError&&error.code==="LINK_REQUIRED");
    assert.notEqual(otherProvider.session.ownerId,linked.session.ownerId);
    assert.throws(()=>store.yandex("ya-1","one@example.com",linked.session,profile),AccountError);
    store.db.prepare("INSERT INTO account_users(id,email,owner_code_hash,created_at) VALUES(?,?,?,?)").run("reserved",OWNER_EMAIL,"code-hash",Date.now());
    assert.throws(()=>store.yandex("ya-owner",OWNER_EMAIL,store.createGuest().session,profile),error=>error instanceof AccountError&&error.code==="LINK_REQUIRED");
    store.createOAuth(again.session.ownerId,"state","yandex:nonce","verifier");
    assert.equal(store.consumeOAuth("state",password.session.ownerId),undefined);
    assert.equal(store.consumeOAuth("state",again.session.ownerId)?.verifier,"verifier");
    assert.equal(store.consumeOAuth("state",again.session.ownerId),undefined);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test("Yandex identity requires this client and email; avatar is limited to Yandex",()=>{
  const raw={id:"123",client_id:"client",default_email:"USER@example.com",real_name:" Andrey ",default_avatar_id:"123/abc",is_avatar_empty:false};
  assert.deepEqual(readYandexIdentity(raw,"client"),{sub:"123",email:"user@example.com",...profile});
  assert.throws(()=>readYandexIdentity({...raw,client_id:"another"},"client"));
  assert.throws(()=>readYandexIdentity({...raw,default_email:undefined},"client"));
  assert.equal(readYandexIdentity({...raw,default_avatar_id:"https://evil.example/photo"},"client").avatarUrl,null);
  assert.equal(readYandexIdentity({...raw,is_avatar_empty:true},"client").avatarUrl,null);
});
test("Yandex exchanges code with PKCE and reads profile using an authorization header",async()=>{
  const config={clientId:"client",clientSecret:"secret",origin:"http://localhost:3002",redirectUri:"http://localhost:3002/api/auth/yandex/callback"};
  const calls:{url:string;init:RequestInit|undefined}[]=[];
  const mock=(async(url,init)=>{
    calls.push({url:String(url),init});
    return Response.json(calls.length===1?{access_token:"access-token",token_type:"bearer"}:{id:"123",client_id:"client",default_email:"user@example.com"});
  }) as typeof fetch;
  assert.equal((await exchangeYandexCode(config,"code","verifier",mock)).sub,"123");
  const body=calls[0].init?.body as URLSearchParams;
  assert.equal(body.get("code_verifier"),"verifier");assert.equal(body.get("client_secret"),"secret");
  assert.equal(new Headers(calls[1].init?.headers).get("Authorization"),"OAuth access-token");assert.ok(!calls[1].url.includes("access-token"));
  await assert.rejects(()=>exchangeYandexCode(config,"code","verifier",(async()=>new Response(null,{status:401})) as typeof fetch));
});
test("Yandex config rejects unsafe public origins",()=>{
  const previous={id:process.env.YANDEX_CLIENT_ID,secret:process.env.YANDEX_CLIENT_SECRET,url:process.env.SINEX_APP_URL};
  try{
    process.env.YANDEX_CLIENT_ID="client";process.env.YANDEX_CLIENT_SECRET="secret";delete process.env.SINEX_APP_URL;
    assert.equal(yandexConfig(new Request("http://localhost:3002/api/auth/yandex")).redirectUri,"http://localhost:3002/api/auth/yandex/callback");
    assert.throws(()=>yandexConfig(new Request("https://untrusted.example/api/auth/yandex")));
    process.env.SINEX_APP_URL="http://public.example";assert.throws(()=>yandexConfig(new Request("http://localhost:3002")));
  }finally{
    for(const [key,value] of Object.entries({YANDEX_CLIENT_ID:previous.id,YANDEX_CLIENT_SECRET:previous.secret,SINEX_APP_URL:previous.url}))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
