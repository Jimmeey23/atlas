import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import path from "node:path";
export function credentialStore(root) {
  const directory = path.join(root, ".atlas");
  const master = path.join(directory, "master.key");
  const target = path.join(directory, "provider.enc");
  let loaded;
  async function masterKey() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    try {
      return await readFile(master);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      const key = randomBytes(32);
      try {
        await writeFile(master, key, { mode: 0o600, flag: "wx" });
        return key;
      } catch (e) {
        if (e.code === "EEXIST") return readFile(master);
        throw e;
      }
    }
  }
  async function read() {
    if (loaded !== undefined) return loaded;
    try {
      const payload = JSON.parse(await readFile(target, "utf8"));
      const decipher = createDecipheriv(
        "aes-256-gcm",
        await masterKey(),
        Buffer.from(payload.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      loaded = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(payload.data, "base64")),
          decipher.final(),
        ]).toString(),
      );
    } catch (e) {
      if (e.code !== "ENOENT")
        throw new Error("Saved provider credentials could not be unlocked.");
      loaded = {};
    }
    return loaded;
  }
  async function save(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", await masterKey(), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    const payload = {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    await writeFile(target + ".tmp", JSON.stringify(payload), { mode: 0o600 });
    await rename(target + ".tmp", target);
    await chmod(target, 0o600);
    loaded = value;
  }
  return { read, save };
}
