"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import Link from "next/link";
import {X} from "lucide-react";
import {useAccount} from "@/components/Account";
import {useDraggableDialog} from "@/hooks/use-draggable-dialog";
import {useOrderBook} from "@/hooks/use-order-book";
import {EXCHANGES} from "@/lib/market/exchange-config";
import {price} from "@/lib/market/format";
import {paperDecimals,paperAmount} from "@/lib/paper/account";
import {orderNames,type OrderType} from "@/lib/paper/orders";
import {PAPER_CAPABILITIES,defaultOrderPreferences,orderPreferencesKey,orderPreferencesSchema,orderDraftCalculations,validateOrderDraft,type OrderFormDraft} from "@/lib/paper/order-draft";
import type {OrderDialogProps} from "./DemoTrading";

export function NewOrderDialog({pair,draft:initial,currentPrice,orders,close}:OrderDialogProps){
  const {session}=useAccount(),owner=session?.ownerId??"guest",preferencesKey=orderPreferencesKey(owner,pair.marketType),futures=pair.marketType==="futures",capability=PAPER_CAPABILITIES[pair.marketType];
  const [preferences]=useState(()=>{try{const parsed=orderPreferencesSchema.safeParse(JSON.parse(localStorage.getItem(preferencesKey)||"null"));if(parsed.success)return parsed.data;}catch{}return defaultOrderPreferences();});
  const [draft,setDraft]=useState<OrderFormDraft>(()=>({side:initial.side,type:initial.usePreferences&&capability.types.includes(preferences.type)?preferences.type:capability.types.includes(initial.type)?initial.type:"limit",quantity:"",limit:String(initial.price),stop:String(initial.price),stopLoss:"",takeProfit:"",leverage:pair.futuresInfo?.maxLeverage?Math.min(preferences.leverage,pair.futuresInfo.maxLeverage):1,margin:preferences.margin}));
  const [slippage,setSlippage]=useState(String(preferences.slippage)),[riskExpanded,setRiskExpanded]=useState(preferences.riskExpanded),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),floating=useDraggableDialog(dialog,"order"),inFlight=useRef(false),mutation=useRef({body:"",id:""});
  const source=useOrderBook(pair),book=source.book,market=draft.type.endsWith("market"),stopped=draft.type.startsWith("stop");
  const best=(!source.stale?(draft.side==="buy"?book?.asks[0]?.price:book?.bids[0]?.price):undefined)??currentPrice??initial.price;
  const estimate=orderDraftCalculations(pair,draft,best),problem=draft.quantity?validateOrderDraft(pair,draft,best):"",hasRisk=!!draft.stopLoss||!!draft.takeProfit;
  const limits=futures?pair.futuresInfo:pair.tradingLimits;
  const balances=orders.data?.account.balances||[],currency=draft.side==="buy"?pair.quoteAsset:pair.baseAsset,portfolio=orders.data?.account.portfolio;
  const units=portfolio?(portfolio.venueBalances.find(b=>b.exchange===pair.exchange&&b.currency===currency)?.availableUnits||0)+(portfolio.unassigned.find(b=>b.currency===currency)?.availableUnits||0):balances.find(b=>b.currency===currency)?.availableUnits||0;
  const available=units/10**paperDecimals(currency);
  function patch(update:Partial<OrderFormDraft>){setError("");setDraft(old=>({...old,...update}));}
  function closeWindow(){floating.remember();close();}
  useEffect(()=>{
    const value=orderPreferencesSchema.safeParse({type:draft.type,leverage:draft.leverage,margin:draft.margin,slippage:Number(slippage),riskExpanded});
    if(value.success)try{localStorage.setItem(preferencesKey,JSON.stringify(value.data));}catch{/* Form operation does not depend on preference storage. */}
  },[preferencesKey,draft.type,draft.leverage,draft.margin,slippage,riskExpanded]);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(inFlight.current)return;
    const invalid=validateOrderDraft(pair,draft,best);if(invalid){setError(invalid);return;}
    if(!capability.available){setError("Демо-торговля фьючерсами пока недоступна");return;}
    if(hasRisk){setError("Прикреплённые Stop Loss и Take Profit не поддерживаются демо-API. Очистите их для размещения входной заявки.");return;}
    inFlight.current=true;setBusy(true);setError("");
    try{
      const body={marketType:"spot" as const,exchange:pair.exchange,symbol:pair.symbol,side:draft.side,type:draft.type,quantity:draft.quantity,...!market?{limit:Number(draft.limit)}:{},...stopped?{stop:Number(draft.stop)}:{},slippage:Number(slippage)};
      const key=JSON.stringify(body);if(mutation.current.body!==key)mutation.current={body:key,id:crypto.randomUUID()};
      await orders.request({...body,mutationId:mutation.current.id});closeWindow();
    }catch(reason){setError(reason instanceof Error?reason.message:"Не удалось разместить демо-заявку.");}finally{inFlight.current=false;setBusy(false);}
  }
  let remaining=Number(draft.quantity),taken=0,notional=0;
  for(const level of (draft.side==="buy"?book?.asks:book?.bids)||[]){if(!remaining||!Number.isFinite(remaining))break;const bound=market?best*(1+(draft.side==="buy"?1:-1)*Number(slippage)/100):Number(draft.limit);if(draft.side==="buy"?level.price>bound:level.price<bound)break;const q=Math.min(remaining,level.quantity);taken+=q;notional+=q*level.price;remaining-=q;}
  const bookPrice=!source.stale?(taken>0?notional/taken:draft.side==="buy"?book?.asks[0]?.price:book?.bids[0]?.price):undefined;
  const metric=(label:string,value:React.ReactNode,attributes?:Record<string,string>)=><><dt>{label}</dt><dd {...attributes}>{value}</dd></>;
  const amount=(value:number|undefined)=>value===undefined?"—":`${price(value)} ${pair.quoteAsset}`;
  return createPortal(<dialog ref={dialog} className="account-dialog demo-order-dialog new-order-dialog" aria-modal="false" aria-labelledby="demo-order-title" style={{left:floating.position.x,top:floating.position.y}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();if(!busy)closeWindow();}}}>
    <header className="demo-order-heading" tabIndex={0} aria-label="Переместить заявку" onPointerDown={floating.start} onPointerMove={floating.move} onPointerUp={floating.end} onPointerCancel={floating.end} onLostPointerCapture={floating.end} onKeyDown={floating.key}>
      <div><h2 id="demo-order-title">Новая заявка — {pair.baseAsset}/{pair.quoteAsset}</h2><p className="demo-instrument"><b>DEMO</b>{EXCHANGES[pair.exchange].name} · {futures?pair.futuresInfo?.kind==="delivery"?"Delivery":"Perpetual":"Spot"}</p></div><button disabled={busy} onClick={closeWindow} aria-label="Закрыть заявку"><X size={17}/></button>
    </header>
    <form className="demo-order-body" onSubmit={submit}><fieldset disabled={busy}>
      {!capability.available&&<p className="order-availability" role="status">Демо-торговля фьючерсами пока недоступна</p>}
      <div className="order-layout">
      <section className="order-input-column">
      <div className="demo-sides">{(["buy","sell"] as const).map(side=><button type="button" key={side} aria-pressed={draft.side===side} className={draft.side===side?side==="buy"?"positive":"negative":""} onClick={()=>patch({side})}>{futures?side==="buy"?"Long":"Short":side==="buy"?"Купить":"Продать"}</button>)}</div>
      <label>Тип заявки<select aria-label="Тип заявки" value={draft.type} onChange={event=>patch({type:event.target.value as OrderType})}>{capability.types.map(type=><option key={type} value={type}>{orderNames[type]}</option>)}</select></label>
      {stopped&&<label>Стоп-цена активации, {pair.quoteAsset}<input required type="number" step="any" min="0.000000000001" value={draft.stop} onChange={event=>patch({stop:event.target.value})}/></label>}
      {market?<p className="account-hint">Ориентировочная цена: {amount(best)}. Цена исполнения может отличаться из-за проскальзывания.</p>:<label>Лимитная цена, {pair.quoteAsset}<input required type="number" step="any" min="0.000000000001" value={draft.limit} onChange={event=>patch({limit:event.target.value})}/></label>}
      <label>Количество, {pair.baseAsset}<input required inputMode="decimal" value={draft.quantity} onChange={event=>patch({quantity:event.target.value.replace(",",".")})}/></label>
      {limits?.quantityStep&&<p className="account-hint">Шаг {limits.quantityStep} {pair.baseAsset}{limits.minQuantity?` · минимум ${limits.minQuantity} ${pair.baseAsset}`:""}</p>}
      {!futures&&<><div className="paper-presets">{[25,50,75,100].map(percent=><button key={percent} type="button" onClick={()=>{const p=(Number(estimate.entry)||best)*(market?1+Number(slippage)/100:1);let quantity=(draft.side==="buy"?available/(p*1.001):available)*percent/100;if(limits?.quantityStep)quantity=Math.floor(quantity/limits.quantityStep)*limits.quantityStep;patch({quantity:(Math.floor(quantity*10**paperDecimals(pair.baseAsset))/10**paperDecimals(pair.baseAsset)).toFixed(paperDecimals(pair.baseAsset))});}}>{percent}%</button>)}</div><p className="account-hint">Доступно: {paperAmount(units,paperDecimals(currency))} {currency} · <Link href="/account">Пополнить счёт</Link></p></>}
      {futures&&<div className="order-form-grid"><label>Плечо, ×<input aria-label="Плечо, ×" type="number" min="1" max={pair.futuresInfo?.maxLeverage} step="any" value={draft.leverage} onChange={event=>patch({leverage:Number(event.target.value)})}/>{!pair.futuresInfo?.maxLeverage&&<small>Максимум биржи: Нет данных. Плечо — для расчёта.</small>}</label><label>Режим маржи<select aria-label="Режим маржи" value={draft.margin} onChange={event=>patch({margin:event.target.value as OrderFormDraft["margin"]})}><option value="isolated">Изолированная</option><option value="cross">Кросс</option></select></label></div>}
      <details className="order-options"><summary>Дополнительные параметры</summary>{market&&<label>Защита цены, %<input required type="number" min="0.1" max="10" step="0.1" value={slippage} onChange={event=>setSlippage(event.target.value)}/></label>}<p className="account-hint">{stopped?"Стоп-цена активирует входную заявку. Это не защитный Stop Loss позиции.":"Предпочтения формы сохраняются отдельно от графика. Цена и объём относятся только к этой заявке."}</p></details>
      </section>
      <section className="order-analysis-column">
      <details className="order-risk" open={riskExpanded} onToggle={event=>setRiskExpanded(event.currentTarget.open)}><summary>Управление риском</summary><div className="order-form-grid"><label>Stop Loss, {pair.quoteAsset}<input aria-label={`Stop Loss, ${pair.quoteAsset}`} type="number" min="0" step="any" value={draft.stopLoss} onChange={event=>patch({stopLoss:event.target.value})}/></label><label>Take Profit, {pair.quoteAsset}<input aria-label={`Take Profit, ${pair.quoteAsset}`} type="number" min="0" step="any" value={draft.takeProfit} onChange={event=>patch({takeProfit:event.target.value})}/></label></div><p className="account-hint">SL и TP задаются ценой актива. Ниже — результат без funding, комиссий выхода и проскальзывания.</p><dl className="order-summary">{metric("Убыток по стопу ≈",amount(estimate.risk),{"data-order-risk":""})}{metric("Прибыль по тейку ≈",amount(estimate.reward),{"data-order-reward":""})}{metric("Риск / прибыль",estimate.ratio?`1 : ${price(estimate.ratio)}`:"—",{"data-order-ratio":""})}{futures&&metric("Цена ликвидации","Расчёт недоступен")}</dl></details>
      <dl className="order-summary order-final-summary" aria-label="Итог заявки">{metric("Инструмент",`${pair.baseAsset}/${pair.quoteAsset} · ${EXCHANGES[pair.exchange].name}`)}{metric("Направление",futures?draft.side==="buy"?"Long":"Short":draft.side==="buy"?"Купить":"Продать")}{metric("Тип",orderNames[draft.type])}{metric("Цена ≈",amount(estimate.entry))}{metric("Количество",draft.quantity?`${draft.quantity} ${pair.baseAsset}`:"—")}{futures&&metric("Контракты",estimate.contracts===undefined?"Нет данных":price(estimate.contracts))}{metric("Номинал ≈",amount(estimate.notional),{"data-order-notional":""})}{futures&&<>{metric("Плечо / маржа",`${draft.leverage}× · ${draft.margin==="isolated"?"изолированная":"кросс"}`)}{metric("Начальная маржа ≈",amount(estimate.initialMargin),{"data-order-margin":""})}</>}{metric("Комиссия входа ≈",estimate.entryFee===undefined?"Нет данных":`${amount(estimate.entryFee)} · DEMO 0,1%`)}{metric("Риск по стопу ≈",amount(estimate.risk))}{!stopped&&metric(taken>0?"Средняя цена ≈":"Лучшая цена",amount(bookPrice),{"data-order-book-price":""})}</dl>
      </section>
      </div>
      {hasRisk&&capability.available&&<p className="order-availability">Прикреплённые SL/TP не поддерживаются демо-API. Расчёты доступны; для размещения входной заявки очистите эти поля.</p>}
      {(error||problem)&&<p className="futures-parameters-error" role="alert">{error||problem}</p>}
      <div className="order-form-actions"><button type="button" className="button" disabled={busy} onClick={closeWindow}>Отмена</button><button type="submit" className="account-submit" disabled={busy||!orders.data||!capability.available||hasRisk||!!problem||!draft.quantity}>{busy?"Сохраняем…":"Разместить демо-заявку"}</button></div>
    </fieldset></form>
  </dialog>,document.body);
}
