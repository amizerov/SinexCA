import type { DatabaseSync } from "node:sqlite";
import { defaultIndicators } from "@/lib/indicators/settings";
import {applyIndicatorEdit,scopedIndicatorDocumentSchema,saveScopedIndicatorsSchema} from "@/lib/indicators/scope";
import { DrawingConflict } from "./drawing-store";
export class IndicatorStore {
  constructor(private db:DatabaseSync){}
  read(ownerId:string){const row=this.db.prepare("SELECT revision,settings FROM private_indicator_settings WHERE owner_id=?").get(ownerId),stored=row?JSON.parse(String(row.settings)):defaultIndicators();return scopedIndicatorDocumentSchema.parse({revision:row?.revision||0,settings:stored,overrides:stored.overrides||{}});}
  save(ownerId:string,input:unknown){const {revision,settings,mutationId,scope,forAll}=saveScopedIndicatorsSchema.parse(input);this.db.exec("BEGIN IMMEDIATE");try{
    const row=this.db.prepare("SELECT revision,mutation_id FROM private_indicator_settings WHERE owner_id=?").get(ownerId);
    if(row?.mutation_id===mutationId){const result=this.read(ownerId);this.db.exec("COMMIT");return result;}
    if(Number(row?.revision||0)!==revision)throw new DrawingConflict("Настройки индикаторов изменены в другой вкладке. Перезагрузите настройки.");
    const current=this.read(ownerId),next=scope&&forAll?applyIndicatorEdit(current.settings,current.overrides,scope,settings,forAll):{settings,overrides:current.overrides};
    const result=scopedIndicatorDocumentSchema.parse({revision:revision+1,...next});
    this.db.prepare("INSERT INTO private_indicator_settings VALUES(?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET revision=excluded.revision,settings=excluded.settings,mutation_id=excluded.mutation_id,updated_at=excluded.updated_at").run(ownerId,revision+1,JSON.stringify({...result.settings,overrides:result.overrides}),mutationId,Date.now());this.db.exec("COMMIT");return result;
  }catch(error){this.db.exec("ROLLBACK");throw error;}}
}
