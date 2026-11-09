import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "talus_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const key = await scryptAsync(password, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export type AuthEnv = { Variables: { userId: number } };

export function sessionAuth(secret: string) {
  const issue = async (c: Context, userId: number) => {
    const token = await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE }, secret);
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: MAX_AGE });
  };
  const clear = (c: Context) => deleteCookie(c, COOKIE, { path: "/" });
  const required: MiddlewareHandler<AuthEnv> = async (c, next) => {
    const token = getCookie(c, COOKIE);
    if (!token) return c.json({ error: "not_authenticated" }, 401);
    try {
      const payload = await verify(token, secret, "HS256");
      c.set("userId", Number(payload.sub));
    } catch {
      return c.json({ error: "not_authenticated" }, 401);
    }
    await next();
  };
  return { issue, clear, required };
}
