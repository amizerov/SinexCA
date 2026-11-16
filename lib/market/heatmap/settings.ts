import {z} from "zod";

export const heatmapSettingsSchema=z.object({
  source:z.enum(["zones","orderbook"]).default("zones"),
  enabled:z.boolean().default(false),
  opacity:z.number().min(10).max(80).default(45),
  persistence:z.union([z.literal(0),z.literal(5),z.literal(30)]).default(0),
  palette:z.enum(["classic","green"]).default("classic"),
}).strict();
export type HeatmapSettings=z.infer<typeof heatmapSettingsSchema>;
export const defaultHeatmap=():HeatmapSettings=>({source:"zones",enabled:false,opacity:45,persistence:0,palette:"classic"});
