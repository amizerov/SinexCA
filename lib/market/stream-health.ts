import type { ExchangeId } from "./types";
export const streamFreshnessMs=(exchange:ExchangeId)=>exchange==="bybit"?75000:exchange==="kraken"?120000:45000;
/** Transport heartbeat and subscription acknowledgements never count as market data. */
export class StreamHealth {
  connected=false;subscribed=false;lastTransportAt=0;lastMarketAt=0;
  constructor(readonly exchange:ExchangeId){}
  open(now:number){this.connected=true;this.subscribed=false;this.lastTransportAt=now;this.lastMarketAt=0;}
  transport(now:number){this.lastTransportAt=now;}
  acknowledge(){this.subscribed=true;}
  market(now:number){this.connected=true;this.subscribed=true;this.lastMarketAt=now;}
  close(){this.connected=false;this.subscribed=false;this.lastMarketAt=0;}
  fresh(now:number){return this.connected&&this.subscribed&&this.lastMarketAt>0&&now-this.lastMarketAt<=streamFreshnessMs(this.exchange);}
}
