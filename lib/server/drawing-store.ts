import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { documentSchema, saveDrawingSchema, type DrawingDocument, type DrawingScope } from "@/lib/drawings/types";

export class DrawingConflict extends Error {}
/** SQLite stays server-side. Exposed as a class so real on-disk persistence can be tested independently. */
export class DrawingStore {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS drawing_documents (
        exchange TEXT NOT NULL, market_type TEXT NOT NULL CHECK(market_type='spot'), symbol TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK(revision>=1), mutation_id TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(exchange,market_type,symbol)
      );
      CREATE TABLE IF NOT EXISTS horizontal_levels (
        exchange TEXT NOT NULL, market_type TEXT NOT NULL, symbol TEXT NOT NULL,
        id TEXT NOT NULL, price REAL NOT NULL CHECK(price>0), color TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY(exchange,market_type,symbol,id),
        FOREIGN KEY(exchange,market_type,symbol) REFERENCES drawing_documents(exchange,market_type,symbol) ON DELETE CASCADE
      ); PRAGMA user_version=1;`);
  }
  read(scope: DrawingScope): DrawingDocument {
    const params = [scope.exchange, scope.marketType, scope.symbol];
    const rows = this.db.prepare(`SELECT d.revision,l.id,l.price,l.color FROM drawing_documents d
      LEFT JOIN horizontal_levels l ON l.exchange=d.exchange AND l.market_type=d.market_type AND l.symbol=d.symbol
      WHERE d.exchange=? AND d.market_type=? AND d.symbol=? ORDER BY l.position`).all(...params);
    return documentSchema.parse({ revision: rows[0]?.revision || 0, levels: rows.filter(row => row.id !== null).map(row => ({ id: row.id, price: row.price, color: row.color })) });
  }
  save(input: unknown): DrawingDocument {
    const { scope, revision, mutationId, levels } = saveDrawingSchema.parse(input);
    const params = [scope.exchange, scope.marketType, scope.symbol];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db.prepare("SELECT revision,mutation_id FROM drawing_documents WHERE exchange=? AND market_type=? AND symbol=?").get(...params);
      // Retrying an acknowledged or uncertain request must not save it twice.
      if (current?.mutation_id === mutationId) { const result = this.read(scope); this.db.exec("COMMIT"); return result; }
      if ((current?.revision || 0) !== revision) throw new DrawingConflict("Разметка изменена в другой вкладке. Загрузите сохранённые уровни.");
      this.db.prepare(`INSERT INTO drawing_documents(exchange,market_type,symbol,revision,mutation_id,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(exchange,market_type,symbol) DO UPDATE SET revision=excluded.revision,mutation_id=excluded.mutation_id,updated_at=excluded.updated_at`).run(...params, revision + 1, mutationId, new Date().toISOString());
      this.db.prepare("DELETE FROM horizontal_levels WHERE exchange=? AND market_type=? AND symbol=?").run(...params);
      const insert = this.db.prepare("INSERT INTO horizontal_levels(exchange,market_type,symbol,id,price,color,position) VALUES(?,?,?,?,?,?,?)");
      levels.forEach((level, position) => insert.run(...params, level.id, level.price, level.color, position));
      this.db.exec("COMMIT");
      return { revision: revision + 1, levels };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  close() { this.db.close(); }
}
