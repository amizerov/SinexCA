import {z} from "zod";
import {EXCHANGE_IDS} from "../market/exchange-config";
import {symbolSchema} from "../market/schemas";
import {indicatorSettingsSchema,indicatorDocumentSchema,saveIndicatorsSchema,defaultIndicators,profileSettingsSchema,vwapSettingsSchema,type IndicatorSettings} from "./settings";
export const INDICATOR_KEYS=["ema0","ema1","ema2","sma","rsi","volume","vwap","profile"] as const;
export type IndicatorKey=typeof INDICATOR_KEYS[number]|`ema${number}`|"emaCount";
const average=indicatorSettingsSchema.shape.sma;
const emaKey=(key:string)=>/^ema(?:[0-9]|[1-9][0-9])$/.test(key);
const count=z.number().int().min(0).max(100);
export const indicatorOverridesSchema=z.object({ema0:average.optional(),ema1:average.optional(),ema2:average.optional(),sma:average.optional(),rsi:indicatorSettingsSchema.shape.rsi.optional(),volume:z.boolean().optional(),profile:profileSettingsSchema.optional(),vwap:vwapSettingsSchema.optional()}).catchall(z.union([average,count,indicatorSettingsSchema.shape.rsi,profileSettingsSchema,vwapSettingsSchema,z.boolean()])).superRefine((value,ctx)=>{
  for(const [key,item] of Object.entries(value))if(!INDICATOR_KEYS.includes(key as typeof INDICATOR_KEYS[number])){
    if(!(key==="emaCount"?count.safeParse(item).success:emaKey(key)&&average.safeParse(item).success))ctx.addIssue({code:"custom",message:"Invalid indicator override",path:[key]});
  }
});
export type IndicatorOverrides=z.infer<typeof indicatorOverridesSchema>;
export const indicatorScopeSchema=z.object({exchange:z.enum(EXCHANGE_IDS),marketType:z.enum(["spot","futures"]),symbol:symbolSchema}).strict();
export type IndicatorScope=z.infer<typeof indicatorScopeSchema>;
export const indicatorScopeKey=(scope:IndicatorScope)=>JSON.stringify([scope.exchange,scope.marketType,scope.symbol]);
const scopeKeySchema=z.string().max(160).refine(value=>{try{const [exchange,marketType,symbol]=JSON.parse(value);return indicatorScopeSchema.safeParse({exchange,marketType,symbol}).success&&value===indicatorScopeKey({exchange,marketType,symbol});}catch{return false;}},"Invalid indicator scope");
export const indicatorScopeMapSchema=z.record(scopeKeySchema,indicatorOverridesSchema).refine(value=>Object.keys(value).length<=2000,"Too many indicator scopes");
export type IndicatorScopeMap=z.infer<typeof indicatorScopeMapSchema>;
export const indicatorForAllSchema=z.object({ema0:z.boolean(),ema1:z.boolean(),ema2:z.boolean(),sma:z.boolean(),rsi:z.boolean(),volume:z.boolean(),profile:z.boolean().default(true),vwap:z.boolean().default(true)}).catchall(z.boolean()).refine(value=>Object.keys(value).every(key=>INDICATOR_KEYS.includes(key as typeof INDICATOR_KEYS[number])||emaKey(key)||key==="emaCount"),"Invalid indicator flag");
export type IndicatorForAll=z.infer<typeof indicatorForAllSchema>;
export const defaultForAll=():IndicatorForAll=>({ema0:true,ema1:true,ema2:true,sma:true,rsi:true,volume:true,profile:true,vwap:true});
export const scopedIndicatorDocumentSchema=indicatorDocumentSchema.extend({overrides:indicatorScopeMapSchema.default({})});
export const saveScopedIndicatorsSchema=saveIndicatorsSchema.extend({scope:indicatorScopeSchema.optional(),forAll:indicatorForAllSchema.optional()}).refine(value=>!!value.scope===!!value.forAll,{message:"Scope and indicator flags must be supplied together"});
function entries(settings:IndicatorSettings):Record<string,unknown>{return {...Object.fromEntries(settings.ema.map((line,i)=>[`ema${i}`,line])),emaCount:settings.ema.length,sma:settings.sma,rsi:settings.rsi,volume:settings.volume,profile:settings.profile,vwap:settings.vwap};}
function settingsFromEntries(value:Record<string,unknown>):IndicatorSettings{return indicatorSettingsSchema.parse({ema:Array.from({length:Number(value.emaCount)},(_,i)=>value[`ema${i}`]??{...defaultIndicators().ema[0],enabled:false}),sma:value.sma,rsi:value.rsi,volume:value.volume,profile:value.profile,vwap:value.vwap});}
export function resolveIndicators(settings:IndicatorSettings,overrides:IndicatorScopeMap,scope?:IndicatorScope){
  const local=scope?overrides[indicatorScopeKey(scope)]||{}:{},forAll=defaultForAll();
  for(const key of new Set([...INDICATOR_KEYS,"emaCount",...Object.keys(entries(settings)),...Object.keys(local)]))forAll[key]=!Object.hasOwn(local,key);
  return {settings:settingsFromEntries({...entries(settings),...local}),forAll};
}
export function applyIndicatorEdit(settings:IndicatorSettings,overrides:IndicatorScopeMap,scope:IndicatorScope,draft:IndicatorSettings,forAll:IndicatorForAll){
  const scopeKey=indicatorScopeKey(scope),local={...overrides[scopeKey]},global=entries(structuredClone(settings)),next=entries(draft),current=resolveIndicators(settings,overrides,scope),before=entries(current.settings);
  for(const key of new Set([...Object.keys(global),...Object.keys(next),...Object.keys(local)])){
    if(current.forAll[key]===forAll[key]&&JSON.stringify(before[key])===JSON.stringify(next[key]))continue;
    if(next[key]===undefined){delete global[key];delete local[key];continue;}
    if(forAll[key]!==false){Object.assign(global,{[key]:next[key]});delete local[key];}
    else Object.assign(local,{[key]:next[key]});
  }
  const scopes={...overrides};
  if(Object.keys(local).length)scopes[scopeKey]=local;else delete scopes[scopeKey];
  return {settings:settingsFromEntries(global),overrides:scopes};
}
export const defaultScopedIndicators=()=>({settings:defaultIndicators(),overrides:{} as IndicatorScopeMap});
