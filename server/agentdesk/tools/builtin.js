import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { WORKSPACE_DIR } from "../config.js";
import { q } from "../db.js";
import { HttpError } from "../http.js";
import { newId } from "../crypto.js";
import { registerTool } from "./index.js";

const execFileAsync = promisify(execFile);

/* ---------------- sandbox helpers ---------------- */

function resolveInWorkspace(p) {
  if (typeof p !== "string" || !p.length) throw new HttpError(400, "path is required");
  const abs = normalize(resolve(WORKSPACE_DIR, p));
  if (abs !== WORKSPACE_DIR && !abs.startsWith(WORKSPACE_DIR + sep)) {
    throw new HttpError(403, `Path '${p}' escapes the workspace sandbox`);
  }
  return abs;
}

function isPrivateIp(ip) {
  if (ip.includes(":")) return true; // block all IPv6 (loopback/link-local/ULA) conservatively
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new HttpError(400, `Invalid URL '${raw}'`); }
  if (!/^https?:$/.test(url.protocol)) throw new HttpError(403, "Only http/https URLs are allowed");
  const host = url.hostname;
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new HttpError(403, "Local hostnames are not allowed");
  }
  try {
    const { address } = await lookup(host);
    if (isPrivateIp(address)) throw new HttpError(403, `URL resolves to a private address (${address})`);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(403, `Cannot resolve host '${host}'`);
  }
  return url;
}

/* ---------------- builtin tools ---------------- */

export function registerBuiltinTools() {
  registerTool({
    name: "calculator",
    description: "Evaluate a numeric arithmetic expression (+-*/% and parentheses).",
    danger: "safe",
    parameters: {
      type: "object",
      properties: { expression: { type: "string", description: "e.g. (12*4)+18" } },
      required: ["expression"],
    },
    handler: async ({ expression }) => {
      if (typeof expression !== "string" || !/^[\d\s+\-*/%().,]+$/.test(expression) || expression.length > 200) {
        throw new HttpError(400, "Expression must contain only numbers and +-*/%() operators");
      }
      // eslint-disable-next-line no-new-func -- input is strictly validated above
      const value = Function(`"use strict"; return (${expression});`)();
      if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpError(400, "Not a finite number");
      return { expression, value };
    },
  });

  registerTool({
    name: "get_current_datetime",
    description: "Get the current date, time and timezone.",
    danger: "safe",
    parameters: { type: "object", properties: {} },
    handler: async () => ({ iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });

  registerTool({
    name: "http_fetch",
    description: "Fetch a URL over HTTP(S). Responses are truncated to 20KB. Private/local addresses are blocked.",
    danger: "confirm",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
        headers: { type: "object" },
        body: { type: "string" },
      },
      required: ["url"],
    },
    handler: async ({ url, method = "GET", headers, body }, ctx) => {
      const target = await assertPublicUrl(url);
      const res = await fetch(target, {
        method,
        headers: { "user-agent": "AgentDesk/0.1", ...headers },
        body: method === "GET" ? undefined : body,
        redirect: "follow",
        signal: ctx.signal,
      });
      const text = (await res.text()).slice(0, 20_000);
      return { status: res.status, url: res.url, contentType: res.headers.get("content-type"), body: text };
    },
  });

  registerTool({
    name: "list_directory",
    description: `List files inside the agent workspace (${WORKSPACE_DIR}).`,
    danger: "safe",
    parameters: {
      type: "object",
      properties: { path: { type: "string", default: "." } },
    },
    handler: async ({ path = "." }) => {
      const dir = resolveInWorkspace(path);
      if (!existsSync(dir)) throw new HttpError(404, "Directory not found");
      return readdirSync(dir).map((name) => {
        const st = statSync(join(dir, name));
        return { name, type: st.isDirectory() ? "dir" : "file", size: st.size };
      });
    },
  });

  registerTool({
    name: "read_file",
    description: "Read a UTF-8 text file from the agent workspace (max 50KB).",
    danger: "safe",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    handler: async ({ path }) => {
      const file = resolveInWorkspace(path);
      if (!existsSync(file)) throw new HttpError(404, "File not found");
      const st = statSync(file);
      if (st.size > 50 * 1024) throw new HttpError(400, "File too large (50KB max)");
      return { path, content: readFileSync(file, "utf8") };
    },
  });

  registerTool({
    name: "write_file",
    description: "Write a text file inside the agent workspace. Creates parent directories.",
    danger: "confirm",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    handler: async ({ path, content }) => {
      const file = resolveInWorkspace(path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, String(content ?? ""), "utf8");
      return { path, bytes: Buffer.byteLength(String(content ?? "")) };
    },
  });

  registerTool({
    name: "run_shell_command",
    description: `Run a shell command inside the agent workspace (${WORKSPACE_DIR}). 30s timeout, 64KB output cap.`,
    danger: "dangerous",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
      },
      required: ["command"],
    },
    handler: async ({ command }, ctx) => {
      if (typeof command !== "string" || !command.trim() || command.length > 2000) {
        throw new HttpError(400, "Invalid command");
      }
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const flag = process.platform === "win32" ? "/c" : "-c";
      const env = {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? process.env.USERPROFILE ?? "",
        USERPROFILE: process.env.USERPROFILE ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        TEMP: process.env.TEMP ?? "",
        TMP: process.env.TMP ?? "",
      };
      try {
        const { stdout, stderr } = await execFileAsync(shell, [flag, command], {
          cwd: WORKSPACE_DIR,
          env,
          timeout: 30_000,
          maxBuffer: 64 * 1024,
          signal: ctx.signal,
        });
        return { exitCode: 0, stdout, stderr };
      } catch (err) {
        return {
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? "",
          stderr: (err.stderr ?? err.message ?? "").slice(0, 64 * 1024),
        };
      }
    },
  });

  registerTool({
    name: "memory_save",
    description: "Save a fact/preference to persistent agent memory.",
    danger: "safe",
    parameters: {
      type: "object",
      properties: { content: { type: "string" }, tags: { type: "string" } },
      required: ["content"],
    },
    handler: async ({ content, tags = "" }) => {
      const id = newId("mem");
      q.run("INSERT INTO memories (id, content, tags) VALUES (?, ?, ?)", id, String(content).slice(0, 4000), String(tags).slice(0, 200));
      return { id, saved: true };
    },
  });

  registerTool({
    name: "memory_search",
    description: "Search persistent agent memory by keyword.",
    danger: "safe",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number", default: 5 } },
      required: ["query"],
    },
    handler: async ({ query, limit = 5 }) => ({
      results: q.all(
        "SELECT id, content, tags, created_at FROM memories WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?",
        `%${query}%`, `%${query}%`, Math.min(limit, 20)
      ),
    }),
  });

  registerTool({
    name: "knowledge_search",
    description: "Search past thread messages and memory for relevant context.",
    danger: "safe",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number", default: 5 } },
      required: ["query"],
    },
    handler: async ({ query, limit = 5 }) => {
      const like = `%${query}%`;
      const msgs = q.all(
        `SELECT thread_id, role, substr(content, 1, 300) AS snippet, created_at
         FROM messages WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?`,
        like, Math.min(limit, 20)
      );
      const mem = q.all(
        "SELECT id, content, tags FROM memories WHERE content LIKE ? LIMIT ?", like, Math.min(limit, 20)
      );
      return { messages: msgs, memories: mem };
    },
  });
}
