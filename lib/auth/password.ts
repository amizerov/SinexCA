import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  const parts = stored?.split(":");
  const salt = parts?.[1] || "00000000000000000000000000000000";
  const key = await derive(password, salt);
  if (!parts || parts[0] !== "scrypt" || !/^[a-f0-9]{128}$/.test(parts[2] || "")) return false;
  return timingSafeEqual(key, Buffer.from(parts[2], "hex"));
}
