import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
const keys=createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export function googleAvailable() {return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);}
export function googleConfig(request:Request) {
  if(!googleAvailable()) throw new Error("Google OAuth is not configured");
  const origin=new URL(process.env.SINEX_APP_URL || request.url);
  if(origin.protocol!=="https:" && !(origin.protocol==="http:" && ["localhost","127.0.0.1","[::1]"].includes(origin.hostname))) throw new Error("Google OAuth requires HTTPS or localhost");
  if(!process.env.SINEX_APP_URL && !["localhost","127.0.0.1","[::1]"].includes(origin.hostname)) throw new Error("Set SINEX_APP_URL for a public deployment");
  return {clientId:process.env.GOOGLE_CLIENT_ID!,clientSecret:process.env.GOOGLE_CLIENT_SECRET!,origin:origin.origin,redirectUri:`${origin.origin}/api/auth/google/callback`};
}
export async function verifyGoogleIdentity(token:string,clientId:string,nonce:string,getKey:JWTVerifyGetKey=keys) {
  const {payload}=await jwtVerify(token,getKey,{algorithms:["RS256"],issuer:["https://accounts.google.com","accounts.google.com"],audience:clientId,requiredClaims:["sub","exp","iat","email","nonce"]});
  if(payload.nonce!==nonce || payload.email_verified!==true || (payload.azp!==undefined && payload.azp!==clientId)) throw new Error("Invalid Google identity");
  return {sub:z.string().min(1).max(255).parse(payload.sub),email:z.email().max(254).parse(payload.email).toLowerCase(),...readGoogleProfile(payload)};
}
function readGoogleProfile(payload:Record<string,unknown>) {
  const name=typeof payload.name==="string"?payload.name.trim():"";
  let avatarUrl:string|null=null;
  if(typeof payload.picture==="string"&&payload.picture.length<=2048) {
    try {const url=new URL(payload.picture);if(url.protocol==="https:"&&!url.username&&!url.password&&(url.hostname==="googleusercontent.com"||url.hostname.endsWith(".googleusercontent.com")))avatarUrl=url.href;}catch{/* An absent or invalid photo does not prevent sign-in. */}
  }
  return {displayName:name&&name.length<=200?name:null,avatarUrl};
}
/** UserInfo supplements optional ID-token claims; it can never change the verified identity. */
export async function completeGoogleProfile(identity:Awaited<ReturnType<typeof verifyGoogleIdentity>>,accessToken:unknown,request:typeof fetch=fetch) {
  if((identity.displayName&&identity.avatarUrl)||typeof accessToken!=="string"||!accessToken)return identity;
  try {
    const response=await request("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!response.ok)return identity;
    const payload=await response.json();
    if(!payload||typeof payload!=="object"||payload.sub!==identity.sub)throw new Error("Google UserInfo identity mismatch");
    const profile=readGoogleProfile(payload);
    return {...identity,displayName:identity.displayName||profile.displayName,avatarUrl:identity.avatarUrl||profile.avatarUrl};
  }catch(error){
    if(error instanceof Error&&error.message==="Google UserInfo identity mismatch")throw error;
    // A temporary profile outage must not prevent authentication or erase the saved profile.
    return identity;
  }
}
