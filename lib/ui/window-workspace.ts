import type {WorkspaceSettings} from "./workspace-settings";

/** Saved layouts and personal lists are shared; the working area belongs to this window. */
export function mergeWindowWorkspace(local:WorkspaceSettings,remote:WorkspaceSettings):WorkspaceSettings{
  const activeId=local.layouts.activeId&&remote.layouts.items.some(item=>item.id===local.layouts.activeId)?local.layouts.activeId:null;
  return {...local,recentPairs:remote.recentPairs,marketPanel:{...local.marketPanel,favorites:remote.marketPanel.favorites},layouts:{...remote.layouts,activeId}};
}
