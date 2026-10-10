import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Report editing is gated by an admin passcode. Unlocking returns a short-lived
 * signed token the browser sends as `x-atlas-admin`; no user accounts exist.
 * ATLAS_ADMIN_PASSCODE is preferred; KRA_PASSCODE keeps existing installs working.
 */
const TTL_MS = 12 * 60 * 60 * 1000;
const processSecret = randomBytes(32).toString("hex");
const passcode = (env) => env.ATLAS_ADMIN_PASSCODE || env.KRA_PASSCODE || "";
const secret = (env) => env.ATLAS_ADMIN_SECRET || env.KRA_SESSION_SECRET || processSecret;
const digest = (text) => createHash("sha256").update(String(text)).digest();
const sign = (env, body) => createHmac("sha256", secret(env)).update(body).digest("base64url");

export const adminConfigured = (env = process.env) => !!passcode(env);

export function unlockAdmin(candidate, env = process.env) {
  const expected = passcode(env);
  if (!expected) throw Object.assign(new Error("Admin editing is not configured. Set ATLAS_ADMIN_PASSCODE on the server."), { status: 503 });
  if (typeof candidate !== "string" || !timingSafeEqual(digest(candidate), digest(expected)))
    throw Object.assign(new Error("That admin passcode is not correct."), { status: 401 });
  const body = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + TTL_MS })).toString("base64url");
  return { token: `${body}.${sign(env, body)}`, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
}

export function verifyAdmin(token, env = process.env) {
  if (!adminConfigured(env) || typeof token !== "string") return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = Buffer.from(sign(env, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.role === "admin" && Number(payload.exp) > Date.now();
  } catch { return false; }
}

export function requireAdmin(req, env = process.env) {
  if (!verifyAdmin(req.get?.("x-atlas-admin") ?? req.headers?.["x-atlas-admin"], env))
    throw Object.assign(new Error("Unlock admin editing to change this report."), { status: 403 });
}
