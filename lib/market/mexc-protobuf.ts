import { normalizeCandles } from "./normalize";
import type { Timeframe } from "./types";
import { EXCHANGE_INTERVALS } from "./intervals";
export const MEXC_STREAM_INTERVALS=Object.fromEntries(Object.entries(EXCHANGE_INTERVALS.mexc).map(([tf,spec])=>[tf,spec.ws])) as Partial<Record<Timeframe,string>>;
/** Small bounded reader for the public MEXC kline schema, not for private account messages.
 * Schema: https://github.com/mexcdevelop/websocket-proto (Wrapper field 308).
 */
export function protobufFields(data: Uint8Array,onField?:(field:number,value:number|Uint8Array)=>void) {
  if (data.length > 262144) throw new Error("Oversized protobuf message");
  let position = 0;
  const fields = new Map<number, number | Uint8Array>();
  const set=(field:number,value:number|Uint8Array)=>{fields.set(field,value);onField?.(field,value);};
  const integer = () => {
    let result = 0, factor = 1;
    for (let count = 0; count < 10; count++) {
      if (position >= data.length) throw new Error("Truncated protobuf integer");
      const byte = data[position++]; result += (byte & 127) * factor;
      if (!(byte & 128)) { if (!Number.isSafeInteger(result)) throw new Error("Unsafe protobuf integer"); return result; }
      factor *= 128;
    }
    throw new Error("Invalid protobuf integer");
  };
  while (position < data.length) {
    const tag = integer(), field = Math.floor(tag / 8), wire = tag % 8;
    if (!field) throw new Error("Invalid protobuf field");
    if (wire === 0) set(field, integer());
    else if (wire === 2) {
      const size = integer();
      if (size > data.length - position) throw new Error("Truncated protobuf field");
      set(field, data.subarray(position, position + size)); position += size;
    } else if (wire === 1 || wire === 5) {
      position += wire === 1 ? 8 : 4;
      if (position > data.length) throw new Error("Truncated protobuf value");
    } else throw new Error("Unsupported protobuf wire type");
  }
  return fields;
}
const text = (value: number | Uint8Array | undefined) => value instanceof Uint8Array ? new TextDecoder().decode(value) : "";
export function decodeMexcKline(data: Uint8Array, symbol: string, timeframe: Timeframe) {
  const wrapper = protobufFields(data), payload = wrapper.get(308);
  const interval = MEXC_STREAM_INTERVALS[timeframe];
  if (text(wrapper.get(3)) !== symbol || text(wrapper.get(1)) !== `spot@public.kline.v3.api.pb@${symbol}@${interval}` || !(payload instanceof Uint8Array)) return undefined;
  const kline = protobufFields(payload);
  if (text(kline.get(1)) !== interval) return undefined;
  return normalizeCandles([[Number(kline.get(2)) * 1000, text(kline.get(3)), text(kline.get(5)), text(kline.get(6)), text(kline.get(4)), text(kline.get(7))]])[0];
}
