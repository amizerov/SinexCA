import {z} from "zod";
import {EXCHANGE_IDS} from "@/lib/market/exchange-config";
import type {TradingPair} from "@/lib/market/types";
import {favoriteKey} from "./market-panel-settings";

export const recentPairSchema=z.object({exchange:z.enum(EXCHANGE_IDS),marketType:z.literal("spot"),symbol:z.string().min(1).max(80),baseAsset:z.string().min(1).max(80),quoteAsset:z.string().min(1).max(30)}).strict();
export const recentPairsSchema=z.array(recentPairSchema).max(30).transform(pairs=>pairs.filter((pair,index)=>pairs.findIndex(other=>favoriteKey(other)===favoriteKey(pair))===index));
export function recordRecentPair(history:TradingPair[],pair:TradingPair):TradingPair[]{
  return [recentPairSchema.parse(pair),...history.filter(other=>favoriteKey(other)!==favoriteKey(pair))].slice(0,30);
}
