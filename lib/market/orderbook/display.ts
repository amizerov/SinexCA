import type {BookLevel} from "./model";
export interface DisplayBookLevel extends BookLevel {notional:number;cumulativeQuantity:number;cumulativeNotional:number}
const decimals=(value:number)=>{const [mantissa,exponent="0"]=String(value).toLowerCase().split("e");return Math.max(0,(mantissa.split(".")[1]?.length||0)-Number(exponent));};
/** Group for display only. Execution estimates must always use the original book. */
export function displayBookLevels(side:BookLevel[],sell:boolean,step=0,limit=20):DisplayBookLevel[]{
  const precision=Math.min(16,Math.max(decimals(step),...side.map(row=>decimals(row.price))));
  const zero=BigInt(0),one=BigInt(1);
  const integer=(value:number)=>value>=1e21?BigInt(value)*BigInt(10)**BigInt(precision):BigInt(value.toFixed(precision).replace(".",""));
  const units=step>0?integer(step):zero,scale=10**precision,groups=new Map<number,{price:number;quantity:number;notional:number}>();
  for(const row of side){
    const priceUnits=units>zero?integer(row.price):zero;
    const price=units>zero?Number((sell?(priceUnits+units-one)/units:priceUnits/units)*units)/scale:row.price;
    const old=groups.get(price)||{price,quantity:0,notional:0};old.quantity+=row.quantity;old.notional+=row.price*row.quantity;groups.set(price,old);
  }
  let quantity=0,notional=0;
  return [...groups.values()].sort((a,b)=>sell?a.price-b.price:b.price-a.price).slice(0,limit).map(row=>({...row,cumulativeQuantity:quantity+=row.quantity,cumulativeNotional:notional+=row.notional}));
}
const amountFormatter=new Intl.NumberFormat("ru-RU",{maximumSignificantDigits:12});
export const bookAmount=(value:number)=>amountFormatter.format(value);
const cashQuotes=new Set(["USD","USDT","USDC","DAI","FDUSD","USDS","EUR","EURC","GBP","CHF","AUD","CAD","JPY","BRL","TRY","UAH"]);
const cashFormatter=new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2});
export const bookNotional=(value:number,quote:string)=>cashQuotes.has(quote)&&value>=.01?cashFormatter.format(value):bookAmount(value);
