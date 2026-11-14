import {layoutContentSchema,workspaceSettingsSchema,type WorkspaceSettings} from "./workspace-settings";
import type {z} from "zod";
export type LayoutContent=z.infer<typeof layoutContentSchema>;
export type LayoutLibrary=WorkspaceSettings["layouts"];
export function captureLayout(settings:WorkspaceSettings):LayoutContent{
  const {schemaVersion: _version,recentPairs: _recent,layouts: _layouts,layoutGeneration: _generation,...state}=settings;
  void _version;void _recent;void _layouts;void _generation;
  const {favorites: _favorites,...marketPanel}=state.marketPanel;void _favorites;
  return layoutContentSchema.parse({...state,layoutDrawings:state.layoutDrawings||{},marketPanel});
}
export function applyLayout(settings:WorkspaceSettings,content:LayoutContent,activeId:string|null):WorkspaceSettings{
  return workspaceSettingsSchema.parse({...settings,...content,layoutIndicators:content.layoutIndicators||settings.layoutIndicators,layoutDrawings:content.layoutDrawings||{},layoutGeneration:settings.layoutGeneration+1,marketPanel:{...content.marketPanel,favorites:settings.marketPanel.favorites},layouts:{...settings.layouts,activeId}});
}
function stable(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object")return "{"+Object.entries(value).filter(([key,item])=>item!==undefined&&key!=="revision").sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+":"+stable(item)).join(",")+"}";
  return JSON.stringify(value)??"null";
}
export function layoutChanged(current:LayoutContent,saved?:LayoutContent){return !!saved&&stable(current)!==stable(saved);}
export function availableLayoutName(library:LayoutLibrary,proposed="Новый макет",exceptId?:string){
  const used=new Set(["основной",...library.items.filter(item=>item.id!==exceptId).map(item=>item.name.toLocaleLowerCase())]);
  let name=proposed.trim().slice(0,60)||"Новый макет",suffix=2;
  while(used.has(name.toLocaleLowerCase()))name=`${proposed.trim().slice(0,50)||"Новый макет"} (${suffix++})`;
  return name;
}
export function validateLayoutName(library:LayoutLibrary,input:string,exceptId?:string){
  const name=input.trim();if(!name)throw new Error("Введите название макета.");if(name.length>60)throw new Error("Название должно быть не длиннее 60 символов.");
  const suggestion=availableLayoutName(library,name,exceptId);
  if(name!==suggestion)throw new Error(`Название уже занято. Попробуйте «${suggestion}».`);
  return name;
}
