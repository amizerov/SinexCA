export interface BookRequest {url:URL;decode:(input:unknown)=>{bids:unknown;asks:unknown;time?:unknown}}
export type BookRestAdapter=(symbol:string)=>BookRequest;
export function bookUrl(origin:string,path:string,params:Record<string,string>={}){const url=new URL(path,origin);url.search=new URLSearchParams(params).toString();return url;}
