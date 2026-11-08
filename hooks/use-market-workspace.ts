"use client";
import {useWorkspacePreferences} from "./use-workspace-preferences";
export function useMarketWorkspace(){
  const preferences=useWorkspacePreferences();
  return {workspace:preferences.settings,updateWorkspace:preferences.update,workspaceError:preferences.error,retryWorkspace:preferences.retry};
}
