import "server-only";
import { resolve } from "node:path";
import { DrawingStore } from "./drawing-store";
const globalStore = globalThis as typeof globalThis & { sinexDrawingStore?: DrawingStore };
export function getDrawingStore() {
  // Runtime user data must not be traced into the build or copied into a deployment bundle.
  return globalStore.sinexDrawingStore ??= new DrawingStore(resolve(/*turbopackIgnore: true*/ process.env.SINEX_DB_PATH || "data/sinex.sqlite"));
}
