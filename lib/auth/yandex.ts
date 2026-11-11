import {z} from "zod";
export class YandexAuthError extends Error {
  constructor(public code:string){super(code);}
}
async function providerError(response:Response){
  const payload=await response.json().catch(()=>null);
  return typeof payload?.error==="string"&&["invalid_client","invalid_grant","unauthorized_client","invalid_request","invalid_scope","access_denied"].includes(payload.error)?payload.error:"unknown";
}

export function yandexAvailable(){return !!(process.env.YANDEX_CLIENT_ID?.trim()&&process.env.YANDEX_CLIENT_SECRET?.trim());}
export function yandexConfig(request:Request){
  if(!yandexAvailable())throw new Error("Yandex OAuth is not configured");
  const url=new URL(process.env.SINEX_APP_URL||request.url),local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if(url.protocol!=="https:"&&!(url.protocol==="http:"&&local))throw new Error("Yandex OAuth requires HTTPS or localhost");
  if(!process.env.SINEX_APP_URL&&!local)throw new Error("Set SINEX_APP_URL for a public deployment");
  return {clientId:process.env.YANDEX_CLIENT_ID!.trim(),clientSecret:process.env.YANDEX_CLIENT_SECRET!.trim(),origin:url.origin,redirectUri:`${url.origin}/api/auth/yandex/callback`};
}
export function readYandexIdentity(payload:unknown,clientId:string){
  if(!payload||typeof payload!=="object")throw new YandexAuthError("YANDEX_PROFILE_INVALID");
  const raw=payload as Record<string,unknown>;
  if(raw.client_id!==clientId)throw new YandexAuthError("YANDEX_CLIENT_MISMATCH");
  if(!raw.default_email)throw new YandexAuthError("YANDEX_EMAIL_REQUIRED");
  const info=z.object({id:z.string().min(1).max(255),client_id:z.literal(clientId),default_email:z.email().max(254),real_name:z.string().optional(),display_name:z.string().optional(),default_avatar_id:z.string().optional(),is_avatar_empty:z.boolean().optional()}).parse(payload);
  const name=(info.real_name||info.display_name||"").trim();
  const avatar=info.is_avatar_empty===false&&info.default_avatar_id&&/^[a-zA-Z0-9/_-]{1,200}$/.test(info.default_avatar_id)?info.default_avatar_id:null;
  return {sub:info.id,email:info.default_email.toLowerCase(),displayName:name?name.slice(0,200):null,avatarUrl:avatar?`https://avatars.yandex.net/get-yapic/${avatar}/islands-200`:null};
}
export async function exchangeYandexCode(config:ReturnType<typeof yandexConfig>,code:string,verifier:string,request:typeof fetch=fetch){
  const result=await request("https://oauth.yandex.ru/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,client_id:config.clientId,client_secret:config.clientSecret,code_verifier:verifier}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!result.ok){const reason=await providerError(result);throw new YandexAuthError(reason==="invalid_client"?"YANDEX_CLIENT_INVALID":reason==="invalid_grant"?"YANDEX_CODE_EXPIRED":"YANDEX_TOKEN_FAILED");}
  const tokens=z.object({access_token:z.string().min(1).max(8192),token_type:z.string().transform(value=>value.toLowerCase()).pipe(z.literal("bearer"))}).parse(await result.json());
  const response=await request("https://login.yandex.ru/info?format=json",{headers:{Authorization:`OAuth ${tokens.access_token}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new YandexAuthError("YANDEX_PROFILE_FAILED");
  return readYandexIdentity(await response.json(),config.clientId);
}
