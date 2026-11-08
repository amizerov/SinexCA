import { z } from "zod";
const period=z.number().int().min(2).max(200),color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const average=z.object({enabled:z.boolean(),period,color});
export const indicatorSettingsSchema=z.object({ema:z.tuple([average,average,average]),sma:average,rsi:z.object({enabled:z.boolean(),period,color,lower:z.number().int().min(0).max(49),upper:z.number().int().min(51).max(100)}),volume:z.boolean()});
export type IndicatorSettings=z.infer<typeof indicatorSettingsSchema>;
export const defaultIndicators=():IndicatorSettings=>({ema:[{enabled:false,period:20,color:"#f6c76e"},{enabled:false,period:50,color:"#63c8ff"},{enabled:false,period:200,color:"#b39aff"}],sma:{enabled:false,period:20,color:"#f28c9b"},rsi:{enabled:false,period:14,color:"#b39aff",lower:30,upper:70},volume:true});
export const indicatorDocumentSchema=z.object({revision:z.number().int().nonnegative(),settings:indicatorSettingsSchema});
export const saveIndicatorsSchema=indicatorDocumentSchema.extend({mutationId:z.uuid()});
export const hasIndicators=(settings:IndicatorSettings)=>settings.ema.some(line=>line.enabled)||settings.sma.enabled||settings.rsi.enabled;
