import "./helpers/env.js";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../server/agentdesk/crypto.js";
import { getTool } from "../server/agentdesk/tools/index.js";
import { registerBuiltinTools } from "../server/agentdesk/tools/builtin.js";

before(() => registerBuiltinTools());

test("secrets round-trip through AES-256-GCM and are not plaintext", () => {
  const enc = encryptSecret("sk-super-secret-key");
  assert.ok(!enc.includes("sk-super-secret-key"));
  assert.equal(decryptSecret(enc), "sk-super-secret-key");
});

test("decrypt rejects tampered payloads", () => {
  const enc = encryptSecret("abc");
  const parts = enc.split(":");
  parts[3] = Buffer.from("tampered-data-here").toString("base64");
  assert.equal(decryptSecret(parts.join(":")), null);
  assert.equal(decryptSecret("not-encrypted"), null);
});

test("calculator rejects non-arithmetic input", async () => {
  const calc = getTool("calculator").handler;
  assert.equal((await calc({ expression: "(12*4)+18" })).value, 66);
  await assert.rejects(() => calc({ expression: "process.exit()" }));
  await assert.rejects(() => calc({ expression: "1; rm -rf /" }));
});

test("http_fetch blocks private hosts (SSRF guard)", async () => {
  const handler = getTool("http_fetch").handler;
  for (const url of [
    "http://127.0.0.1:8787/api/health",
    "http://localhost/",
    "http://192.168.1.1/router",
    "http://169.254.169.254/latest/meta-data",
    "ftp://example.com/x",
  ]) {
    await assert.rejects(() => handler({ url }), /allowed|private|internal|escapes/i, url);
  }
});

test("file tools are sandboxed to the workspace", async () => {
  const write = getTool("write_file").handler;
  const read = getTool("read_file").handler;
  await assert.rejects(() => write({ path: "../escape.txt", content: "x" }), /escapes|workspace|sandbox/i);
  await assert.rejects(() => read({ path: "C:/Windows/System32/drivers/etc/hosts" }), /escapes|workspace|sandbox/i);
  await write({ path: "ok/nested.txt", content: "hello" });
  assert.equal((await read({ path: "ok/nested.txt" })).content, "hello");
});
