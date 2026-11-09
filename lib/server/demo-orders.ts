import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {PaperStore,PaperAccountError} from "./paper-store";
import {paperDecimals,MAX_BALANCE_UNITS} from "@/lib/paper/account";
import {cash,cashNotional,notional,demoFee,quantityAtoms,isOpen,type DemoOrder,type DemoFill,type OrderInput} from "@/lib/paper/orders";
import type {TradingPair} from "@/lib/market/types";
import type {OrderBook} from "@/lib/market/orderbook/model";
import {readChartFills,type ChartTradeScope} from "./paper-chart-trades";
import {readPaperPortfolio} from "./paper-portfolio";
import {EXCHANGES} from "@/lib/market/exchange-config";
export class DemoOrders {
  constructor(private db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS demo_orders(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES paper_accounts(id),mutation_id TEXT NOT NULL,input TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(account_id,mutation_id)); CREATE TABLE IF NOT EXISTS demo_fills(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES demo_orders(id),data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS demo_depth(market TEXT PRIMARY KEY,received_at INTEGER NOT NULL,data TEXT NOT NULL);`);}
  list(owner:string){const id=new PaperStore(this.db).read(owner).id;return this.byAccount(id);}
  byAccount(id:string):DemoOrder[]{return this.db.prepare("SELECT data FROM demo_orders WHERE account_id=? ORDER BY (json_extract(data,'$.status') IN('open','partially_filled')) DESC,rowid DESC LIMIT 500").all(id).map(r=>JSON.parse(String(r.data)));}
  active():DemoOrder[]{return this.db.prepare("SELECT data FROM demo_orders WHERE json_extract(data,'$.status') IN('open','partially_filled') ORDER BY rowid").all().map(r=>JSON.parse(String(r.data)));}
  chartFills(owner:string,scope:ChartTradeScope){return readChartFills(this.db,owner,scope);}
  fills(owner:string):DemoFill[]{const id=new PaperStore(this.db).read(owner).id;return this.db.prepare("SELECT f.data,o.data AS order_data FROM demo_fills f JOIN demo_orders o ON o.id=f.order_id WHERE o.account_id=? ORDER BY f.rowid DESC LIMIT 200").all(id).map(r=>{const order:DemoOrder=JSON.parse(String(r.order_data));return {...JSON.parse(String(r.data)),exchange:order.exchange,symbol:order.symbol,base:order.base,quote:order.quote,side:order.side};});}
  private transaction<T>(fn:()=>T):T{this.db.exec("BEGIN IMMEDIATE");try{const result=fn();this.db.exec("COMMIT");return result;}catch(e){this.db.exec("ROLLBACK");throw e;}}
  private save(o:DemoOrder,changed=true){if(changed)o.updatedAt=Math.max(Date.now(),o.updatedAt+1);this.db.prepare("UPDATE demo_orders SET data=? WHERE id=?").run(JSON.stringify(o),o.id);}
  private requireVenue(accountId:string,exchange:TradingPair["exchange"],currency:string,required:number,excludeOrder?:string){
    const portfolio=readPaperPortfolio(this.db,accountId,excludeOrder),local=portfolio.venueBalances.find(b=>b.exchange===exchange&&b.currency===currency)?.availableUnits||0,wallet=portfolio.unassigned.find(b=>b.currency===currency)?.availableUnits||0;
    if(required>local+wallet)throw new PaperAccountError(`Недостаточно ${currency} на ${EXCHANGES[exchange].name}. Активы другой биржи недоступны без перевода.`,400,"VENUE_BALANCE");
  }
  amend(owner:string,id:string,version:number,input:OrderInput,reference:number,book:OrderBook){return this.transaction(()=>{
    const o=this.list(owner).find(o=>o.id===id);if(!o)throw new PaperAccountError("Заявка не найдена",404);
    const previous=this.db.prepare("SELECT input FROM demo_orders WHERE id=?").get(id)!;
    if(previous.input===JSON.stringify(input))return o;
    if(!isOpen(o)||o.filled||o.updatedAt!==version)throw new PaperAccountError("Заявка уже изменилась или частично исполнена. Обновите список",409);
    if(input.type!==o.type||input.side!==o.side||input.exchange!==o.exchange||input.symbol!==o.symbol||o.type==="market")throw new PaperAccountError("Нельзя изменить тип, направление или инструмент заявки");
    if(book.exchange!==o.exchange||book.symbol!==o.symbol||Date.now()-book.receivedAt>5000)throw new PaperAccountError("Нет свежего стакана",503);
    const quantity=quantityAtoms(input.quantity);if(quantity%10**(8-paperDecimals(o.base)))throw new PaperAccountError("Недопустимая точность количества");
    const bound=o.type==="stop_market"?input.stop!*(1+(o.side==="buy"?1:-1)*input.slippage/100):input.limit!;
    const cost=cash(quantity,bound,paperDecimals(o.quote),true),reserve=o.side==="buy"?cost+demoFee(cost):cash(quantity,1,paperDecimals(o.base),false);
    this.requireVenue(o.accountId,o.exchange,o.side==="buy"?o.quote:o.base,reserve,o.id);
    this.move(o,o.side==="buy"?o.quote:o.base,o.reserved-reserve,reserve-o.reserved,reserve>=o.reserved?"reserve":"release");
    const sameStop=input.stop===o.stop;
    Object.assign(o,{quantity,bound,reserved:reserve,limit:input.limit??null,stop:input.stop??null,direction:sameStop?o.direction:(input.stop??0)>reference?"up":"down",triggered:!input.type.startsWith("stop")||o.triggered&&sameStop,lastBook:0});
    this.save(o);this.db.prepare("UPDATE demo_orders SET input=? WHERE id=?").run(JSON.stringify(input),id);return o;
  });}
  private move(o:DemoOrder,currency:string,availableDelta:number,reservedDelta:number,kind:string){
    const decimals=paperDecimals(currency);this.db.prepare("INSERT OR IGNORE INTO paper_balances(account_id,currency,decimals) VALUES(?,?,?)").run(o.accountId,currency,decimals);
    const b=this.db.prepare("SELECT * FROM paper_balances WHERE account_id=? AND currency=?").get(o.accountId,currency)!;
    const a=Number(b.available_units)+availableDelta,r=Number(b.reserved_units)+reservedDelta;
    if(!Number.isSafeInteger(a)||!Number.isSafeInteger(r)||a<0||r<0||a+r>MAX_BALANCE_UNITS)throw new PaperAccountError(`Недостаточно ${currency} или превышен лимит баланса`,400);
    this.db.prepare("UPDATE paper_balances SET available_units=?,reserved_units=? WHERE account_id=? AND currency=?").run(a,r,o.accountId,currency);
    this.db.prepare("INSERT INTO paper_ledger(id,account_id,currency,decimals,kind,available_delta,reserved_delta,available_after,reserved_after,mutation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(),o.accountId,currency,decimals,kind,availableDelta,reservedDelta,a,r,randomUUID(),Date.now());
  }
  create(owner:string,input:OrderInput,pair:TradingPair,reference:number,book:OrderBook){return this.transaction(()=>{
    const accountId=new PaperStore(this.db).read(owner).id;
    const existing=this.db.prepare("SELECT input,data FROM demo_orders WHERE account_id=? AND mutation_id=?").get(accountId,input.mutationId);
    if(existing){if(existing.input!==JSON.stringify(input))throw new PaperAccountError("Идентификатор уже использован другой заявкой",409);return JSON.parse(String(existing.data)) as DemoOrder;}
    if(this.byAccount(accountId).filter(isOpen).length>=50)throw new PaperAccountError("Допускается до 50 открытых заявок");
    const quantity=quantityAtoms(input.quantity),market=input.type.endsWith("market"),best=input.side==="buy"?book.asks[0]?.price:book.bids[0]?.price;
    if(pair.exchange!==input.exchange||pair.symbol!==input.symbol||book.exchange!==pair.exchange||book.symbol!==pair.symbol)throw new PaperAccountError("Данные относятся к другой паре");
    if(quantity%10**(8-paperDecimals(pair.baseAsset)))throw new PaperAccountError(`Количество ${pair.baseAsset}: не более ${paperDecimals(pair.baseAsset)} знаков`);
    if(!best||!Number.isFinite(reference)||reference<=0||Date.now()-book.receivedAt>5000||book.receivedAt>Date.now()+1000||book.exchangeTime!==null&&(Date.now()-book.exchangeTime>15000||book.exchangeTime>Date.now()+5000))throw new PaperAccountError("Нет свежих рыночных данных",503);
    const anchor=input.type==="stop_market"?input.stop!:best;
    const bound=market?anchor*(1+(input.side==="buy"?1:-1)*input.slippage/100):input.limit!;
    if(bound<1e-12)throw new PaperAccountError("Цена меньше поддерживаемой точности 0,000000000001");
    const cost=cash(quantity,bound,paperDecimals(pair.quoteAsset),true),reserved=input.side==="buy"?cost+demoFee(cost):cash(quantity,1,paperDecimals(pair.baseAsset),false);
    this.requireVenue(accountId,pair.exchange,input.side==="buy"?pair.quoteAsset:pair.baseAsset,reserved);
    const now=Date.now(),o:DemoOrder={id:randomUUID(),accountId,exchange:pair.exchange,symbol:pair.symbol,base:pair.baseAsset,quote:pair.quoteAsset,side:input.side,type:input.type,quantity,filled:0,limit:input.limit??null,stop:input.stop??null,direction:(input.stop??0)>reference?"up":"down",triggered:!input.type.startsWith("stop"),bound,reserved,status:"open",createdAt:now,updatedAt:now,lastBook:0,fee:0,cost:0,note:""};
    this.db.prepare("INSERT INTO demo_orders VALUES(?,?,?,?,?)").run(o.id,accountId,input.mutationId,JSON.stringify(input),JSON.stringify(o));
    this.move(o,input.side==="buy"?o.quote:o.base,-reserved,reserved,"reserve");return o;
  });}
  cancel(owner:string,id:string){return this.transaction(()=>{const o=this.list(owner).find(o=>o.id===id);if(!o)throw new PaperAccountError("Заявка не найдена",404);if(isOpen(o))this.release(o,"Отменена пользователем");return o;});}
  private release(o:DemoOrder,note:string){if(o.reserved)this.move(o,o.side==="buy"?o.quote:o.base,o.reserved,-o.reserved,"release");o.reserved=0;o.status=o.filled===o.quantity?"filled":"cancelled";o.note=note;this.save(o);}
  /** One shared depth budget per market per snapshot, inside a single write transaction. */
  process(book:OrderBook,tick?:{price:number;receivedAt:number},now=Date.now()){
    if(now-book.receivedAt>5000||book.receivedAt>now+1000||book.exchangeTime!==null&&(now-book.exchangeTime>15000||book.exchangeTime>now+5000)||!book.bids.length||!book.asks.length||book.bids[0].price>=book.asks[0].price)return;
    this.transaction(()=>{
      const market=`${book.exchange}:${book.symbol}`,previous=this.db.prepare("SELECT * FROM demo_depth WHERE market=?").get(market);
      if(previous&&Number(previous.received_at)>book.receivedAt)return;
      const depth:{bids:{price:number;atoms:number}[];asks:{price:number;atoms:number}[]}=previous&&Number(previous.received_at)===book.receivedAt?JSON.parse(String(previous.data)):{bids:book.bids.map(l=>({price:l.price,atoms:Math.floor(l.quantity*1e8)})),asks:book.asks.map(l=>({price:l.price,atoms:Math.floor(l.quantity*1e8)}))};
      const {bids,asks}=depth;
      for(const o of this.active().filter(o=>o.exchange===book.exchange&&o.symbol===book.symbol)){
        if(readPaperPortfolio(this.db,o.accountId).blockedOrders.includes(o.id)){o.note="Недостаточно активов на этой бирже; требуется перевод";this.save(o,false);continue;}
        const wasFilled=o.filled,wasTriggered=o.triggered;
        if(o.lastBook>=book.receivedAt)continue;
        o.lastBook=book.receivedAt;
        if(!o.triggered){if(!tick||now-tick.receivedAt>5000||tick.receivedAt>now+1000){this.save(o,false);continue;}if(!(o.direction==="up"?tick.price>=o.stop!:tick.price<=o.stop!)){this.save(o,false);continue;}o.triggered=true;}
        const levels=o.side==="buy"?asks:bids;
        for(const level of levels){
          if(o.side==="buy"?level.price>o.bound:level.price<o.bound)break;
          const step=10**(8-paperDecimals(o.base)),q=Math.floor(Math.min(o.quantity-o.filled,level.atoms)/step)*step;if(q<=0)continue;
          const raw=BigInt(o.notional||"0")+notional(q,level.price),units=cashNotional(raw,paperDecimals(o.quote),o.side==="buy")-o.cost;if(units===0&&o.side==="sell")continue;
          // Charge cumulative fee to avoid charging a minimum unit once for every depth row.
          const fee=demoFee(o.cost+units)-o.fee,baseUnits=cash(q,1,paperDecimals(o.base),false),spent=o.side==="buy"?units+fee:baseUnits;
          if(spent>o.reserved)break;
          this.move(o,o.side==="buy"?o.quote:o.base,0,-spent,o.side==="buy"?"buy":"sell");
          this.move(o,o.side==="buy"?o.base:o.quote,o.side==="buy"?baseUnits:units-fee,0,o.side==="buy"?"buy":"sell");
          o.reserved-=spent;o.filled+=q;o.cost+=units;o.fee+=fee;o.notional=String(raw);level.atoms-=q;
          const f:DemoFill={id:randomUUID(),orderId:o.id,price:level.price,quantity:q,quoteUnits:units,feeUnits:fee,receivedAt:book.receivedAt,exchangeTime:book.exchangeTime};
          this.db.prepare("INSERT INTO demo_fills VALUES(?,?,?)").run(f.id,o.id,JSON.stringify(f));
          if(o.filled===o.quantity)break;
        }
        if(o.filled===o.quantity)this.release(o,"Исполнена по DEMO-стакану");else if(o.type.endsWith("market"))this.release(o,"Неисполненный остаток отменён: глубина или защита цены");else{o.status=o.filled?"partially_filled":"open";this.save(o,o.filled!==wasFilled||o.triggered!==wasTriggered);}
      }
      this.db.prepare("INSERT INTO demo_depth VALUES(?,?,?) ON CONFLICT(market) DO UPDATE SET received_at=excluded.received_at,data=excluded.data").run(market,book.receivedAt,JSON.stringify(depth));
    });
  }
}
