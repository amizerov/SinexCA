import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeCoinInfo,safeCoinUrl} from "../lib/market/coin-info";
test("coin details validate identity, preserve missing metrics and render descriptions as plain text",()=>{
  const coin=normalizeCoinInfo({id:"bitcoin",symbol:"btc",name:"Bitcoin",description:{en:'<script>alert(1)</script><b>Bitcoin</b> &amp; network'},links:{homepage:["javascript:alert(1)","https://bitcoin.org"],whitepaper:"https://bitcoin.org/bitcoin.pdf"},market_data:{current_price:{usd:0},ath_date:{usd:"invalid"}}},"BTC");
  assert.equal(coin.description,"Bitcoin & network");assert.equal(coin.market?.current_price,0);assert.equal(coin.market?.market_cap,null);assert.equal(coin.market?.ath_date,null);
  assert.equal(coin.links.length,2);assert.equal(safeCoinUrl("data:text/html,test"),null);assert.equal(safeCoinUrl("https://user:pass@example.com"),null);
  assert.throws(()=>normalizeCoinInfo({id:"other-bitcoin",symbol:"btc",name:"Imposter"},"BTC"));
});
