import type { DatabaseSync } from "node:sqlite";
import { documentSchema, saveDrawingSchema, type DrawingScope } from "@/lib/drawings/types";
import { DrawingConflict } from "./drawing-store";
export class PrivateDrawingStore {
  constructor(private db: DatabaseSync) {}
  read(ownerId: string, scope: DrawingScope) {
    const rows = this.db.prepare(`SELECT d.revision,l.id,l.price,l.color,x.options FROM private_documents d LEFT JOIN private_levels l
      USING(owner_id,exchange,market_type,symbol) LEFT JOIN private_line_options x ON x.owner_id=l.owner_id AND x.exchange=l.exchange AND x.market_type=l.market_type AND x.symbol=l.symbol AND x.id=l.id WHERE d.owner_id=? AND d.exchange=? AND d.market_type=? AND d.symbol=? ORDER BY l.position`)
      .all(ownerId,scope.exchange,scope.marketType,scope.symbol);
    return documentSchema.parse({revision: rows[0]?.revision || 0, levels: rows.filter(row=>row.id!==null).map(({id,price,color,options})=>({...options&&JSON.parse(String(options)),id,price,color}))});
  }
  save(ownerId: string, input: unknown) {
    const {scope,revision,mutationId,levels}=saveDrawingSchema.parse(input);
    const params=[ownerId,scope.exchange,scope.marketType,scope.symbol];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current=this.db.prepare("SELECT revision,mutation_id FROM private_documents WHERE owner_id=? AND exchange=? AND market_type=? AND symbol=?").get(...params);
      if(current?.mutation_id===mutationId) { const result=this.read(ownerId,scope); this.db.exec("COMMIT"); return result; }
      if(Number(current?.revision || 0)!==revision) throw new DrawingConflict("Разметка изменилась в другой вкладке. Загрузите сохранённые уровни.");
      this.db.prepare(`INSERT INTO private_documents VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,exchange,market_type,symbol)
        DO UPDATE SET revision=excluded.revision,mutation_id=excluded.mutation_id,updated_at=excluded.updated_at`).run(...params,revision+1,mutationId,new Date().toISOString());
      this.db.prepare("DELETE FROM private_levels WHERE owner_id=? AND exchange=? AND market_type=? AND symbol=?").run(...params);
      const insert=this.db.prepare("INSERT INTO private_levels VALUES(?,?,?,?,?,?,?,?)");
      const insertOptions=this.db.prepare("INSERT INTO private_line_options VALUES(?,?,?,?,?,?)");
      levels.forEach(({id,price,color,...options},position)=>{insert.run(...params,id,price,color,position);if(Object.keys(options).length)insertOptions.run(...params,id,JSON.stringify(options));});
      this.db.exec("COMMIT"); return {revision:revision+1,levels};
    } catch(error) {this.db.exec("ROLLBACK");throw error;}
  }
}
