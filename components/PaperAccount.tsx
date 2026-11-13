"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {Plus,X} from "lucide-react";
import {PAPER_CURRENCIES,paperDecimals,paperAmount,paperDepositSchema,type PaperAccountSnapshot,type PaperCurrency} from "@/lib/paper/account";
import {AccountHistory} from "./AccountHistory";
import {AccountPositions} from "./AccountPositions";
import {EXCHANGES} from "@/lib/market/exchange-config";
import type {ExchangeId} from "@/lib/market/types";
import {useFloatingNotice} from "@/components/FloatingNotices";
interface PendingDeposit {amount:string;currency?:PaperCurrency;mutationId:string}
function pendingDeposit(key:string):PendingDeposit|null{try{const value=JSON.parse(localStorage.getItem(key)||"null");return paperDepositSchema.safeParse(value).success?value:null;}catch{return null;}}
export function PaperAccount({ownerId,guest}:{ownerId:string;guest:boolean}){
  const pendingKey=`sinex:paper-deposit:${ownerId}`;
  const [initialPending]=useState(()=>pendingDeposit(pendingKey));
  const pending=useRef<PendingDeposit|null>(initialPending),alive=useRef(true),requestVersion=useRef(0),saving=useRef(false);
  const [amount,setAmount]=useState(initialPending?.amount||"10000"),[snapshot,setSnapshot]=useState<PaperAccountSnapshot>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [historyPage,setHistoryPage]=useState(0);
  const [depositOpen,setDepositOpen]=useState(false),[currency,setCurrency]=useState<PaperCurrency>(initialPending?.currency||"USDT"),[depositError,setDepositError]=useState("");
  const depositDialog=useRef<HTMLDialogElement>(null),depositTrigger=useRef<HTMLButtonElement>(null);
  useFloatingNotice(`paper-account:${ownerId}`,error,{actionLabel:!snapshot?"Повторить":undefined,action:!snapshot?()=>void load():undefined});
  useFloatingNotice(`paper-deposit:${ownerId}`,depositError);
  useEffect(()=>{if(depositOpen)depositDialog.current?.showModal();else depositDialog.current?.close();},[depositOpen]);
  const load=useCallback(async(signal?:AbortSignal)=>{
    if(saving.current||signal?.aborted)return;const version=++requestVersion.current;setLoading(true);
    try{
      const response=await fetch(historyPage?`/api/paper/account?offset=${historyPage*50}`:"/api/paper/account",{cache:"no-store",signal}),json=await response.json();
      if(!response.ok||json.ownerId!==ownerId)throw new Error(json.error?.message||"Аккаунт изменился. Обновите страницу.");
      if(alive.current&&requestVersion.current===version){setSnapshot(json.data);setError("");}
    }catch(cause){if(alive.current&&!signal?.aborted&&requestVersion.current===version)setError(cause instanceof Error?cause.message:"Не удалось загрузить тестовый счёт.");}
    finally{if(alive.current&&requestVersion.current===version)setLoading(false);}
  },[ownerId,historyPage]);
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;async function poll(){if(!document.hidden)await load(controller.signal);if(!controller.signal.aborted)timer=setTimeout(poll,5000);}void Promise.resolve().then(poll);
    const refresh=()=>{if(!document.hidden)void load(controller.signal);},storage=(event:StorageEvent)=>{if(event.key==="sinex:paper-account")refresh();};
    window.addEventListener("focus",refresh);window.addEventListener("storage",storage);
    return()=>{alive.current=false;controller.abort();clearTimeout(timer);window.removeEventListener("focus",refresh);window.removeEventListener("storage",storage);};
  },[load]);
  async function deposit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving.current||!snapshot)return;
    const normalized=amount.trim().replace(",",".");
    const draft={amount:normalized,currency,mutationId:crypto.randomUUID()},parsed=paperDepositSchema.safeParse(draft);
    if(!parsed.success){setDepositError(parsed.error.issues[0]?.message||"Проверьте сумму пополнения.");return;}
    const previous=pending.current?paperDepositSchema.safeParse(pending.current):undefined;
    const request=previous?.success&&previous.data.amount===parsed.data.amount&&previous.data.currency===currency?pending.current!:draft;
    saving.current=true;++requestVersion.current;setBusy(true);setDepositError("");setError("");setNotice("");pending.current=request;
    try{localStorage.setItem(pendingKey,JSON.stringify(request));}catch{/* The in-memory request ID still prevents a repeated submit. */}
    try{
      const response=await fetch("/api/paper/account",{method:"POST",headers:{"Content-Type":"application/json","X-Workspace-Id":ownerId},body:JSON.stringify(request),signal:AbortSignal.timeout(15000)}),json=await response.json();
      if(!response.ok){if(response.status>=400&&response.status<500){pending.current=null;try{localStorage.removeItem(pendingKey);}catch{}}throw new Error(json.error?.message||"Не удалось пополнить тестовый счёт.");}
      if(json.ownerId!==ownerId)throw new Error("Аккаунт изменился. Обновите страницу.");
      pending.current=null;try{localStorage.removeItem(pendingKey);localStorage.setItem("sinex:paper-account",crypto.randomUUID());}catch{/* The current view receives the confirmed response directly. */}
      if(alive.current){setHistoryPage(0);setSnapshot(json.data);setNotice(`Зачислено ${paperAmount(parsed.data.amount,paperDecimals(currency))} ${currency} на тестовый счёт.`);setDepositOpen(false);}
    }catch(cause){if(alive.current)setDepositError(cause instanceof Error?cause.message:"Нет связи с сервером. Повторите запрос — повторного зачисления не будет.");}
    finally{saving.current=false;if(alive.current){setBusy(false);setLoading(false);}}
  }
  const balances=[...(snapshot?.balances||[])].sort((a,b)=>a.currency==="USDT"?-1:b.currency==="USDT"?1:a.currency.localeCompare(b.currency));
  return <div className="paper-account">
    {guest&&<p className="account-hint">Гостевой счёт привязан к этому браузеру. При входе тестовый баланс переносится в аккаунт.</p>}
    {loading&&!snapshot?<p className="account-hint" role="status">Загружаем тестовый счёт…</p>:snapshot&&<>
      <section className="paper-assets" aria-label="Тестовый баланс">
        <div className="paper-assets-title"><h3>Активы</h3><button ref={depositTrigger} type="button" className="account-submit" disabled={busy} onClick={()=>{setDepositError("");setDepositOpen(true);}}><Plus size={14}/>Пополнить</button></div>
        <div className="paper-table-wrap"><table className="paper-assets-table"><thead><tr><th>Валюта</th><th>Доступно</th><th>В заявках</th><th>Всего</th></tr></thead><tbody>{balances.map(balance=><tr key={balance.currency} data-currency={balance.currency}><td><div className="paper-asset-name"><strong>{balance.currency}</strong>{snapshot.portfolio&&<span className="paper-asset-venues">{snapshot.portfolio.venueBalances.filter(b=>b.currency===balance.currency&&b.availableUnits+b.reservedUnits>0).map(b=><span className="paper-asset-venue" key={b.exchange}>{EXCHANGES[b.exchange as ExchangeId]?.name||b.exchange} · {paperAmount(b.availableUnits+b.reservedUnits,b.decimals)}</span>)}{snapshot.portfolio.unassigned.some(b=>b.currency===balance.currency&&b.availableUnits>0)&&<span title="Средства пополнений, ещё не использованные на бирже">Кошелёк</span>}</span>}</div></td><td data-paper-balance={balance.currency}>{paperAmount(balance.availableUnits,balance.decimals)}</td><td>{paperAmount(balance.reservedUnits,balance.decimals)}</td><td>{paperAmount(balance.availableUnits+balance.reservedUnits,balance.decimals)}</td></tr>)}</tbody></table></div>
      </section>
      <dialog ref={depositDialog} className="account-dialog paper-deposit-dialog" aria-labelledby="paper-deposit-title" onCancel={event=>{if(busy)event.preventDefault();else setDepositOpen(false);}} onClose={()=>{setDepositOpen(false);depositTrigger.current?.focus();}} onClick={event=>{if(event.target===depositDialog.current&&!busy){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setDepositOpen(false);}}}>
        <button type="button" className="account-close" aria-label="Закрыть" disabled={busy} onClick={()=>setDepositOpen(false)}><X size={19}/></button>
        <h2 id="paper-deposit-title">Пополнить тестовый счёт</h2><p className="account-hint">Виртуальные средства для тестовой торговли.</p>
        <form className="paper-deposit" onSubmit={deposit}>
          <label htmlFor="paper-currency">Валюта</label><select id="paper-currency" value={currency} disabled={busy} onChange={event=>{const next=event.target.value as PaperCurrency;setCurrency(next);setAmount(["BTC","ETH","BNB"].includes(next)?"1":"10000");setDepositError("");}}>{PAPER_CURRENCIES.map(asset=><option key={asset} value={asset}>{asset}</option>)}</select>
          <label htmlFor="paper-amount">Сумма, {currency}</label><div className="paper-deposit-fields"><input id="paper-amount" aria-label="Сумма тестового пополнения" type="text" inputMode="decimal" required maxLength={24} value={amount} disabled={busy} onChange={event=>{setAmount(event.target.value);setDepositError("");}}/></div>
          <div className="paper-presets">{(["BTC","ETH","BNB"].includes(currency)?[0.01,0.1,1]:[1000,10000,100000]).map(value=><button key={value} type="button" disabled={busy} onClick={()=>{setAmount(String(value));setDepositError("");}}>{new Intl.NumberFormat("ru-RU").format(value)}</button>)}</div>
          <button type="submit" className="account-submit" disabled={busy||loading}>{busy?"Пополняем…":"Пополнить"}</button>
        </form>
      </dialog>
      {notice&&<p className="paper-notice" role="status">{notice}</p>}
      <AccountPositions portfolio={snapshot.portfolio}/>
      <AccountHistory snapshot={snapshot} loading={busy||loading} page={historyPage} setPage={setHistoryPage} refresh={()=>void load()}/>
   </>}
  </div>;
}
