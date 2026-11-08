import type {DatabaseSync} from "node:sqlite";
import {DEFAULT_WORKSPACE,normalizeWorkspace,workspacePatchSchema,workspaceSettingsSchema,type WorkspaceSettings} from "@/lib/ui/workspace-settings";
export class WorkspaceStore{
  constructor(private db:DatabaseSync){db.exec("CREATE TABLE IF NOT EXISTS private_workspace_settings(owner_id TEXT PRIMARY KEY REFERENCES workspace_owners(id),settings TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);");}
  read(ownerId:string):{settings:WorkspaceSettings|null;revision:number}{
    const row=this.db.prepare("SELECT settings,revision FROM private_workspace_settings WHERE owner_id=?").get(ownerId);
    return row?{settings:normalizeWorkspace(workspaceSettingsSchema.parse(JSON.parse(String(row.settings)))),revision:Number(row.revision)}:{settings:null,revision:0};
  }
  save(ownerId:string,input:unknown){
    const patch=workspacePatchSchema.parse(input);this.db.exec("BEGIN IMMEDIATE");
    try{
      const previous=this.read(ownerId),settings=normalizeWorkspace({...DEFAULT_WORKSPACE,...previous.settings,...patch}),revision=previous.revision+1;
      this.db.prepare("INSERT INTO private_workspace_settings(owner_id,settings,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_at=excluded.updated_at").run(ownerId,JSON.stringify(settings),revision,Date.now());
      this.db.exec("COMMIT");return {settings,revision};
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
}
