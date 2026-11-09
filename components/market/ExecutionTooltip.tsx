import type {ChartExecution} from "@/lib/paper/chart-trades";
import {paperAmount,paperDecimals} from "@/lib/paper/account";
const number=(value:number)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:12}).format(value);
export function ExecutionTooltip({trade,x,y,width,height}:{trade:ChartExecution;x:number;y:number;width:number;height:number}){
  return <div className="chart-execution-tooltip" role="tooltip" style={{left:Math.max(8,Math.min(x+16,width-254)),top:Math.max(8,Math.min(y+16,height-172))}}>
    <strong className={trade.side==="buy"?"positive":"negative"}>{trade.side==="buy"?"Покупка":"Продажа"} · {number(trade.quantity)} {trade.base}</strong>
    <span>{new Date(trade.firstAt).toLocaleString("ru-RU")}{trade.lastAt!==trade.firstAt?` — ${new Date(trade.lastAt).toLocaleTimeString("ru-RU")}`:""}</span>
    <dl><dt>{trade.count>1?"Средняя цена":"Цена"}</dt><dd>{number(trade.price)} {trade.quote}</dd><dt>Сумма</dt><dd>{paperAmount(trade.quoteUnits,paperDecimals(trade.quote))} {trade.quote}</dd><dt>Комиссия</dt><dd>{paperAmount(trade.feeUnits,paperDecimals(trade.quote))} {trade.quote}</dd></dl>
    {trade.count>1&&<span>{trade.count} частичных исполнений</span>}
  </div>;
}
