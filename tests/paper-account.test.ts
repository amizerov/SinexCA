import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {AccountStore} from "../lib/server/account-store";
import {PaperStore,PaperAccountError} from "../lib/server/paper-store";
import {paperDepositSchema,PAPER_SCALE,MAX_BALANCE_UNITS} from "../lib/paper/account";
test("paper deposits parse exact decimal units and reject invalid or excessive values",()=>{
  for(const value of ["0","-1","1e3","NaN","Infinity","0.0000001","1000000.000001","1.2.3",1000])assert.equal(paperDepositSchema.safeParse({amount:value,mutationId:randomUUID()}).success,false,String(value));
  assert.equal(paperDepositSchema.parse({amount:"0,123456",mutationId:randomUUID()}).amount,123456);
  assert.equal(paperDepositSchema.parse({amount:"0001.20",mutationId:randomUUID()}).amount,1200000);
});
test("multi-asset balances use currency precision, isolate retries and transfer without converting",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-multi-asset-")),path=join(directory,"paper.sqlite");let accounts=new AccountStore(path,false);
  try{
    let store=new PaperStore(accounts.db);const first=accounts.createGuest(),second=accounts.createGuest(),owner=first.session.ownerId;
    const btc={currency:"BTC",amount:"0.00000001",mutationId:randomUUID()};
    assert.equal(paperDepositSchema.parse(btc).amount,1);
    for(const input of [{...btc,amount:"0.000000001"},{...btc,currency:"USDC"},{...btc,currency:"FAKE"}])assert.equal(paperDepositSchema.safeParse(input).success,false);
    store.deposit(owner,btc);store.deposit(owner,btc);
    store.deposit(owner,{currency:"USDC",amount:"100.123456",mutationId:randomUUID()});
    store.deposit(owner,{currency:"USD",amount:"25",mutationId:randomUUID()});
    assert.throws(()=>store.deposit(owner,{...btc,currency:"ETH"}),error=>error instanceof PaperAccountError&&error.code==="IDEMPOTENCY_CONFLICT");
    let snapshot=store.read(owner);
    assert.equal(snapshot.balances.find(b=>b.currency==="BTC")?.availableUnits,1);
    assert.equal(snapshot.balances.find(b=>b.currency==="BTC")?.decimals,8);
    assert.equal(snapshot.balances.find(b=>b.currency==="USDT")?.availableUnits,0);
    assert.equal(snapshot.balances.find(b=>b.currency==="USD")?.availableUnits,25_000_000);
    assert.equal(snapshot.operationCount,3);
    assert.equal(store.read(second.session.ownerId).balances.length,1);
    const user=accounts.register("multiasset@example.com","hash",second.session);
    store.deposit(user.session.ownerId,{currency:"BTC",amount:"0.1",mutationId:randomUUID()});
    accounts.login(user.session.user!.id,first.session);
    const accountOwner=user.session.ownerId;
    snapshot=store.read(accountOwner);
    assert.equal(snapshot.balances.find(b=>b.currency==="BTC")?.availableUnits,10_000_001);
    assert.equal(snapshot.balances.find(b=>b.currency==="USDC")?.availableUnits,100_123_456);
    assert.ok(snapshot.deposits.some(row=>row.kind==="transfer_in"&&row.currency==="BTC"&&row.decimals===8));
    accounts.close();accounts=new AccountStore(path,false);store=new PaperStore(accounts.db);
    assert.deepEqual(store.read(accountOwner).balances,snapshot.balances);
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
test("paper balance, audit and retry identity persist; owners are isolated; failed journal writes roll back money",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-paper-")),path=join(directory,"paper.sqlite");let accounts=new AccountStore(path,false);
  try{
    let store=new PaperStore(accounts.db);const guest=accounts.createGuest(),other=accounts.createGuest(),owner=guest.session.ownerId;
    assert.equal(store.read(owner).balances[0].availableUnits,0);const first={amount:"0.1",mutationId:randomUUID()};
    store.deposit(owner,first);store.deposit(owner,{amount:"0.2",mutationId:randomUUID()});
    const repeated=store.deposit(owner,first);assert.equal(repeated.balances[0].availableUnits,300000);assert.equal(repeated.operationCount,2);
    assert.throws(()=>store.deposit(owner,{...first,amount:"1"}),PaperAccountError);
    assert.equal(store.read(other.session.ownerId).balances[0].availableUnits,0);
    accounts.db.exec("CREATE TRIGGER fail_paper_journal BEFORE INSERT ON paper_ledger BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
    assert.throws(()=>store.deposit(owner,{amount:"100",mutationId:randomUUID()}));assert.equal(store.read(owner).balances[0].availableUnits,300000);
    accounts.db.exec("DROP TRIGGER fail_paper_journal");
    const accountId=store.read(owner).id;assert.throws(()=>accounts.db.prepare("UPDATE paper_balances SET available_units=-1 WHERE account_id=?").run(accountId));
    accounts.close();accounts=new AccountStore(path,false);store=new PaperStore(accounts.db);
    const restored=store.read(owner);assert.equal(restored.balances[0].availableUnits,300000);assert.equal(restored.operationCount,2);assert.equal(restored.openOrderCount,0);assert.equal(restored.fillCount,0);
    assert.equal(Number(accounts.db.prepare("SELECT SUM(available_delta) AS amount FROM paper_ledger WHERE account_id=?").get(accountId)!.amount),restored.balances[0].availableUnits);
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
test("guest paper funds and journal move on registration, merge into an existing account once and preserve limits atomically",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-paper-transfer-")),accounts=new AccountStore(join(directory,"paper.sqlite"),false);
  try{
    const store=new PaperStore(accounts.db),first=accounts.createGuest();const old=store.deposit(first.session.ownerId,{amount:"100",mutationId:randomUUID()});
    const account=accounts.register("paper@example.com","hash",first.session);assert.equal(store.read(account.session.ownerId).id,old.id);assert.equal(store.read(account.session.ownerId).balances[0].availableUnits,100*PAPER_SCALE);
    const second=accounts.createGuest(),secondWallet=store.deposit(second.session.ownerId,{amount:"25",mutationId:randomUUID()});
    accounts.login(account.session.user!.id,second.session);accounts.login(account.session.user!.id,second.session);
    const merged=store.read(account.session.ownerId);assert.equal(merged.balances[0].availableUnits,125*PAPER_SCALE);assert.equal(merged.operations[0].kind,"transfer_in");assert.equal(merged.operationCount,2);
    assert.throws(()=>store.read(second.session.ownerId),PaperAccountError);
    assert.equal(accounts.db.prepare("SELECT transferred_to FROM paper_accounts WHERE id=?").get(secondWallet.id)!.transferred_to,merged.id);
    const third=accounts.createGuest();store.deposit(third.session.ownerId,{amount:"1",mutationId:randomUUID()});
    accounts.db.prepare("UPDATE paper_balances SET available_units=? WHERE account_id=? AND currency='USDT'").run(MAX_BALANCE_UNITS,merged.id);
    assert.throws(()=>accounts.login(account.session.user!.id,third.session));assert.equal(store.read(third.session.ownerId).balances[0].availableUnits,PAPER_SCALE);
    assert.equal(store.read(account.session.ownerId).balances[0].availableUnits,MAX_BALANCE_UNITS);
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
test("account snapshots separate deposit and order history and isolate each owner's orders",()=>{
  const directory=mkdtempSync(join(tmpdir(),"sinex-order-history-")),accounts=new AccountStore(join(directory,"paper.sqlite"),false);
  try{
    const store=new PaperStore(accounts.db),first=accounts.createGuest(),second=accounts.createGuest();
    const a=store.deposit(first.session.ownerId,{amount:"100",mutationId:randomUUID()}),b=store.read(second.session.ownerId),id=randomUUID(),now=Date.now();
    accounts.db.prepare("INSERT INTO paper_orders(id,account_id,client_order_id,exchange,symbol,base_asset,quote_asset,side,order_type,status,quantity_atoms,created_at,updated_at) VALUES(?,?,?,'binance','BTCUSDT','BTC','USDT','buy','market','cancelled',1000000,?,?)").run(id,a.id,randomUUID(),now,now);
    const snapshot=store.read(first.session.ownerId);assert.equal(snapshot.depositCount,1);assert.equal(snapshot.deposits[0].kind,"deposit");assert.equal(snapshot.orderCount,1);assert.equal(snapshot.orders[0].symbol,"BTCUSDT");assert.equal(snapshot.orders[0].quantityAtoms,1000000);assert.equal(snapshot.orders[0].status,"cancelled");assert.equal(snapshot.openOrderCount,0);
    assert.equal(store.read(second.session.ownerId).orders.length,0);
    assert.throws(()=>accounts.db.prepare("INSERT INTO paper_fills(id,order_id,account_id,quantity_atoms,price_atoms,settlement_units,quote_to_usdt_rate_atoms,created_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(),id,b.id,100,100,100,100000000,now),"Fills cannot reference another account's order");
  }finally{accounts.close();rmSync(directory,{recursive:true,force:true});}
});
