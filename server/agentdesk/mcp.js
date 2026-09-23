import { spawn } from "node:child_process";

/**
 * Minimal MCP (Model Context Protocol) stdio client.
 * Speaks newline-delimited JSON-RPC 2.0 over a spawned child process.
 */
export class McpClient {
  #proc;
  #seq = 0;
  #pending = new Map();
  #buffer = "";
  #closed = false;

  constructor({ command, args = [], env = {} }) {
    // .cmd/.bat wrappers (npx.cmd on Windows) can't be exec'd directly.
    // Route through cmd.exe with every arg quoted instead of shell:true —
    // shell:true concatenates args unescaped (DEP0190, shell-injection
    // surface for the custom-MCP form).
    let file = command;
    let argv = args;
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
      file = process.env.COMSPEC || "cmd.exe";
      const quoted = [command, ...args].map((a) => `"${String(a).replace(/"/g, '""')}"`);
      argv = ["/d", "/s", "/c", `"${quoted.join(" ")}"`];
    }
    this.#proc = spawn(file, argv, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Without an 'error' listener a bad command (ENOENT) kills the process.
    this.#proc.on("error", (err) => this.#fail(err));
    this.#proc.stdout.on("data", (chunk) => this.#onData(chunk));
    this.#proc.on("exit", () => this.#fail(new Error("MCP server exited")));
    this.#proc.stderr.on("data", () => {}); // server logs ignored
  }

  #fail(err) {
    if (this.#closed) return;
    this.#closed = true;
    for (const { reject } of this.#pending.values()) reject(err);
    this.#pending.clear();
  }

  #onData(chunk) {
    this.#buffer += chunk.toString("utf8");
    let idx;
    while ((idx = this.#buffer.indexOf("\n")) >= 0) {
      const line = this.#buffer.slice(0, idx).trim();
      this.#buffer = this.#buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && this.#pending.has(msg.id)) {
        const { resolve, reject } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message ?? "MCP error"));
        else resolve(msg.result);
      }
    }
  }

  request(method, params = {}, timeoutMs = 30_000) {
    if (this.#closed) return Promise.reject(new Error("MCP client closed"));
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out`));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try {
        this.#proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      } catch (err) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(err);
      }
    });
  }

  notify(method, params = {}) {
    try { this.#proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"); }
    catch { /* process gone */ }
  }

  async connect() {
    const init = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agentdesk", version: "0.1.0" },
    });
    this.notify("notifications/initialized");
    return init;
  }

  async listTools() {
    const res = await this.request("tools/list");
    return res?.tools ?? [];
  }

  async callTool(name, args) {
    return this.request("tools/call", { name, arguments: args });
  }

  close() {
    this.#closed = true;
    try { this.#proc.kill(); } catch { /* already dead */ }
  }
}
