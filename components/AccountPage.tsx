"use client";
import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {AccountButton,useAccount} from "./Account";
import {PaperAccount} from "./PaperAccount";
import {BrandMark} from "./market/BrandMark";
export function AccountPage(){
  const {session}=useAccount();
  return <div className="account-page"><header className="topbar"><Link href="/" className="brand" aria-label="Sinex broker — главная"><span className="brand-mark"><BrandMark size={24}/></span><span className="brand-name">Sinex<small>broker</small></span></Link><Link className="account-back" href="/"><ArrowLeft size={14}/>К графику</Link><AccountButton/></header><main className="account-page-scroll"><div className="account-page-content"><div className="account-page-heading"><h1>Аккаунт</h1></div>{session?<PaperAccount key={session.ownerId} ownerId={session.ownerId} guest={!session.user}/>:<p className="account-hint" role="status">Загружаем аккаунт…</p>}</div></main></div>;
}
