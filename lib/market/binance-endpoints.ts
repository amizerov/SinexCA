import {MarketError} from "./errors";

const primary="https://data-api.binance.vision",secondary="https://api.binance.com";
/** Only public GETs can fail over. Exchange restrictions and rate limits remain authoritative. */
export class BinanceEndpoints {
  private preferSecondaryUntil=0;
  async request(url:URL,load:(url:URL)=>Promise<unknown>):Promise<unknown>{
    if(url.origin!==primary||!url.pathname.startsWith("/api/v3/"))return load(url);
    const alternate=new URL(url.pathname+url.search,secondary);
    if(Date.now()<this.preferSecondaryUntil)return load(alternate);
    try{return await load(url);}catch(error){
      if(!(error instanceof MarketError)||error.code!=="NETWORK_ERROR")throw error;
      // Remember the failed transport so concurrent chart refreshes do not keep timing out.
      this.preferSecondaryUntil=Date.now()+5*60*1000;
      return load(alternate);
    }
  }
}
