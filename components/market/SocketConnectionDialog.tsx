"use client";
import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import {RefreshCw,X} from "lucide-react";
export function SocketConnectionDialog({exchange,pair,refresh,close}:{exchange:string;pair:string;refresh:()=>void;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  return createPortal(<dialog ref={dialog} className="account-dialog socket-connection-dialog" aria-labelledby="socket-connection-title" onCancel={close}>
    <button className="account-close" type="button" onClick={close} aria-label="Закрыть ошибку подключения"><X size={18}/></button>
    <h2 id="socket-connection-title">Ошибка подключения к WebSocket</h2>
    <p>{exchange} · {pair}</p><p>Не удалось подключиться к потоку рыночных данных. Проверьте соединение и повторите подключение.</p>
    <div className="futures-parameters-actions"><button className="button" onClick={close}>Закрыть</button><button className="button socket-refresh-button" onClick={()=>{refresh();close();}}><RefreshCw size={14}/><span>Обновить</span></button></div>
  </dialog>,document.body);
}
