import {z} from "zod";
export const orderBookSettingsSchema=z.object({
  mode:z.enum(["docked","floating"]),width:z.number().int().min(230).max(560),
  side:z.enum(["both","buy","sell"]),bars:z.enum(["level","cumulative"]),
  levels:z.union([z.literal(5),z.literal(10),z.literal(20)]),
  priceSteps:z.record(z.string().min(1).max(150),z.number().finite().min(0).max(1e12)).default({}),
  // Older workspaces used a single step for every market. Keep it as a fallback until overridden.
  priceStep:z.number().finite().min(0).max(1e12).optional(),
}).strict().transform(({priceStep,...settings})=>({...settings,priceSteps:{...priceStep?{"legacy:default":priceStep}:{},...settings.priceSteps} as Record<string,number>}));
export type OrderBookSettings=z.infer<typeof orderBookSettingsSchema>;
export const DEFAULT_ORDER_BOOK:OrderBookSettings={mode:"docked",width:280,side:"both",bars:"level",levels:20,priceSteps:{}};
export const LEGACY_ORDER_BOOK:OrderBookSettings={...DEFAULT_ORDER_BOOK,mode:"floating"};
