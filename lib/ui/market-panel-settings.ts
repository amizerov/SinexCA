import {z} from "zod";
import type {TradingPair} from "@/lib/market/types";
export const marketPanelSettingsSchema=z.object({mode:z.enum(["left","right","floating"]),width:z.number().int().min(280).max(480),favoritesOnly:z.boolean(),favorites:z.array(z.string().min(1).max(150)).max(3000)}).strict();
export type MarketPanelSettings=z.infer<typeof marketPanelSettingsSchema>;
export const DEFAULT_MARKET_PANEL:MarketPanelSettings={mode:"right",width:320,favoritesOnly:false,favorites:[]};
export const favoriteKey=(pair:TradingPair)=>`${pair.exchange}:${pair.marketType}:${pair.symbol}`;
