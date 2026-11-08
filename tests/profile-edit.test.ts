import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {deflateSync,inflateSync} from "node:zlib";
import {AccountStore} from "../lib/server/account-store";
import {hashPassword,verifyPassword} from "../lib/auth/password";
import {normalizeAvatarPng,MAX_AVATAR_BYTES} from "../lib/auth/avatar";
import {profileNameSchema,changePasswordSchema} from "../lib/auth/profile";
function pngChunk(type:string,data:Buffer){const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const input=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of input){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,input,checksum]);}
function png(width=1,height=1){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk("IHDR",header),pngChunk("tEXt",Buffer.from("private-location-metadata")),pngChunk("IDAT",deflateSync(Buffer.from([0,255,0,0,255]))),pngChunk("IEND",Buffer.alloc(0))]);}
test("avatar normalizer preserves pixels, strips metadata and rejects malformed or oversized images",()=>{
  const source=png(),normalized=normalizeAvatarPng(source);assert.equal(normalized.includes(Buffer.from("private-location-metadata")),false);
  const offset=normalized.indexOf(Buffer.from("IDAT")),length=normalized.readUInt32BE(offset-4);assert.deepEqual([...inflateSync(normalized.subarray(offset+4,offset+4+length))],[0,255,0,0,255]);
  assert.throws(()=>normalizeAvatarPng(png(100000,100000)));assert.throws(()=>normalizeAvatarPng(Buffer.alloc(MAX_AVATAR_BYTES+1)));assert.throws(()=>normalizeAvatarPng(Buffer.from('<svg onload="alert(1)"></svg>')));
  const corrupted=Buffer.from(source);corrupted[corrupted.length-1]^=1;assert.throws(()=>normalizeAvatarPng(corrupted));
});
test("custom name/avatar survive later Google logins and avatar deletion is persistent",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-profile-")),store=new AccountStore(join(directory,"profile.sqlite"),false);
  try{
    const guest=store.createGuest(),account=store.google("profile-google-sub","profile@example.com",guest.session,{displayName:"Google name",avatarUrl:"https://lh3.googleusercontent.com/first"});
    store.updateDisplayName(account.session.user!.id,"Custom name");const url=store.saveAvatar(account.session.user!.id,normalizeAvatarPng(png()));
    const refreshed=store.google("profile-google-sub","profile@example.com",account.session,{displayName:"New Google name",avatarUrl:"https://lh3.googleusercontent.com/second"});
    assert.equal(refreshed.session.user?.displayName,"Custom name");assert.equal(refreshed.session.user?.avatarUrl,url);assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM account_avatar_images").get()!.n,1);
    store.removeAvatar(account.session.user!.id);const again=store.google("profile-google-sub","profile@example.com",refreshed.session,{displayName:"Third Google name",avatarUrl:"https://lh3.googleusercontent.com/third"});assert.equal(again.session.user?.avatarUrl,null);assert.equal(again.session.user?.displayName,"Custom name");
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test("password change rotates sessions and rejects concurrent or revoked-session writes; Google users can set an initial password",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-password-")),store=new AccountStore(join(directory,"profile.sqlite"),false);
  try{
    const previous=await hashPassword("Old-password-123"),next=await hashPassword("New-password-456"),guest=store.createGuest(),account=store.register("password@example.com",previous,guest.session),other=store.login(account.session.user!.id,store.createGuest().session);
    const changed=store.changePassword(account.session.user!.id,account.token,previous,next);
    assert.equal(store.session(account.token),null);assert.equal(store.session(other.token),null);assert.equal(store.session(changed.token)?.user?.passwordEnabled,true);
    assert.equal(await verifyPassword("New-password-456",String(store.userByEmail("password@example.com")!.password_hash)),true);
    assert.throws(()=>store.changePassword(account.session.user!.id,changed.token,previous,next));
    const google=store.google("password-google-sub","google-password@example.com",store.createGuest().session),initial=store.changePassword(google.session.user!.id,google.token,null,next);
    assert.equal(initial.session.user?.passwordEnabled,true);assert.equal(initial.session.user?.googleLinked,true);
    assert.equal(profileNameSchema.safeParse({displayName:"\u0000name"}).success,false);assert.equal(changePasswordSchema.safeParse({newPassword:"short",confirmPassword:"short"}).success,false);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
