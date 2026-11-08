"use client";
import {useCallback,useMemo,useSyncExternalStore} from "react";
import {useAccount} from "@/components/Account";
import {EMPTY_WORKSPACE_SNAPSHOT,workspaceSnapshot,subscribeWorkspace,updateWorkspace,retryWorkspace} from "@/lib/ui/workspace-client";
import type {WorkspacePatch} from "@/lib/ui/workspace-settings";
export function useWorkspacePreferences(){
  const {session}=useAccount(),ownerId=session?.ownerId,userId=session?.user?.id||null;
  const identity=useMemo(()=>ownerId?{ownerId,userId}:null,[ownerId,userId]);
  const read=useCallback(()=>workspaceSnapshot(identity),[identity]);
  const snapshot=useSyncExternalStore(subscribeWorkspace,read,()=>EMPTY_WORKSPACE_SNAPSHOT);
  const update=useCallback((patch:WorkspacePatch)=>updateWorkspace(identity,patch),[identity]);
  return {...snapshot,identity,update,retry:()=>retryWorkspace(identity)};
}
