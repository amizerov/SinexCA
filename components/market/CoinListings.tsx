"use client";
import {ExternalLink,RefreshCw} from "lucide-react";
import {useMarketResource} from "@/hooks/use-market-resource";
import {EXCHANGES,EXCHANGE_IDS,tradingUrl} from "@/lib/market/exchange-config";
import type {TradingPair} from "@/lib/market/types";
import type {CoinListing,CoinListings as ListingResult} from "@/lib/market/coin-listings";
export function CoinListings({pair}:{pair:TradingPair}){
  const resource=useMarketResource<ListingResult>(`/api/market/listings?asset=${encodeURIComponent(pair.baseAsset)}`);
  const selected:CoinListing={exchange:pair.exchange,pair,url:tradingUrl(pair.exchange,pair)};
  const listings=EXCHANGE_IDS.flatMap(exchange=>{const listing=exchange===pair.exchange?selected:resource.data?.listings?.find(listing=>listing.exchange===exchange);return listing?[listing]:[];});
  const unavailable=resource.data?.unavailable||[];
  return <div className="coin-listings" aria-label="Биржи, на которых котируется монета">
    <div className="coin-listings-label"><span>На подключённых биржах</span>{resource.loading&&!resource.data?<span role="status">Проверяем…</span>:resource.error||unavailable.length>0?<button title={resource.error||`Не удалось проверить: ${unavailable.map(exchange=>EXCHANGES[exchange].name).join(", ")}`} onClick={resource.refresh} aria-label="Повторить проверку бирж"><RefreshCw size={10}/> Проверены не все</button>:null}</div>
    <div className="coin-listings-links">{listings.map(listing=><a key={listing.exchange} href={listing.url} target="_blank" rel="noopener noreferrer" className={listing.exchange===pair.exchange?"current":""} title={`${EXCHANGES[listing.exchange].name} · ${listing.pair.baseAsset}/${listing.pair.quoteAsset}`} aria-label={`${EXCHANGES[listing.exchange].name}: ${listing.pair.baseAsset}/${listing.pair.quoteAsset}`}>{EXCHANGES[listing.exchange].name}<ExternalLink size={10}/></a>)}</div>
  </div>;
}
