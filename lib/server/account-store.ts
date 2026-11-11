import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tokenHash } from "@/lib/auth/password";
import type { AccountSession } from "@/lib/auth/types";
import {initializePaperTables,PaperStore,PaperAccountError} from "./paper-store";
export const OWNER_EMAIL = "andrey@mizerov.net";
export const SESSION_MAX_AGE = 30 * 86400;
export class AccountError extends Error { constructor(message: string, public status = 400, public code = "ACCOUNT_ERROR") { super(message); } }
export class AccountStore {
  readonly db: DatabaseSync;
  constructor(path: string, bootstrapOwner = true) {
    mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout=5000;");
    if(bootstrapOwner && this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='drawing_documents'").get() && !this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_migrations'").get()) {
      // VACUUM INTO includes committed WAL data, unlike copying a live SQLite file.
      this.db.prepare("VACUUM INTO ?").run(join(dirname(path),`sinex.pre-accounts-${Date.now()}-${randomUUID()}.sqlite`));
    }
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS account_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT,google_sub TEXT UNIQUE,owner_code_hash TEXT,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workspace_owners(id TEXT PRIMARY KEY,kind TEXT NOT NULL,user_id TEXT UNIQUE REFERENCES account_users(id),created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_sessions(token_hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES workspace_owners(id),expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_oauth(state_hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS private_documents(owner_id TEXT NOT NULL REFERENCES workspace_owners(id),exchange TEXT NOT NULL,market_type TEXT NOT NULL,symbol TEXT NOT NULL,revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(owner_id,exchange,market_type,symbol));
      CREATE TABLE IF NOT EXISTS private_levels(owner_id TEXT NOT NULL,exchange TEXT NOT NULL,market_type TEXT NOT NULL,symbol TEXT NOT NULL,id TEXT NOT NULL,price REAL NOT NULL CHECK(price>0),color TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(owner_id,exchange,market_type,symbol,id),FOREIGN KEY(owner_id,exchange,market_type,symbol) REFERENCES private_documents(owner_id,exchange,market_type,symbol) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS private_line_options(owner_id TEXT NOT NULL,exchange TEXT NOT NULL,market_type TEXT NOT NULL,symbol TEXT NOT NULL,id TEXT NOT NULL,options TEXT NOT NULL,PRIMARY KEY(owner_id,exchange,market_type,symbol,id),FOREIGN KEY(owner_id,exchange,market_type,symbol,id) REFERENCES private_levels(owner_id,exchange,market_type,symbol,id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS account_migrations(name TEXT PRIMARY KEY,completed_at INTEGER NOT NULL);`);
    this.db.exec("CREATE TABLE IF NOT EXISTS private_indicator_settings(owner_id TEXT PRIMARY KEY REFERENCES workspace_owners(id),revision INTEGER NOT NULL,settings TEXT NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL);");
    this.db.exec("CREATE TABLE IF NOT EXISTS account_avatar_images(user_id TEXT PRIMARY KEY REFERENCES account_users(id),content BLOB NOT NULL,version TEXT NOT NULL,updated_at INTEGER NOT NULL);");
    initializePaperTables(this.db);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const columns=new Set(this.db.prepare("PRAGMA table_info(account_users)").all().map(column=>column.name));
      if(!columns.has("display_name"))this.db.exec("ALTER TABLE account_users ADD COLUMN display_name TEXT;");
      if(!columns.has("avatar_url"))this.db.exec("ALTER TABLE account_users ADD COLUMN avatar_url TEXT;");
      if(!columns.has("yandex_sub"))this.db.exec("ALTER TABLE account_users ADD COLUMN yandex_sub TEXT;");
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS account_users_yandex_sub ON account_users(yandex_sub);");
      if(!columns.has("profile_name_custom"))this.db.exec("ALTER TABLE account_users ADD COLUMN profile_name_custom INTEGER NOT NULL DEFAULT 0;");
      if(!columns.has("profile_avatar_custom"))this.db.exec("ALTER TABLE account_users ADD COLUMN profile_avatar_custom INTEGER NOT NULL DEFAULT 0;");
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
    if (bootstrapOwner) this.bootstrap(dirname(path));
  }
  private bootstrap(directory: string) {
    const done = this.db.prepare("SELECT 1 FROM account_migrations WHERE name='private-workspaces-v1'").get();
    if (done) return;
    const id = randomUUID(), ownerId = randomUUID();
    const codeFile = join(directory, "owner-setup-code.txt");
    // Existing drawings are reserved for their specified owner, never copied to new visitors.
    // Write the one-time local activation code before committing the account migration.
    if (!existsSync(codeFile)) {
      try {writeFileSync(codeFile, randomBytes(24).toString("base64url") + "\n", { flag: "wx", mode: 0o600 });}
      catch(error){if(!existsSync(codeFile))throw error;}
    }
    const code=readFileSync(codeFile,"utf8").trim();
    if(!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new Error("Invalid owner setup code file");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if(this.db.prepare("SELECT 1 FROM account_migrations WHERE name='private-workspaces-v1'").get()){this.db.exec("COMMIT");return;}
      const existing = this.db.prepare("SELECT id FROM account_users WHERE email=?").get(OWNER_EMAIL);
      let targetOwner: string = ownerId;
      if (!existing) {
        this.db.prepare("INSERT INTO account_users(id,email,owner_code_hash,created_at) VALUES(?,?,?,?)").run(id, OWNER_EMAIL, tokenHash(code), Date.now());
        this.db.prepare("INSERT INTO workspace_owners(id,kind,user_id,created_at) VALUES(?,'user',?,?)").run(ownerId, id, Date.now());
      } else {
        const owner = this.db.prepare("SELECT id FROM workspace_owners WHERE user_id=?").get(existing.id!);
        if (!owner) throw new Error("Owner workspace missing");
        targetOwner = String(owner.id);
      }
      if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='drawing_documents'").get()) {
        this.db.prepare("INSERT OR IGNORE INTO private_documents SELECT ?,exchange,market_type,symbol,revision,mutation_id,updated_at FROM drawing_documents").run(targetOwner);
        this.db.prepare("INSERT OR IGNORE INTO private_levels SELECT ?,exchange,market_type,symbol,id,price,color,position FROM horizontal_levels").run(targetOwner);
      }
      this.db.prepare("INSERT INTO account_migrations VALUES('private-workspaces-v1',?)").run(Date.now());
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  userByEmail(email: string) { return this.db.prepare("SELECT * FROM account_users WHERE email=?").get(email); }
  updateDisplayName(userId:string,displayName:string){
    if(!this.db.prepare("UPDATE account_users SET display_name=?,profile_name_custom=1 WHERE id=?").run(displayName||null,userId).changes)throw new AccountError("Аккаунт не найден.",404);
  }
  saveAvatar(userId:string,content:Buffer){
    this.db.exec("BEGIN IMMEDIATE");try{
      const version=randomUUID(),url=`/api/auth/avatar?userId=${encodeURIComponent(userId)}&v=${version}`;
      if(!this.db.prepare("UPDATE account_users SET avatar_url=?,profile_avatar_custom=1 WHERE id=?").run(url,userId).changes)throw new AccountError("Аккаунт не найден.",404);
      this.db.prepare("INSERT INTO account_avatar_images VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET content=excluded.content,version=excluded.version,updated_at=excluded.updated_at").run(userId,content,version,Date.now());
      this.db.exec("COMMIT");return url;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  removeAvatar(userId:string){
    this.db.exec("BEGIN IMMEDIATE");try{this.db.prepare("DELETE FROM account_avatar_images WHERE user_id=?").run(userId);if(!this.db.prepare("UPDATE account_users SET avatar_url=NULL,profile_avatar_custom=1 WHERE id=?").run(userId).changes)throw new AccountError("Аккаунт не найден.",404);this.db.exec("COMMIT");}catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  changePassword(userId:string,token:string,expectedHash:string|null,newHash:string){
    this.db.exec("BEGIN IMMEDIATE");try{
      const session=this.session(token);if(session?.user?.id!==userId)throw new AccountError("Войдите в аккаунт заново.",401);
      const current=this.db.prepare("SELECT password_hash FROM account_users WHERE id=?").get(userId);
      if(!current||current.password_hash!==expectedHash)throw new AccountError("Пароль уже изменён. Повторите с текущим паролем.",409);
      this.db.prepare("UPDATE account_users SET password_hash=? WHERE id=?").run(newHash,userId);
      this.db.prepare("DELETE FROM account_sessions WHERE owner_id=?").run(session.ownerId);
      const fresh=this.createSession(session.ownerId);this.db.exec("COMMIT");return {token:fresh,session:this.session(fresh)!};
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  session(token: string | undefined): AccountSession | null {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db.prepare(`SELECT o.id AS owner_id,u.id,u.email,u.google_sub,u.password_hash,u.display_name,u.avatar_url FROM account_sessions s
      JOIN workspace_owners o ON o.id=s.owner_id LEFT JOIN account_users u ON u.id=o.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token), Date.now());
    return row ? { ownerId: String(row.owner_id), user: row.id ? { id: String(row.id), email: String(row.email), googleLinked: !!row.google_sub, passwordEnabled: !!row.password_hash,displayName:typeof row.display_name==="string"?row.display_name:null,avatarUrl:typeof row.avatar_url==="string"?row.avatar_url:null } : null } : null;
  }
  createGuest() {
    const ownerId = randomUUID();
    this.db.prepare("INSERT INTO workspace_owners(id,kind,created_at) VALUES(?,'guest',?)").run(ownerId, Date.now());
    return { token: this.createSession(ownerId), session: { ownerId, user: null } as AccountSession };
  }
  private createSession(ownerId: string) {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM account_sessions WHERE expires_at<?").run(Date.now());
    this.db.prepare("INSERT INTO account_sessions VALUES(?,?,?)").run(tokenHash(token), ownerId, Date.now() + SESSION_MAX_AGE * 1000);
    return token;
  }
  revoke(token: string | undefined) { if (token) this.db.prepare("DELETE FROM account_sessions WHERE token_hash=?").run(tokenHash(token)); }
  attempt(email: string) {
    const key = tokenHash(email), now = Date.now();
    this.db.prepare(`INSERT INTO account_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END`).run(key, now + 900000, now, now);
    const entry = this.db.prepare("SELECT count FROM account_attempts WHERE key=?").get(key);
    if (Number(entry?.count) > 10) throw new AccountError("Слишком много попыток. Повторите через 15 минут.", 429, "RATE_LIMIT");
  }
  private mergeGuest(guest: AccountSession, ownerId: string) {
    if (guest.user || guest.ownerId === ownerId) return;
    try{new PaperStore(this.db).transferGuest(guest.ownerId,ownerId);}catch(error){if(error instanceof PaperAccountError)throw new AccountError(error.message,error.status,error.code);throw error;}
    const docs = this.db.prepare("SELECT * FROM private_documents WHERE owner_id=?").all(guest.ownerId);
    for (const doc of docs) {
      const scope = [doc.exchange!, doc.market_type!, doc.symbol!];
      const existing = this.db.prepare("SELECT revision FROM private_documents WHERE owner_id=? AND exchange=? AND market_type=? AND symbol=?").get(ownerId, ...scope);
      const readLines=this.db.prepare("SELECT l.id,l.price,l.color,x.options FROM private_levels l LEFT JOIN private_line_options x USING(owner_id,exchange,market_type,symbol,id) WHERE l.owner_id=? AND l.exchange=? AND l.market_type=? AND l.symbol=? ORDER BY l.position");
      const ownLevels = readLines.all(ownerId, ...scope);
      const guestLevels = readLines.all(guest.ownerId, ...scope);
      const levels = new Map(guestLevels.map(level => [String(level.id), level]));
      ownLevels.forEach(level => levels.set(String(level.id), level));
      if (levels.size > 100) throw new AccountError("Для объединения разметки удалите лишние гостевые уровни: максимум 100 на пару.", 409);
      this.db.prepare(`INSERT INTO private_documents VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,exchange,market_type,symbol) DO UPDATE SET revision=excluded.revision,mutation_id=excluded.mutation_id,updated_at=excluded.updated_at`).run(ownerId,...scope,Number(existing?.revision || 0)+1,randomUUID(),new Date().toISOString());
      this.db.prepare("DELETE FROM private_levels WHERE owner_id=? AND exchange=? AND market_type=? AND symbol=?").run(ownerId,...scope);
      let position = 0;
      for (const level of levels.values()) {
        this.db.prepare("INSERT INTO private_levels VALUES(?,?,?,?,?,?,?,?)").run(ownerId,...scope,level.id!,level.price!,level.color!,position++);
        if(level.options)this.db.prepare("INSERT INTO private_line_options VALUES(?,?,?,?,?,?)").run(ownerId,...scope,level.id!,level.options);
      }
    }
    // The transaction moves guest documents once; logout cannot re-import another copy.
    this.db.prepare("INSERT OR IGNORE INTO private_indicator_settings SELECT ?,revision,settings,mutation_id,updated_at FROM private_indicator_settings WHERE owner_id=?").run(ownerId,guest.ownerId);
    this.db.prepare("DELETE FROM private_indicator_settings WHERE owner_id=?").run(guest.ownerId);
    this.db.prepare("DELETE FROM private_documents WHERE owner_id=?").run(guest.ownerId);
    this.db.prepare("DELETE FROM account_sessions WHERE owner_id=?").run(guest.ownerId);
  }
  register(email: string, passwordHash: string, guest: AccountSession, ownerCode?: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let user = this.userByEmail(email);
      if (user) {
        if (user.password_hash || user.google_sub || user.yandex_sub) throw new AccountError("Для этого email уже есть аккаунт. Войдите в него.", 409);
        if (!ownerCode || !user.owner_code_hash || tokenHash(ownerCode.trim()) !== user.owner_code_hash) throw new AccountError("Для активации владельца введите одноразовый код из data/owner-setup-code.txt.", 409, "OWNER_SETUP_REQUIRED");
        this.db.prepare("UPDATE account_users SET password_hash=?,owner_code_hash=NULL WHERE id=?").run(passwordHash,user.id!);
      } else {
        const id = randomUUID(); this.db.prepare("INSERT INTO account_users(id,email,password_hash,created_at) VALUES(?,?,?,?)").run(id,email,passwordHash,Date.now());
        this.db.prepare("INSERT INTO workspace_owners VALUES(?,'user',?,?)").run(randomUUID(),id,Date.now());
        user = this.userByEmail(email)!;
      }
      const owner = this.db.prepare("SELECT id FROM workspace_owners WHERE user_id=?").get(user.id!);
      this.mergeGuest(guest, String(owner!.id));
      const token = this.createSession(String(owner!.id)); this.db.exec("COMMIT"); return { token, session: this.session(token)! };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  login(userId: string, guest: AccountSession) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result=this.authenticate(userId,guest);this.db.exec("COMMIT");return result;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private authenticate(userId:string,guest:AccountSession) {
    const owner=this.db.prepare("SELECT id FROM workspace_owners WHERE user_id=?").get(userId);
    if(!owner)throw new AccountError("Аккаунт недоступен.",401);
    this.mergeGuest(guest,String(owner.id));const token=this.createSession(String(owner.id));return {token,session:this.session(token)!};
  }
  google(sub: string, email: string, current: AccountSession,profile:{displayName:string|null;avatarUrl:string|null}={displayName:null,avatarUrl:null}) {
    // Linking must be explicit and limited to the signed-in account's verified email.
    if (current.user && current.user.email !== email) throw new AccountError("Выберите Google-аккаунт с email текущего аккаунта Sinex.", 409);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let user = this.db.prepare("SELECT * FROM account_users WHERE google_sub=?").get(sub);
      if (user && current.user && current.user.id !== user.id) throw new AccountError("Этот Google-аккаунт уже подключён к другому пользователю.", 409);
      if (!user) {
        user = this.userByEmail(email);
        if (user?.google_sub && user.google_sub !== sub) throw new AccountError("К этому email подключён другой Google-аккаунт.", 409);
        if (user && (user.password_hash || user.google_sub || user.yandex_sub) && current.user?.id !== user.id) throw new AccountError("Для этого email уже есть аккаунт. Войдите привычным способом.", 409, "LINK_REQUIRED");
        if (user) this.db.prepare("UPDATE account_users SET google_sub=?,owner_code_hash=NULL WHERE id=?").run(sub,user.id!);
        else {
          const id = randomUUID();
          this.db.prepare("INSERT INTO account_users(id,email,google_sub,created_at) VALUES(?,?,?,?)").run(id,email,sub,Date.now());
          this.db.prepare("INSERT INTO workspace_owners VALUES(?,'user',?,?)").run(randomUUID(),id,Date.now());
          user = this.userByEmail(email)!;
        }
      }
      if (current.user && current.user.id !== user.id) throw new AccountError("Сначала выйдите из текущего аккаунта.", 409);
      this.db.prepare("UPDATE account_users SET display_name=CASE WHEN profile_name_custom=0 THEN COALESCE(?,display_name) ELSE display_name END,avatar_url=CASE WHEN profile_avatar_custom=0 THEN COALESCE(?,avatar_url) ELSE avatar_url END WHERE id=?").run(profile.displayName,profile.avatarUrl,user.id!);
      const result=this.authenticate(String(user.id),current);this.db.exec("COMMIT");return result;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  yandex(sub:string,email:string,current:AccountSession,profile:{displayName:string|null;avatarUrl:string|null}){
    if(current.user&&current.user.email!==email)throw new AccountError("Выберите Яндекс-аккаунт с email текущего аккаунта Sinex.",409);
    this.db.exec("BEGIN IMMEDIATE");
    try{
      let user=this.db.prepare("SELECT * FROM account_users WHERE yandex_sub=?").get(sub);
      if(user&&current.user&&user.id!==current.user.id)throw new AccountError("Этот Яндекс-аккаунт уже подключён к другому пользователю.",409);
      if(!user){
        user=this.userByEmail(email);
        if(user?.yandex_sub&&user.yandex_sub!==sub)throw new AccountError("К этому email подключён другой Яндекс-аккаунт.",409);
        // A completed Yandex OAuth login can link an ordinary password account by email.
        // Reserved owner activation and accounts using another provider stay explicit.
        const passwordAccount=!!user?.password_hash&&!user.google_sub&&!user.owner_code_hash;
        if(user&&current.user?.id!==user.id&&!passwordAccount)throw new AccountError("Для этого email уже есть аккаунт. Сначала войдите привычным способом.",409,"LINK_REQUIRED");
        if(user)this.db.prepare("UPDATE account_users SET yandex_sub=? WHERE id=?").run(sub,user.id!);
        else{
          const id=randomUUID();
          this.db.prepare("INSERT INTO account_users(id,email,yandex_sub,created_at) VALUES(?,?,?,?)").run(id,email,sub,Date.now());
          this.db.prepare("INSERT INTO workspace_owners VALUES(?,'user',?,?)").run(randomUUID(),id,Date.now());
          user=this.userByEmail(email)!;
        }
      }
      this.db.prepare("UPDATE account_users SET display_name=CASE WHEN profile_name_custom=0 THEN COALESCE(?,display_name) ELSE display_name END,avatar_url=CASE WHEN profile_avatar_custom=0 THEN COALESCE(?,avatar_url) ELSE avatar_url END WHERE id=?").run(profile.displayName,profile.avatarUrl,user.id!);
      const result=this.authenticate(String(user.id),current);this.db.exec("COMMIT");return result;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  createOAuth(ownerId: string, state: string, nonce: string, verifier: string) {
    this.db.prepare("DELETE FROM account_oauth WHERE expires_at<?").run(Date.now());
    this.db.prepare("INSERT INTO account_oauth VALUES(?,?,?,?,?)").run(tokenHash(state),ownerId,nonce,verifier,Date.now()+600000);
  }
  consumeOAuth(state: string, ownerId: string) { return this.db.prepare("DELETE FROM account_oauth WHERE state_hash=? AND owner_id=? AND expires_at>? RETURNING nonce,verifier").get(tokenHash(state),ownerId,Date.now()); }
  close() { this.db.close(); }
}
