import {plainCoinText,safeCoinUrl} from "./coin-info";
import {sameProjectName} from "./coin-catalog";
/** Extract only the verified asset's About section, never price SEO or investment FAQs. */
export function parseOKXCoinPage(html:string,name:string,asset:string){
  const products=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match=>{try{const value=JSON.parse(match[1]);return Array.isArray(value)?value:[value];}catch{return [];}});
  const verified=products.some(product=>product?.["@type"]==="Product"&&typeof product.name==="string"&&sameProjectName(product.name,name)&&Array.isArray(product.additionalProperty)&&product.additionalProperty.some((property:{unitCode?:string})=>property.unitCode?.toUpperCase()===asset));
  if(!verified)return;
  const marker=html.indexOf(`About ${name}`);if(marker<0)return;
  const after=html.slice(marker),start=after.search(/<div\b[^>]*class="[^"]*ReadMore_content[^\"]*"[^>]*>/i);if(start<0)return;
  const section=after.slice(start);let depth=0,end=0;
  for(const match of section.matchAll(/<\/?div\b[^>]*>/gi)){depth+=match[0].startsWith("</")?-1:1;if(depth===0){end=match.index!+match[0].length;break;}}
  if(!end)return;
  const text=plainCoinText(section.slice(0,end));if(!text)return;
  const links:{label:string;url:string}[]=[];
  for(const match of after.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*data-resource="([^"]+)"[^>]*>/gi)){
    const url=safeCoinUrl(match[1]),label:Record<string,string>={official_website:"Сайт проекта",whitepaper:"Whitepaper",github:"GitHub",explorer:"Обозреватель"};
    if(url&&label[match[2]])links.push({label:label[match[2]],url});
  }
  return {text,links};
}
