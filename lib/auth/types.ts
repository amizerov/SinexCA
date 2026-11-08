import { z } from "zod";
export interface AccountUser { id: string; email: string; googleLinked: boolean; passwordEnabled: boolean; displayName:string|null; avatarUrl:string|null }
export interface AccountSession { ownerId: string; user: AccountUser | null }
export const loginSchema = z.object({ email: z.email().trim().toLowerCase().max(254), password: z.string().min(1).max(128) });
export const registerSchema = loginSchema.extend({ password: z.string().min(10, "Используйте пароль длиной от 10 символов.").max(128), ownerCode: z.string().max(128).optional() });
