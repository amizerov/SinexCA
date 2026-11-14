"use client";
import { useEffect, useRef, useState } from "react";
import { documentSchema,scopeKey, type DrawingScope, type HorizontalLevel } from "@/lib/drawings/types";
import {useWorkspacePreferences} from "./use-workspace-preferences";
import {workspaceSnapshot,updateWorkspace} from "@/lib/ui/workspace-client";

type SaveStatus = "loading" | "saved" | "saving" | "error" | "conflict";
interface SaveJob { levels: HorizontalLevel[]; mutationId: string }
export function useDrawingLevels(scope: DrawingScope,ownerId:string) {
  const workspace=useWorkspacePreferences(),workspaceRef=useRef(workspace);
  useEffect(()=>{workspaceRef.current=workspace;},[workspace]);
  const ownerRef=useRef(ownerId);
  const [levels, setLevels] = useState<HorizontalLevel[]>([]);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState("");
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount,setRedoCount]=useState(0);
  const [ready, setReady] = useState(false);
  const current = useRef<HorizontalLevel[]>([]);
  const history = useRef<HorizontalLevel[][]>([]);
  const future=useRef<HorizontalLevel[][]>([]);
  const session = useRef<{ mounted: boolean; ready: boolean; revision: number; busy: boolean; pending?: SaveJob; failed?: SaveJob; conflict: boolean } | null>(null);
  // The drawing component is keyed by exchange/market/pair, so sessions cannot cross instruments.
  const scopeRef = useRef(scope);
  async function pump() {
    const s = session.current;
    if (!s || !s.ready || s.busy || s.conflict) return;
    s.busy = true;
    while (s.failed || s.pending) {
      const job = s.failed || s.pending!;
      if (s.failed) s.failed = undefined; else s.pending = undefined;
      if (s.mounted) { setStatus("saving"); setError(""); }
      try {
        const local=workspaceRef.current;
        if(local.identity&&local.settings.layouts.standard){
          const settings=workspaceSnapshot(local.identity).settings;
          updateWorkspace(local.identity,{layoutDrawings:{...settings.layoutDrawings,[scopeKey(scopeRef.current)]:job.levels}});
          s.revision++;if(s.mounted&&!s.pending)setStatus("saved");continue;
        }
        const response = await fetch("/api/drawings", { method: "PUT", headers: { "Content-Type": "application/json","X-Workspace-Id":ownerRef.current }, body: JSON.stringify({ scope: scopeRef.current, revision: s.revision, ...job }), keepalive: true, signal: AbortSignal.timeout(12000) });
        const result = await response.json();
        if (!response.ok) { s.conflict = response.status === 409; throw new Error(result.error?.message || "Не удалось сохранить уровни."); }
        s.revision = documentSchema.parse(result.data).revision;
        if (s.mounted && !s.pending) setStatus("saved");
      } catch (cause) {
        s.failed = job;
        if (s.mounted) { setStatus(s.conflict ? "conflict" : "error"); setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "Нет связи с базой. Изменения ещё не сохранены."); }
        break;
      }
    }
    s.busy = false;
  }
  const pumpRef = useRef(pump);
  useEffect(() => { pumpRef.current = pump; });
  useEffect(() => {
    const controller = new AbortController();
    const s = { mounted: true, ready: false, revision: 0, busy: false, conflict: false };
    session.current = s;
    async function load() {
      try {
        const stored=workspaceRef.current.settings.layoutDrawings?.[scopeKey(scopeRef.current)];
        if(stored){s.ready=true;setReady(true);current.current=stored;setLevels(stored);setStatus("saved");return;}
        const params = new URLSearchParams(scopeRef.current);
        const response = await fetch(`/api/drawings?${params}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Не удалось загрузить уровни.");
        if(result.ownerId!==ownerRef.current) throw new Error("Аккаунт изменился. Перезагрузите страницу.");
        const document = documentSchema.parse(result.data);
        if (!s.mounted) return;
        s.revision = document.revision; s.ready = true; setReady(true);
        current.current = document.levels; setLevels(document.levels); setStatus("saved");
      } catch {
        if (s.mounted) { setStatus("error"); setError("Не удалось загрузить уровни из базы."); }
      }
    }
    void load();
    const beforeUnload = (event: BeforeUnloadEvent) => { const state = session.current; if (state?.busy || state?.pending || state?.failed) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    const capture=()=>{const local=workspaceRef.current;if(!s.ready||!local.identity||!local.settings.layouts.standard)return;const settings=workspaceSnapshot(local.identity).settings,key=scopeKey(scopeRef.current);if(JSON.stringify(settings.layoutDrawings?.[key])!==JSON.stringify(current.current))updateWorkspace(local.identity,{layoutDrawings:{...settings.layoutDrawings,[key]:current.current}});};
    window.addEventListener("sinex:capture-layout-drawings",capture);
    return () => { s.mounted = false; controller.abort(); window.removeEventListener("beforeunload", beforeUnload);window.removeEventListener("sinex:capture-layout-drawings",capture); };
  }, []);
  function preview(next: HorizontalLevel[]) { current.current = next; setLevels(next); }
  function commit(next: HorizontalLevel[], before = current.current) {
    const s = session.current;
    if (!s?.ready || s.conflict) return;
    history.current = [...history.current.slice(-49), before]; setUndoCount(history.current.length);
    future.current=[];setRedoCount(0);
    preview(next); s.pending = { levels: next, mutationId: crypto.randomUUID() }; void pump();
  }
  function undo() {
    const s = session.current;
    if (!s?.ready || s.conflict) return;
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(current.current);setRedoCount(future.current.length);
    setUndoCount(history.current.length); preview(previous);
    s.pending = { levels: previous, mutationId: crypto.randomUUID() }; void pump();
  }
  function redo(){const s=session.current;if(!s?.ready||s.conflict)return;const next=future.current.pop();if(!next)return;history.current.push(current.current);setUndoCount(history.current.length);setRedoCount(future.current.length);preview(next);s.pending={levels:next,mutationId:crypto.randomUUID()};void pump();}
  return { levels, status, error, undoCount,redoCount, ready: ready && status !== "conflict", getLevels: () => current.current, preview, commit, undo,redo, retry: () => { if (!ready) window.location.reload(); else void pumpRef.current(); }, reload: () => window.location.reload() };
}
