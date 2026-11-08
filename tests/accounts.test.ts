import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync,readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AccountStore,OWNER_EMAIL,AccountError } from "../lib/server/account-store";
import { PrivateDrawingStore } from "../lib/server/private-drawing-store";
import { DrawingStore,DrawingConflict } from "../lib/server/drawing-store";
import { hashPassword,verifyPassword,tokenHash } from "../lib/auth/password";
import { verifyGoogleIdentity,completeGoogleProfile } from "../lib/auth/google";
import { generateKeyPair,exportJWK,createLocalJWKSet,SignJWT } from "jose";
const scope={exchange:"binance" as const,marketType:"spot" as const,symbol:"BTCUSDT"};
const level=()=>({id:randomUUID(),price:70000,color:"#63c8ff"});
test("password hashes use independent salts and reject wrong or missing credentials",async()=>{
  const a=await hashPassword("correct-password"),b=await hashPassword("correct-password");assert.notEqual(a,b);
  assert.equal(await verifyPassword("correct-password",a),true);assert.equal(await verifyPassword("wrong",a),false);assert.equal(await verifyPassword("anything",null),false);
});
test("accounts isolate drawings, transfer guests once, rotate and expire sessions, preserve conflicts",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-auth-")),store=new AccountStore(join(directory,"test.sqlite"),false),drawings=new PrivateDrawingStore(store.db);
  try {
    const a=store.createGuest(),b=store.createGuest(),one=level();
    drawings.save(a.session.ownerId,{scope,revision:0,mutationId:randomUUID(),levels:[one]});
    assert.deepEqual(drawings.read(b.session.ownerId,scope).levels,[]);
    assert.throws(()=>drawings.save(a.session.ownerId,{scope,revision:0,mutationId:randomUUID(),levels:[]}),DrawingConflict);
    const account=store.register("a@example.com","test-hash",a.session);
    assert.equal(store.session(a.token),null);assert.deepEqual(drawings.read(account.session.ownerId,scope).levels,[one]);
    assert.deepEqual(drawings.read(a.session.ownerId,scope).levels,[]);
    const two=level();drawings.save(b.session.ownerId,{scope,revision:0,mutationId:randomUUID(),levels:[two]});
    const logged=store.login(account.session.user!.id,b.session);
    assert.deepEqual(new Set(drawings.read(logged.session.ownerId,scope).levels.map(l=>l.id)),new Set([one.id,two.id]));
    assert.equal(store.session(b.token),null);store.revoke(logged.token);assert.equal(store.session(logged.token),null);
    store.db.prepare("UPDATE account_sessions SET expires_at=0 WHERE token_hash=?").run(tokenHash(account.token));assert.equal(store.session(account.token),null);
    assert.throws(()=>store.google("evil","a@example.com",store.createGuest().session),(error:unknown)=>error instanceof AccountError&&error.code==="LINK_REQUIRED");
    for(let i=0;i<10;i++) store.attempt("limits@example.com");assert.throws(()=>store.attempt("limits@example.com"),/15 минут/);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test("legacy levels belong only to the reserved owner and migration runs once",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-migration-")),path=join(directory,"test.sqlite"),legacy=new DrawingStore(path),one=level();
  legacy.save({scope,revision:0,mutationId:randomUUID(),levels:[one]});legacy.close();
  let store=new AccountStore(path);
  try {
    const guest=store.createGuest();assert.deepEqual(new PrivateDrawingStore(store.db).read(guest.session.ownerId,scope).levels,[]);
    assert.throws(()=>store.register(OWNER_EMAIL,"hash",guest.session),/одноразовый код/);
    const code=readFileSync(join(directory,"owner-setup-code.txt"),"utf8").trim();
    const owner=store.register(OWNER_EMAIL,"hash",guest.session,code);assert.deepEqual(new PrivateDrawingStore(store.db).read(owner.session.ownerId,scope).levels,[one]);
    store.close();store=new AccountStore(path);assert.equal(store.session(owner.token)?.user?.email,OWNER_EMAIL);
    assert.equal(Number(store.db.prepare("SELECT count(*) AS n FROM private_levels").get()!.n),1);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test("Google linking requires the authenticated account, OAuth state is owner-bound and single-use",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-google-")),store=new AccountStore(join(directory,"test.sqlite"),false);
  try {
    const guest=store.createGuest(),first=store.google("google-1","one@example.com",guest.session);
    assert.equal(first.session.user!.googleLinked,true);
    assert.throws(()=>store.google("google-1","one@example.com",store.register("two@example.com","hash",store.createGuest().session).session));
    const local=store.register("local@example.com","hash",store.createGuest().session);
    assert.throws(()=>store.google("google-local","local@example.com",store.createGuest().session),(error:unknown)=>error instanceof AccountError&&error.code==="LINK_REQUIRED");
    assert.equal(store.google("google-local","local@example.com",local.session).session.user!.googleLinked,true);
    store.createOAuth(first.session.ownerId,"state","nonce","verifier");assert.equal(store.consumeOAuth("state",local.session.ownerId),undefined);
    assert.equal(store.consumeOAuth("state",first.session.ownerId)?.nonce,"nonce");assert.equal(store.consumeOAuth("state",first.session.ownerId),undefined);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test("Google ID token rejects invalid signature, audience, nonce, expiry and unverified email",async()=>{
  const {privateKey,publicKey}=await generateKeyPair("RS256"),jwk=await exportJWK(publicKey),getKey=createLocalJWKSet({keys:[{...jwk,kid:"test",alg:"RS256"}]});
  const sign=(payload:Record<string,unknown>={})=>new SignJWT({email:"user@example.com",email_verified:true,nonce:"nonce",...payload}).setProtectedHeader({alg:"RS256",kid:"test"}).setSubject("google-user").setIssuer("https://accounts.google.com").setAudience("client").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const valid=await sign();assert.deepEqual(await verifyGoogleIdentity(valid,"client","nonce",getKey),{sub:"google-user",email:"user@example.com",displayName:null,avatarUrl:null});
  const profile=await verifyGoogleIdentity(await sign({name:"  Test User  ",picture:"https://lh3.googleusercontent.com/a/test"}),"client","nonce",getKey);
  assert.equal(profile.displayName,"Test User");assert.equal(profile.avatarUrl,"https://lh3.googleusercontent.com/a/test");
  for(const picture of ["javascript:alert(1)","http://lh3.googleusercontent.com/a/test","https://lh3.googleusercontent.com.evil.test/a","https://other.test/picture"]) {
    assert.equal((await verifyGoogleIdentity(await sign({picture}),"client","nonce",getKey)).avatarUrl,null);
  }
  await assert.rejects(verifyGoogleIdentity(valid,"other-client","nonce",getKey));await assert.rejects(verifyGoogleIdentity(valid,"client","wrong",getKey));
  await assert.rejects(verifyGoogleIdentity(await sign({email_verified:false}),"client","nonce",getKey));
  const expired=await new SignJWT({email:"user@example.com",email_verified:true,nonce:"nonce"}).setProtectedHeader({alg:"RS256",kid:"test"}).setSubject("user").setIssuer("https://accounts.google.com").setAudience("client").setIssuedAt(1).setExpirationTime(2).sign(privateKey);
  await assert.rejects(verifyGoogleIdentity(expired,"client","nonce",getKey));
  const wrongKey=await generateKeyPair("RS256");const forged=await new SignJWT({email:"user@example.com",email_verified:true,nonce:"nonce"}).setProtectedHeader({alg:"RS256",kid:"test"}).setSubject("user").setIssuer("https://accounts.google.com").setAudience("client").setIssuedAt().setExpirationTime("5m").sign(wrongKey.privateKey);
  await assert.rejects(verifyGoogleIdentity(forged,"client","nonce",getKey));
});
test("Google profile persists, refreshes on sign-in, and upgrading old accounts preserves sessions and levels",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-profile-")),path=join(directory,"test.sqlite");let store=new AccountStore(path,false);
  try {
    const guest=store.createGuest(),one=level();new PrivateDrawingStore(store.db).save(guest.session.ownerId,{scope,revision:0,mutationId:randomUUID(),levels:[one]});
    const account=store.google("profile-user","profile@example.com",guest.session,{displayName:"Test User",avatarUrl:"https://lh3.googleusercontent.com/a/test"});
    assert.equal(account.session.user!.displayName,"Test User");assert.equal(store.session(account.token)!.user!.avatarUrl,"https://lh3.googleusercontent.com/a/test");
    store.close();store=new AccountStore(path,false);assert.equal(store.session(account.token)!.user!.displayName,"Test User");
    const refreshed=store.google("profile-user","profile@example.com",store.session(account.token)!,{displayName:"New Name",avatarUrl:null});assert.equal(refreshed.session.user!.displayName,"New Name");assert.equal(refreshed.session.user!.avatarUrl,"https://lh3.googleusercontent.com/a/test");
    store.db.exec("ALTER TABLE account_users DROP COLUMN display_name; ALTER TABLE account_users DROP COLUMN avatar_url;");
    store.close();store=new AccountStore(path,false);
    assert.equal(store.session(account.token)!.user!.displayName,null);assert.equal(store.session(account.token)!.user!.email,"profile@example.com");
    assert.deepEqual(new PrivateDrawingStore(store.db).read(account.session.ownerId,scope).levels,[one]);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test("UserInfo fills missing name/photo, binds subject, and handles missing access or profile outages",async()=>{
  const identity={sub:"profile-sub",email:"profile@example.com",displayName:null,avatarUrl:null};let calls=0;
  const request:typeof fetch=async(url,options)=>{calls++;assert.equal(url,"https://openidconnect.googleapis.com/v1/userinfo");assert.equal(new Headers(options?.headers).get("Authorization"),"Bearer test-access-token");assert.equal(options?.redirect,"error");return Response.json({sub:"profile-sub",name:"Test User",picture:"https://lh3.googleusercontent.com/a/profile"});};
  const complete=await completeGoogleProfile(identity,"test-access-token",request);assert.equal(complete.displayName,"Test User");assert.equal(complete.avatarUrl,"https://lh3.googleusercontent.com/a/profile");
  assert.deepEqual(await completeGoogleProfile(complete,"test-access-token",request),complete);assert.equal(calls,1);
  assert.deepEqual(await completeGoogleProfile(identity,undefined,request),identity);assert.equal(calls,1);
  await assert.rejects(completeGoogleProfile(identity,"test",async()=>Response.json({sub:"different-user",name:"Wrong User"})),/identity mismatch/);
  assert.deepEqual(await completeGoogleProfile(identity,"test",async()=>new Response("unavailable",{status:503})),identity);
  assert.deepEqual(await completeGoogleProfile(identity,"test",async()=>{throw new Error("Network error");}),identity);
});
