import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {DemoOrder} from "@/lib/paper/orders";
import {MAX_BALANCE_UNITS,paperDepositSchema,paperDecimals,type PaperAccountSnapshot,type PaperLedgerEntry,type PaperOrder,type PaperFill} from "@/lib/paper/account";
export class PaperAccountError extends Error {constructor(message:string,public status=400,public code="PAPER_ACCOUNT_ERROR"){super(message);}}
export function initializePaperTables(db:DatabaseSync){
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_accounts(
      id TEXT PRIMARY KEY,owner_id TEXT NOT NULL UNIQUE REFERENCES workspace_owners(id),
      mode TEXT NOT NULL DEFAULT 'paper' CHECK(mode='paper'),created_at INTEGER NOT NULL,
      transferred_to TEXT REFERENCES paper_accounts(id),CHECK(transferred_to IS NULL OR transferred_to<>id)
    );
    CREATE TABLE IF NOT EXISTS paper_balances(
      account_id TEXT NOT NULL REFERENCES paper_accounts(id),currency TEXT NOT NULL,decimals INTEGER NOT NULL DEFAULT 6 CHECK(decimals IN(6,8)),
      available_units INTEGER NOT NULL DEFAULT 0 CHECK(available_units>=0 AND available_units<=1000000000000000),
      reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units>=0 AND reserved_units<=1000000000000000),
      PRIMARY KEY(account_id,currency),CHECK(available_units+reserved_units<=1000000000000000)
    );
    CREATE TABLE IF NOT EXISTS paper_orders(
      id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES paper_accounts(id),client_order_id TEXT NOT NULL,
      exchange TEXT NOT NULL,market_type TEXT NOT NULL DEFAULT 'spot' CHECK(market_type='spot'),symbol TEXT NOT NULL,
      base_asset TEXT NOT NULL,quote_asset TEXT NOT NULL,side TEXT NOT NULL CHECK(side IN('buy','sell')),
      order_type TEXT NOT NULL CHECK(order_type IN('market','limit')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','open','partially_filled','filled','cancelled','rejected')),
      quantity_atoms INTEGER NOT NULL CHECK(quantity_atoms>0),filled_atoms INTEGER NOT NULL DEFAULT 0 CHECK(filled_atoms>=0 AND filled_atoms<=quantity_atoms),
      limit_price_atoms INTEGER CHECK(limit_price_atoms>0),reserved_usdt_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_usdt_units>=0),
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      UNIQUE(account_id,client_order_id),UNIQUE(id,account_id),CHECK(order_type<>'limit' OR limit_price_atoms IS NOT NULL)
    );
    CREATE TABLE IF NOT EXISTS paper_fills(
      id TEXT PRIMARY KEY,order_id TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      quantity_atoms INTEGER NOT NULL CHECK(quantity_atoms>0),price_atoms INTEGER NOT NULL CHECK(price_atoms>0),
      settlement_currency TEXT NOT NULL DEFAULT 'USDT' CHECK(settlement_currency='USDT'),
      settlement_units INTEGER NOT NULL CHECK(settlement_units>0),fee_units INTEGER NOT NULL DEFAULT 0 CHECK(fee_units>=0),
      quote_to_usdt_rate_atoms INTEGER NOT NULL CHECK(quote_to_usdt_rate_atoms>0),created_at INTEGER NOT NULL,
      FOREIGN KEY(order_id,account_id) REFERENCES paper_orders(id,account_id)
    );
    CREATE TABLE IF NOT EXISTS paper_ledger(
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL REFERENCES paper_accounts(id),currency TEXT NOT NULL,decimals INTEGER NOT NULL DEFAULT 6 CHECK(decimals IN(6,8)),
      kind TEXT NOT NULL CHECK(kind IN('deposit','transfer_in','transfer_out','reserve','release','buy','sell','fee')),
      available_delta INTEGER NOT NULL,reserved_delta INTEGER NOT NULL,
      available_after INTEGER NOT NULL CHECK(available_after>=0),reserved_after INTEGER NOT NULL CHECK(reserved_after>=0),
      mutation_id TEXT NOT NULL,related_account_id TEXT REFERENCES paper_accounts(id),
      order_id TEXT REFERENCES paper_orders(id),fill_id TEXT REFERENCES paper_fills(id),created_at INTEGER NOT NULL,
      UNIQUE(account_id,mutation_id,currency)
    );
    CREATE INDEX IF NOT EXISTS paper_ledger_account_sequence ON paper_ledger(account_id,sequence DESC);
    CREATE INDEX IF NOT EXISTS paper_orders_account_status ON paper_orders(account_id,status);
    CREATE INDEX IF NOT EXISTS paper_orders_account_created ON paper_orders(account_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS paper_fills_account_created ON paper_fills(account_id,created_at);
  `);
  for(const table of ["paper_balances","paper_ledger"]){const columns=db.prepare(`PRAGMA table_info(${table})`).all();if(!columns.some(column=>column.name==="decimals"))db.exec(`ALTER TABLE ${table} ADD COLUMN decimals INTEGER NOT NULL DEFAULT 6 CHECK(decimals IN(6,8));`);}
}
export class PaperStore {
  constructor(private db:DatabaseSync){}
  private account(ownerId:string){
    const id=randomUUID();
    this.db.prepare("INSERT OR IGNORE INTO paper_accounts(id,owner_id,created_at) VALUES(?,?,?)").run(id,ownerId,Date.now());
    const row=this.db.prepare("SELECT id,transferred_to FROM paper_accounts WHERE owner_id=?").get(ownerId)!;
    if(row.transferred_to)throw new PaperAccountError("Гостевой счёт уже перенесён в аккаунт. Обновите страницу.",409);
    this.db.prepare("INSERT OR IGNORE INTO paper_balances(account_id,currency) VALUES(?,'USDT')").run(row.id!);
    return String(row.id);
  }
  read(ownerId:string,historyOffset=0):PaperAccountSnapshot{
    const id=this.account(ownerId);
    const balances=this.db.prepare("SELECT currency,decimals,available_units,reserved_units FROM paper_balances WHERE account_id=? ORDER BY currency").all(id).map(row=>({currency:String(row.currency),decimals:Number(row.decimals),availableUnits:Number(row.available_units),reservedUnits:Number(row.reserved_units)}));
    const operations:PaperLedgerEntry[]=this.db.prepare("SELECT * FROM paper_ledger WHERE account_id=? ORDER BY sequence DESC LIMIT 30").all(id).map(row=>({id:String(row.id),kind:String(row.kind),currency:String(row.currency),decimals:Number(row.decimals),availableDelta:Number(row.available_delta),reservedDelta:Number(row.reserved_delta),availableAfter:Number(row.available_after),reservedAfter:Number(row.reserved_after),createdAt:Number(row.created_at)}));
    const deposits:PaperLedgerEntry[]=this.db.prepare("SELECT * FROM paper_ledger WHERE account_id=? AND kind IN('deposit','transfer_in') ORDER BY sequence DESC LIMIT 30").all(id).map(row=>({id:String(row.id),kind:String(row.kind),currency:String(row.currency),decimals:Number(row.decimals),availableDelta:Number(row.available_delta),reservedDelta:Number(row.reserved_delta),availableAfter:Number(row.available_after),reservedAfter:Number(row.reserved_after),createdAt:Number(row.created_at)}));
    const orders:PaperOrder[]=this.db.prepare("SELECT * FROM paper_orders WHERE account_id=? ORDER BY created_at DESC,id DESC").all(id).map(row=>({id:String(row.id),exchange:String(row.exchange),symbol:String(row.symbol),base:String(row.base_asset),quote:String(row.quote_asset),reservedUnits:Number(row.reserved_usdt_units),reservedCurrency:"USDT",updatedAt:Number(row.updated_at),side:String(row.side),orderType:String(row.order_type),status:String(row.status),quantityAtoms:Number(row.quantity_atoms),filledAtoms:Number(row.filled_atoms),limitPriceAtoms:row.limit_price_atoms==null?null:Number(row.limit_price_atoms),limitPrice:row.limit_price_atoms==null?null:Number(row.limit_price_atoms)/1e8,createdAt:Number(row.created_at)}));
    const demo:DemoOrder[]=this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='demo_orders'").get()?this.db.prepare("SELECT data FROM demo_orders WHERE account_id=? ORDER BY rowid DESC").all(id).map(row=>JSON.parse(String(row.data))):[];
    const demoFills=demo.length?Number(this.db.prepare("SELECT COUNT(*) AS n FROM demo_fills f JOIN demo_orders o ON o.id=f.order_id WHERE o.account_id=?").get(id)!.n):0;
    const combined:PaperOrder[]=[...orders,...demo.map(o=>({id:o.id,exchange:o.exchange,symbol:o.symbol,base:o.base,quote:o.quote,reservedUnits:o.reserved,reservedCurrency:o.side==="buy"?o.quote:o.base,triggered:o.triggered,updatedAt:o.updatedAt,side:o.side,orderType:o.type,status:o.status,quantityAtoms:o.quantity,filledAtoms:o.filled,limitPriceAtoms:null,limitPrice:o.limit,stopPrice:o.stop,createdAt:o.createdAt}))].sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
    const openOrders=combined.filter(o=>["pending","open","partially_filled"].includes(o.status)),closedOrders=combined.filter(o=>!["pending","open","partially_filled"].includes(o.status)).slice(historyOffset,historyOffset+50);
    const legacyFills:PaperFill[]=this.db.prepare("SELECT f.*,o.exchange,o.symbol,o.base_asset,o.quote_asset,o.side FROM paper_fills f JOIN paper_orders o ON o.id=f.order_id AND o.account_id=f.account_id WHERE f.account_id=? ORDER BY f.created_at DESC,f.id DESC LIMIT ?").all(id,historyOffset+50).map(f=>({id:String(f.id),orderId:String(f.order_id),exchange:String(f.exchange),symbol:String(f.symbol),base:String(f.base_asset),quote:String(f.quote_asset),side:String(f.side),price:Number(f.price_atoms)/1e8,quantityAtoms:Number(f.quantity_atoms),settlementCurrency:String(f.settlement_currency),settlementUnits:Number(f.settlement_units),feeUnits:Number(f.fee_units),createdAt:Number(f.created_at)}));
    const recentDemoFills:PaperFill[]=demo.length?this.db.prepare("SELECT f.data,o.data AS order_data FROM demo_fills f JOIN demo_orders o ON o.id=f.order_id WHERE o.account_id=? ORDER BY json_extract(f.data,'$.receivedAt') DESC,f.id DESC LIMIT ?").all(id,historyOffset+50).map(r=>{const o:DemoOrder=JSON.parse(String(r.order_data)),f=JSON.parse(String(r.data));return {id:f.id,orderId:o.id,exchange:o.exchange,symbol:o.symbol,base:o.base,quote:o.quote,side:o.side,price:f.price,quantityAtoms:f.quantity,settlementCurrency:o.quote,settlementUnits:f.quoteUnits,feeUnits:f.feeUnits,createdAt:f.receivedAt};}):[];
    const fills=[...legacyFills,...recentDemoFills].sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id)).slice(historyOffset,historyOffset+50);
    return {id,mode:"paper",balances,operations,deposits,orders:combined.slice(historyOffset,historyOffset+50),openOrders,closedOrders,fills,historyOffset,depositCount:Number(this.db.prepare("SELECT COUNT(*) AS count FROM paper_ledger WHERE account_id=? AND kind IN('deposit','transfer_in')").get(id)!.count),orderCount:demo.length+Number(this.db.prepare("SELECT COUNT(*) AS count FROM paper_orders WHERE account_id=?").get(id)!.count),operationCount:Number(this.db.prepare("SELECT COUNT(*) AS count FROM paper_ledger WHERE account_id=?").get(id)!.count),openOrderCount:demo.filter(o=>o.status==="open"||o.status==="partially_filled").length+Number(this.db.prepare("SELECT COUNT(*) AS count FROM paper_orders WHERE account_id=? AND status IN('pending','open','partially_filled')").get(id)!.count),fillCount:demoFills+Number(this.db.prepare("SELECT COUNT(*) AS count FROM paper_fills WHERE account_id=?").get(id)!.count)};
  }
  deposit(ownerId:string,input:unknown):PaperAccountSnapshot{
    const {amount,mutationId,currency}=paperDepositSchema.parse(input),decimals=paperDecimals(currency);
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const id=this.account(ownerId),previous=this.db.prepare("SELECT kind,currency,decimals,available_delta FROM paper_ledger WHERE account_id=? AND mutation_id=?").get(id,mutationId);
      if(previous){if(previous.kind!=="deposit"||previous.currency!==currency||Number(previous.decimals)!==decimals||Number(previous.available_delta)!==amount)throw new PaperAccountError("Этот запрос уже использован для другой суммы или валюты.",409,"IDEMPOTENCY_CONFLICT");const snapshot=this.read(ownerId);this.db.exec("COMMIT");return snapshot;}
      this.db.prepare("INSERT OR IGNORE INTO paper_balances(account_id,currency,decimals) VALUES(?,?,?)").run(id,currency,decimals);
      const balance=this.db.prepare("SELECT available_units,reserved_units,decimals FROM paper_balances WHERE account_id=? AND currency=?").get(id,currency)!;
      if(Number(balance.decimals)!==decimals)throw new PaperAccountError("Точность валюты не совпадает с балансом.",409);
      const available=Number(balance.available_units)+amount,reserved=Number(balance.reserved_units);
      if(!Number.isSafeInteger(available)||available+reserved>MAX_BALANCE_UNITS)throw new PaperAccountError(`Лимит баланса ${currency} — ${MAX_BALANCE_UNITS/10**decimals} ${currency}.`,400,"BALANCE_LIMIT");
      this.db.prepare("UPDATE paper_balances SET available_units=? WHERE account_id=? AND currency=?").run(available,id,currency);
      this.db.prepare("INSERT INTO paper_ledger(id,account_id,currency,decimals,kind,available_delta,reserved_delta,available_after,reserved_after,mutation_id,created_at) VALUES(?,?,?,?,'deposit',?,0,?,?,?,?)").run(randomUUID(),id,currency,decimals,amount,available,reserved,mutationId,Date.now());
      const snapshot=this.read(ownerId);this.db.exec("COMMIT");return snapshot;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  /** Called inside AccountStore's login/registration transaction. */
  transferGuest(guestOwnerId:string,targetOwnerId:string){
    const guest=this.db.prepare("SELECT id,transferred_to FROM paper_accounts WHERE owner_id=?").get(guestOwnerId);
    if(!guest||guest.transferred_to||guestOwnerId===targetOwnerId)return;
    const target=this.db.prepare("SELECT id FROM paper_accounts WHERE owner_id=?").get(targetOwnerId);
    if(!target){this.db.prepare("UPDATE paper_accounts SET owner_id=? WHERE id=?").run(targetOwnerId,guest.id!);return;}
    const balances=this.db.prepare("SELECT * FROM paper_balances WHERE account_id=?").all(guest.id!);
    if(balances.some(balance=>Number(balance.reserved_units)>0)||Number(this.db.prepare("SELECT COUNT(*) AS count FROM paper_orders WHERE account_id=? AND status IN('pending','open','partially_filled')").get(guest.id!)!.count)>0)throw new PaperAccountError("Сначала завершите заявки на гостевом тестовом счёте.",409);
    for(const balance of balances){
      const amount=Number(balance.available_units);if(!amount)continue;
      this.db.prepare("INSERT OR IGNORE INTO paper_balances(account_id,currency,decimals) VALUES(?,?,?)").run(target.id!,balance.currency!,balance.decimals!);
      const destination=this.db.prepare("SELECT available_units,reserved_units,decimals FROM paper_balances WHERE account_id=? AND currency=?").get(target.id!,balance.currency!)!;
      if(destination.decimals!==balance.decimals)throw new PaperAccountError("Точность балансов не совпадает. Перенос отменён.",409);
      const available=Number(destination.available_units)+amount,reserved=Number(destination.reserved_units);
      if(!Number.isSafeInteger(available)||available+reserved>MAX_BALANCE_UNITS)throw new PaperAccountError("Баланс после переноса превысит лимит тестового счёта.",409);
      const mutationId=randomUUID(),now=Date.now();
      this.db.prepare("UPDATE paper_balances SET available_units=0 WHERE account_id=? AND currency=?").run(guest.id!,balance.currency!);
      this.db.prepare("UPDATE paper_balances SET available_units=? WHERE account_id=? AND currency=?").run(available,target.id!,balance.currency!);
      const insert=this.db.prepare("INSERT INTO paper_ledger(id,account_id,currency,kind,available_delta,reserved_delta,available_after,reserved_after,mutation_id,related_account_id,created_at,decimals) VALUES(?,?,?,?,?,0,?,?,?,?,?,?)");
      insert.run(randomUUID(),guest.id!,balance.currency!,"transfer_out",-amount,0,0,mutationId,target.id!,now,balance.decimals!);
      insert.run(randomUUID(),target.id!,balance.currency!,"transfer_in",amount,available,reserved,mutationId,guest.id!,now,balance.decimals!);
    }
    this.db.prepare("UPDATE paper_accounts SET transferred_to=? WHERE id=?").run(target.id!,guest.id!);
  }
}
