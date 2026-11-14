import {z} from "zod";
import {EXCHANGE_IDS} from "../market/exchange-config";
import {symbolSchema} from "../market/schemas";
import {indicatorSettingsSchema,indicatorDocumentSchema,saveIndicatorsSchema,defaultIndicators,vwapSettingsSchema,type IndicatorSettings} from "./settings";
export const INDICATOR_KEYS=["ema0","ema1","ema2","sma","rsi","volume","vwap"] as const;
export type IndicatorKey=typeof INDICATOR_KEYS[number];
const average=indicatorSettingsSchema.shape.sma;
export const indicatorOverridesSchema=z.object({ema0:average.optional(),ema1:average.optional(),ema2:average.optional(),sma:average.optional(),rsi:indicatorSettingsSchema.shape.rsi.optional(),volume:z.boolean().optional(),vwap:vwapSettingsSchema.optional()}).strict();
export type IndicatorOverrides=z.infer<typeof indicatorOverridesSchema>;
export const indicatorScopeSchema=z.object({exchange:z.enum(EXCHANGE_IDS),marketType:z.literal("spot"),symbol:symbolSchema}).strict();
export type IndicatorScope=z.infer<typeof indicatorScopeSchema>;
export const indicatorScopeKey=(scope:IndicatorScope)=>JSON.stringify([scope.exchange,scope.marketType,scope.symbol]);
const scopeKeySchema=z.string().max(160).refine(value=>{try{const [exchange,marketType,symbol]=JSON.parse(value);return indicatorScopeSchema.safeParse({exchange,marketType,symbol}).success&&value===indicatorScopeKey({exchange,marketType,symbol});}catch{return false;}},"Invalid indicator scope");
export const indicatorScopeMapSchema=z.record(scopeKeySchema,indicatorOverridesSchema).refine(value=>Object.keys(value).length<=2000,"Too many indicator scopes");
export type IndicatorScopeMap=z.infer<typeof indicatorScopeMapSchema>;
export const indicatorForAllSchema=z.object({ema0:z.boolean(),ema1:z.boolean(),ema2:z.boolean(),sma:z.boolean(),rsi:z.boolean(),volume:z.boolean(),vwap:z.boolean().default(true)}).strict();
export type IndicatorForAll=z.infer<typeof indicatorForAllSchema>;
export const defaultForAll=():IndicatorForAll=>({ema0:true,ema1:true,ema2:true,sma:true,rsi:true,volume:true,vwap:true});
export const scopedIndicatorDocumentSchema=indicatorDocumentSchema.extend({overrides:indicatorScopeMapSchema.default({})});
export const saveScopedIndicatorsSchema=saveIndicatorsSchema.extend({scope:indicatorScopeSchema.optional(),forAll:indicatorForAllSchema.optional()}).refine(value=>!!value.scope===!!value.forAll,{message:"Scope and indicator flags must be supplied together"});
function entries(settings:IndicatorSettings):Required<IndicatorOverrides>{return {ema0:settings.ema[0],ema1:settings.ema[1],ema2:settings.ema[2],sma:settings.sma,rsi:settings.rsi,volume:settings.volume,vwap:settings.vwap};}
function settingsFromEntries(value:Required<IndicatorOverrides>):IndicatorSettings{return {ema:[value.ema0,value.ema1,value.ema2],sma:value.sma,rsi:value.rsi,volume:value.volume,vwap:value.vwap};}
export function resolveIndicators(settings:IndicatorSettings,overrides:IndicatorScopeMap,scope?:IndicatorScope){
  const local=scope?overrides[indicatorScopeKey(scope)]||{}:{},forAll=defaultForAll();
  for(const key of INDICATOR_KEYS)forAll[key]=!Object.hasOwn(local,key);
  return {settings:settingsFromEntries({...entries(settings),...local}),forAll};
}
export function applyIndicatorEdit(settings:IndicatorSettings,overrides:IndicatorScopeMap,scope:IndicatorScope,draft:IndicatorSettings,forAll:IndicatorForAll){
  const scopeKey=indicatorScopeKey(scope),local={...overrides[scopeKey]},global=entries(structuredClone(settings)),next=entries(draft),current=resolveIndicators(settings,overrides,scope),before=entries(current.settings);
  for(const key of INDICATOR_KEYS){
    if(current.forAll[key]===forAll[key]&&JSON.stringify(before[key])===JSON.stringify(next[key]))continue;
    if(forAll[key]){Object.assign(global,{[key]:next[key]});delete local[key];}
    else Object.assign(local,{[key]:next[key]});
  }
  const scopes={...overrides};
  if(Object.keys(local).length)scopes[scopeKey]=local;else delete scopes[scopeKey];
  return {settings:settingsFromEntries(global),overrides:scopes};
}
export const defaultScopedIndicators=()=>({settings:defaultIndicators(),overrides:{} as IndicatorScopeMap});
