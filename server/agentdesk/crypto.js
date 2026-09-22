import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { MASTER_KEY_PATH } from "./config.js";

function loadMasterKey() {
  if (existsSync(MASTER_KEY_PATH)) {
    const key = readFileSync(MASTER_KEY_PATH);
    if (key.length === 32) return key;
  }
  const key = randomBytes(32);
  writeFileSync(MASTER_KEY_PATH, key, { mode: 0o600 });
  try { chmodSync(MASTER_KEY_PATH, 0o600); } catch { /* windows fs */ }
  return key;
}

const KEY = loadMasterKey();

/** Encrypt a secret with AES-256-GCM, keyed by a random master key stored
 *  alongside the database (never in it). Returns "v1:<iv>:<tag>:<ct>" base64. */
export function encryptSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(payload) {
  if (!payload || !payload.startsWith("v1:")) return null;
  const [, ivB64, tagB64, ctB64] = payload.split(":");
  try {
    const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export const newId = (prefix) =>
  `${prefix}_${randomBytes(9).toString("base64url")}`;
