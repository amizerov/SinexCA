"use client";
import {DEFAULT_GUEST_WORKSPACE,DEFAULT_WORKSPACE,normalizeWorkspace,workspaceSettingsSchema,workspacePatchSchema,type WorkspaceSettings,type WorkspacePatch} from "./workspace-settings";
export interface WorkspaceIdentity {ownerId:string;userId:string|null}
export interface WorkspaceSnapshot {settings:WorkspaceSettings;ready:boolean;error:string}
export const EMPTY_WORKSPACE_SNAPSHOT:WorkspaceSnapshot={settings:DEFAULT_GUEST_WORKSPACE,ready:false,error:""};
interface Bucket {identity:WorkspaceIdentity;key:string;snapshot:WorkspaceSnapshot;pending:WorkspacePatch;active:boolean;cached:boolean;timer?:ReturnType<typeof setTimeout>;loading?:Promise<void>;saving?:Promise<void>}
const buckets=new Map<string,Bucket>(),listeners=new Set<()=>void>();let active:Bucket|undefined;
function emit(){for(const listener of listeners)listener();}
function legacy(){
  try{const market=JSON.parse(localStorage.getItem("sinex:market-workspace:v1")||"{}"),geometry=JSON.parse(localStorage.getItem("sinex:orderbook-window:v1")||"null");const parsed=workspaceSettingsSchema.safeParse({...DEFAULT_GUEST_WORKSPACE,...market,orderBookWindow:geometry});return parsed.success?normalizeWorkspace(parsed.data):DEFAULT_GUEST_WORKSPACE;}catch{return DEFAULT_GUEST_WORKSPACE;}
}
function bucket(identity:WorkspaceIdentity){
  const key=identity.userId?`sinex:workspace:user:${identity.userId}`:"sinex:workspace:guest";
  let value=buckets.get(key);if(value){value.identity=identity;return value;}
  let settings=identity.userId?DEFAULT_WORKSPACE:legacy(),pending:WorkspacePatch={},cached=false,migratedGuestPanels=false;
  try{const raw=JSON.parse(localStorage.getItem(key)||"null"),parsed=workspaceSettingsSchema.safeParse(raw?.settings);if(parsed.success){settings=normalizeWorkspace(parsed.data);cached=true;const patch=workspacePatchSchema.safeParse(raw.pending);if(patch.success)pending=patch.data;}}catch{}
  if(!identity.userId){try{const migration="sinex:guest-panels:v1";if(!localStorage.getItem(migration)){settings=normalizeWorkspace({...settings,orderBookOpen:true,marketsOpen:true,tradesOpen:true,tradesDocked:true,tradesTab:"all"});localStorage.setItem(migration,"1");migratedGuestPanels=true;}}catch{}}
  value={identity,key,snapshot:{settings,ready:!identity.userId,error:""},pending,active:false,cached};buckets.set(key,value);if(migratedGuestPanels)local(value);return value;
}
function local(value:Bucket){try{localStorage.setItem(value.key,JSON.stringify({settings:value.snapshot.settings,pending:value.pending}));}catch{/* The live state and server save still work when browser storage is disabled. */}}
function publish(value:Bucket,settings:WorkspaceSettings,ready=value.snapshot.ready,error=""){value.snapshot={settings,ready,error};emit();}
function schedule(value:Bucket,delay=300){clearTimeout(value.timer);if(value.active&&value.identity.userId&&value.snapshot.ready&&Object.keys(value.pending).length)value.timer=setTimeout(()=>void save(value).catch(()=>{}),delay);}
async function request(value:Bucket,patch?:WorkspacePatch){
  const response=await fetch("/api/workspace",{method:patch?"PATCH":"GET",cache:"no-store",headers:patch?{"Content-Type":"application/json","X-Workspace-Id":value.identity.ownerId}:undefined,body:patch?JSON.stringify(patch):undefined,signal:AbortSignal.timeout(12000)}),json=await response.json();
  if(!response.ok||json.ownerId!==value.identity.ownerId)throw new Error(json.error?.message||"Не удалось синхронизировать настройки аккаунта.");
  return json.data.settings===null?null:workspaceSettingsSchema.parse(json.data.settings);
}
async function load(value:Bucket):Promise<void>{
  if(value.loading)return value.loading;
  value.loading=(async()=>{
    try{
      const remote=await request(value);if(!value.active)return;
      let initial=remote||value.snapshot.settings;
      if(!remote&&!value.cached){
        try{const claimed=localStorage.getItem("sinex:legacy-workspace-user");if(!claimed||claimed===value.identity.userId){initial=legacy();localStorage.setItem("sinex:legacy-workspace-user",value.identity.userId!);}}catch{}
      }
      // Import local settings only for an account that has no saved server document.
      if(!remote)value.pending={...initial,...value.pending};
      publish(value,normalizeWorkspace({...initial,...value.pending}),true);local(value);schedule(value);
    }catch(error){if(value.active)publish(value,value.snapshot.settings,false,error instanceof Error?error.message:"Не удалось загрузить настройки аккаунта.");}
    finally{value.loading=undefined;}
  })();return value.loading;
}
async function save(value:Bucket):Promise<void>{
  if(value.saving)return value.saving;
  clearTimeout(value.timer);if(!value.identity.userId||!value.snapshot.ready||!Object.keys(value.pending).length)return;
  const sent={...value.pending};
  value.saving=(async()=>{
    try{
      const remote=await request(value,sent);if(!remote)throw new Error("Не удалось сохранить настройки аккаунта.");
      for(const key of Object.keys(sent) as (keyof WorkspacePatch)[])if(JSON.stringify(value.pending[key])===JSON.stringify(sent[key]))delete value.pending[key];
      publish(value,normalizeWorkspace({...remote,...value.pending}),true);local(value);
    }catch(error){publish(value,value.snapshot.settings,true,error instanceof Error?error.message:"Не удалось сохранить настройки аккаунта.");throw error;}
    finally{value.saving=undefined;schedule(value,value.snapshot.error?10000:300);}
  })();return value.saving;
}
export function workspaceSnapshot(identity:WorkspaceIdentity|null){return identity?bucket(identity).snapshot:EMPTY_WORKSPACE_SNAPSHOT;}
export function subscribeWorkspace(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function updateWorkspace(identity:WorkspaceIdentity|null,patch:WorkspacePatch){
  if(!identity)return;const value=bucket(identity),validated=workspacePatchSchema.parse(patch);
  if(identity.userId)value.pending={...value.pending,...validated};
  publish(value,normalizeWorkspace({...value.snapshot.settings,...validated}));local(value);schedule(value);
}
export async function retryWorkspace(identity:WorkspaceIdentity|null){if(!identity?.userId)return;const value=bucket(identity);await load(value);await save(value);}
export async function flushWorkspacePreferences(){
  const value=active;if(!value?.identity.userId)return;
  if(!value.snapshot.ready)await load(value);
  if(!value.snapshot.ready)throw new Error(value.snapshot.error||"Настройки аккаунта ещё загружаются.");
  while(Object.keys(value.pending).length){await save(value);}
  if(value.saving)await value.saving;
}
export function activateWorkspace(identity:WorkspaceIdentity){
  const value=bucket(identity);active=value;value.active=true;if(identity.userId)void load(value);
  const refresh=()=>{if(!document.hidden&&value.active&&!value.saving&&identity.userId){if(value.snapshot.ready&&Object.keys(value.pending).length)schedule(value,0);else void load(value);}};
  const storage=(event:StorageEvent)=>{
    if(event.key!==value.key&&event.key!==null)return;
    if(identity.userId){refresh();return;}
    try{const raw=JSON.parse(localStorage.getItem(value.key)||"null"),parsed=workspaceSettingsSchema.safeParse(raw?.settings);publish(value,parsed.success?normalizeWorkspace(parsed.data):DEFAULT_GUEST_WORKSPACE,true);}catch{}
  };
  window.addEventListener("focus",refresh);window.addEventListener("storage",storage);window.addEventListener("online",refresh);
  return()=>{value.active=false;clearTimeout(value.timer);if(active===value)active=undefined;window.removeEventListener("focus",refresh);window.removeEventListener("storage",storage);window.removeEventListener("online",refresh);};
}
