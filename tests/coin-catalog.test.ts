import {test} from "node:test";
import assert from "node:assert/strict";
import {parseCoinCatalog,findCoinCandidates,matchCoinMarket,sameProjectName} from "../lib/market/coin-catalog";
import {normalizeCoinInfo} from "../lib/market/coin-info";
import {normalizePaprikaInfo,mergeCoinProfiles} from "../lib/market/coin-profile";
import {parseOKXCoinPage} from "../lib/market/coin-exchange-profile";
import {verifiedCoinHistory} from "../lib/market/verified-coin-history";
test("complete catalogs resolve unknown tickers and disambiguate by exact exchange market",()=>{
  const catalog=parseCoinCatalog([{id:"hyperliquid",symbol:"hype",name:"Hyperliquid"},{id:"other-hype",symbol:"hype",name:"Another Hype"}],"coingecko"),candidates=findCoinCandidates(catalog,"HYPE");
  assert.equal(candidates.length,2);
  assert.equal(matchCoinMarket(candidates,{tickers:[{base:"HYPE",target:"USDT",coin_id:"hyperliquid"}]},"HYPE","USDT")?.id,"hyperliquid");
  assert.equal(matchCoinMarket(candidates,{tickers:[{base:"HYPE",target:"USD",coin_id:"hyperliquid"}]},"HYPE","USDT"),undefined);
  assert.equal(matchCoinMarket(candidates,{tickers:candidates.map(coin=>({base:"HYPE",target:"USDT",coin_id:coin.id}))},"HYPE","USDT"),undefined);
  assert.equal(parseCoinCatalog([{id:"dead",symbol:"X",name:"X",is_active:false}],"coinpaprika").length,0);
});
test("dynamic details validate requested project ID and preserve attributed history and creator information",()=>{
  const primary=normalizeCoinInfo({id:"hyperliquid",symbol:"hype",name:"Hyperliquid",description:{en:"A decentralized exchange."}},"HYPE","hyperliquid");
  assert.throws(()=>normalizeCoinInfo({id:"another-hype",symbol:"hype",name:"Other"},"HYPE","hyperliquid"));
  const candidate={id:"hype-hyperliquid",symbol:"HYPE",name:"Hyperliquid",provider:"coinpaprika" as const};
  const secondary=normalizePaprikaInfo({id:candidate.id,symbol:"HYPE",name:"Hyperliquid",description:"Project history.",started_at:"2024-11-29T00:00:00Z",team:[{name:"Creator",position:"Co-founder"},{name:"Advisor",position:"Advisor"}],links:{website:["https://example.com/"]}},candidate);
  const merged=mergeCoinProfiles(primary,secondary);
  assert.equal(merged.description,primary.description);assert.equal(merged.history,"Project history.");assert.equal(merged.creators?.length,1);assert.equal(merged.genesisDate,"2024-11-29T00:00:00Z");assert.equal(merged.historySource?.name,"CoinPaprika");
  assert.equal(sameProjectName("Hyperliquid","Hyper-liquid"),true);assert.equal(sameProjectName("Hyperliquid","Hyperliquid Inu"),false);
  assert.equal(verifiedCoinHistory(primary).creators?.[1].name,"iliensinc");
  assert.equal(verifiedCoinHistory({...primary,id:"other-hype"}).creators,undefined);
});
test("exchange description is extracted only after checking both project name and coin symbol",()=>{
  const html='<script type="application/ld+json">{"@type":"Product","name":"Hyperliquid","additionalProperty":[{"unitCode":"HYPE"}]}</script><h2>About Hyperliquid</h2><div class="ReadMore_content__x"><div>Project purpose.<p>History.</p></div></div><h2>Prices</h2><p>Not part of description.</p>';
  assert.equal(parseOKXCoinPage(html,"Hyperliquid","HYPE")?.text,"Project purpose.History.");
  assert.equal(parseOKXCoinPage(html,"Hyperliquid","OTHER"),undefined);
  assert.equal(parseOKXCoinPage(html,"Other project","HYPE"),undefined);
});
