"use client";
import {useEffect} from "react";
import {useAccount} from "./Account";
import {activateWorkspace} from "@/lib/ui/workspace-client";
export function WorkspacePreferencesSync(){
  const {session}=useAccount(),ownerId=session?.ownerId,userId=session?.user?.id||null;
  useEffect(()=>{if(ownerId)return activateWorkspace({ownerId,userId});},[ownerId,userId]);
  return null;
}
