"use client";
import {useRef,useState,type FormEvent,type ReactNode} from "react";
import {Camera,Trash2,Save,KeyRound} from "lucide-react";
import type {AccountUser} from "@/lib/auth/types";
import {profileNameSchema,changePasswordSchema} from "@/lib/auth/profile";
async function avatarPng(file:File):Promise<Blob>{
  if(file.size>5*1024*1024)throw new Error("Выберите фото размером до 5 МБ.");
  if(!["image/png","image/jpeg","image/webp","image/gif","image/avif"].includes(file.type))throw new Error("Поддерживаются PNG, JPEG, WebP, GIF и AVIF.");
  let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error("Не удалось открыть изображение.");}
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw new Error("Фото слишком большое. Выберите изображение до 40 мегапикселей.");
    const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;
    const context=canvas.getContext("2d");if(!context)throw new Error("Не удалось подготовить фото.");
    const side=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Не удалось подготовить фото.")),"image/png"));
  }finally{bitmap.close();}
}
export function ProfileEditor({user,ownerId,avatar,changed,onBusy}:{user:AccountUser;ownerId:string;avatar:ReactNode;changed:()=>Promise<void>;onBusy:(busy:boolean)=>void}){
  const [name,setName]=useState(user.displayName||""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const saving=useRef(false),fileInput=useRef<HTMLInputElement>(null);
  async function request(url:string,method:string,body:BodyInit,binary=false){
    const response=await fetch(url,{method,headers:{"X-Workspace-Id":ownerId,"Content-Type":binary?"image/png":"application/json"},body,signal:AbortSignal.timeout(15000)}),result=await response.json();
    if(!response.ok)throw new Error(result.error?.message||"Не удалось сохранить профиль.");
    if(result.ownerId!==ownerId)throw new Error("Аккаунт изменился. Обновите страницу.");
    await changed();
  }
  async function run(action:()=>Promise<void>,success:string){
    if(saving.current)return;saving.current=true;setBusy(true);onBusy(true);setError("");setNotice("");
    try{await action();setNotice(success);}catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить профиль.");}finally{saving.current=false;setBusy(false);onBusy(false);}
  }
  function saveName(event:FormEvent<HTMLFormElement>){event.preventDefault();const parsed=profileNameSchema.safeParse({displayName:name});if(!parsed.success){setError(parsed.error.issues[0]?.message||"Проверьте имя.");return;}void run(()=>request("/api/auth/profile","PATCH",JSON.stringify(parsed.data)),"Имя сохранено.");}
  function savePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,fields=Object.fromEntries(new FormData(form)),parsed=changePasswordSchema.safeParse(fields);
    if(!parsed.success){setError(parsed.error.issues[0]?.message||"Проверьте пароль.");return;}
    void run(async()=>{await request("/api/auth/password","POST",JSON.stringify(parsed.data));form.reset();},"Пароль сохранён. Остальные сеансы завершены.");
  }
  return <div className="profile-editor">
    <div className="account-profile profile-editor-avatar">{avatar}<div><p className="account-email">{user.email}</p><div className="profile-photo-actions"><button type="button" className="button" disabled={busy} onClick={()=>fileInput.current?.click()}><Camera size={12}/>{user.avatarUrl?"Сменить фото":"Добавить фото"}</button>{user.avatarUrl&&<button type="button" className="button" disabled={busy} aria-label="Удалить аватар" title="Удалить фото" onClick={()=>void run(()=>request("/api/auth/avatar","DELETE","{}"),"Фото удалено.")}><Trash2 size={12}/></button>}</div><input ref={fileInput} className="profile-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label="Файл аватара" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void run(async()=>request("/api/auth/avatar","POST",await avatarPng(file),true),"Фото обновлено.");}}/></div></div>
    <form className="profile-name-form" onSubmit={saveName}><label htmlFor="profile-display-name">Имя</label><div className="profile-name-fields"><input id="profile-display-name" aria-label="Имя в профиле" autoComplete="nickname" maxLength={200} value={name} disabled={busy} placeholder="Как к вам обращаться" onChange={event=>setName(event.target.value)}/><button className="button" type="submit" disabled={busy} aria-label="Сохранить имя"><Save size={14}/>Сохранить</button></div></form>
    <details className="profile-password"><summary><KeyRound size={14}/>{user.passwordEnabled?"Сменить пароль":"Задать пароль"}</summary><form onSubmit={savePassword}>
      {user.passwordEnabled&&<label>Текущий пароль<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={busy}/></label>}
      <label>Новый пароль<input name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={busy}/></label>
      <label>Повторите новый пароль<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={busy}/></label>
      <button className="button profile-password-save" type="submit" disabled={busy}>Сохранить пароль</button>
    </form></details>
    {busy&&<p className="account-hint" role="status">Сохраняем…</p>}{notice&&<p className="profile-notice" role="status">{notice}</p>}{error&&<p className="account-error" role="alert">{error}</p>}
  </div>;
}
