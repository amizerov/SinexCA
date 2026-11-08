import { z } from "zod";
import { EXCHANGE_IDS } from "@/lib/market/exchange-config";
import { symbolSchema } from "@/lib/market/schemas";

export const drawingScopeSchema = z.object({ exchange: z.enum(EXCHANGE_IDS), marketType: z.literal("spot").default("spot"), symbol: symbolSchema });
export const levelSchema = z.object({
  id:z.uuid(),price:z.number().finite().positive().max(1e12),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  type:z.enum(["horizontal","trend"]).optional(),startTime:z.number().int().nonnegative().max(32503680000).optional(),endTime:z.number().int().nonnegative().max(32503680000).optional(),endPrice:z.number().finite().positive().max(1e12).optional(),
  width:z.number().int().min(1).max(4).optional(),style:z.enum(["solid","dashed","dotted"]).optional(),
}).superRefine((line,context)=>{
  if(line.type==="trend"&&(line.startTime===undefined||line.endTime===undefined||line.endPrice===undefined||line.startTime===line.endTime))context.addIssue({code:"custom",message:"Трендовая линия должна иметь две точки с разным временем."});
  if(line.type!=="trend"&&(line.startTime!==undefined||line.endTime!==undefined||line.endPrice!==undefined))context.addIssue({code:"custom",message:"Координаты двух точек допустимы только для трендовой линии."});
});
export const levelsSchema = z.array(levelSchema).max(100).refine(levels => new Set(levels.map(l => l.id)).size === levels.length, "Повторяющиеся идентификаторы уровней");
export const saveDrawingSchema = z.object({ scope: drawingScopeSchema, revision: z.number().int().nonnegative(), mutationId: z.uuid(), levels: levelsSchema });
export const documentSchema = z.object({ revision: z.number().int().nonnegative(), levels: levelsSchema });
export type DrawingScope = z.infer<typeof drawingScopeSchema>;
export type HorizontalLevel = z.infer<typeof levelSchema>;
export type DrawingDocument = z.infer<typeof documentSchema>;
export function scopeKey(scope: DrawingScope) { return `${scope.exchange}:${scope.marketType}:${scope.symbol}`; }
