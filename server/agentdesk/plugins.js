import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGINS_DIR, ROOT, WORKSPACE_DIR } from "./config.js";
import { q } from "./db.js";
import { HttpError } from "./http.js";
import { McpClient } from "./mcp.js";
import { getTool, registerTool, unregisterTools } from "./tools/index.js";

/**
 * Plugin marketplace catalog. kind:
 *  - "module": a JS module exporting { name, tools: [{name, description,
 *    parameters, danger, handler}] }. Bundled ones live in repo `plugins/`;
 *    user-dropped ones live in ~/.agentdesk/plugins/.
 *  - "mcp": an MCP stdio server spec { command, args, env }.
 */
export const MARKETPLACE = [
  {
    id: "weather", kind: "module", name: "Weather", version: "1.0.0",
    description: "Current conditions and forecasts via Open-Meteo. No API key required.",
    author: "AgentDesk", tags: ["data", "no-key"],
    tools: ["weather_current", "weather_forecast"],
  },
  {
    id: "web-search", kind: "module", name: "Web Search", version: "1.0.0",
    description: "DuckDuckGo lite HTML search — results with titles, links and snippets. No API key.",
    author: "AgentDesk", tags: ["search", "no-key"],
    tools: ["web_search"],
  },
  {
    id: "github", kind: "module", name: "GitHub", version: "1.0.0",
    description: "Repos, issues and PRs via the GitHub REST API. Uses env GITHUB_TOKEN when present (read-only).",
    author: "AgentDesk", tags: ["dev"],
    tools: ["github_get_repo", "github_list_issues", "github_get_file"],
  },
  {
    id: "mcp-filesystem", kind: "mcp", name: "MCP Filesystem", version: "1.0.0",
    description: "Official MCP filesystem server, sandboxed to the agent workspace (requires npx).",
    author: "Model Context Protocol", tags: ["mcp", "files"],
    spec: {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", WORKSPACE_DIR],
    },
  },
  {
    id: "mcp-memory", kind: "mcp", name: "MCP Memory", version: "1.0.0",
    description: "Official MCP memory/knowledge-graph server for persistent agent memory (requires npx).",
    author: "Model Context Protocol", tags: ["mcp", "memory"],
    spec: {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    },
  },
];

const mcpClients = new Map(); // pluginId -> McpClient

function modulePath(id) {
  // The id becomes a filename — reject separators/traversal so a crafted id
  // can't import an arbitrary .mjs from outside the plugin directories.
  if (!/^[\w][\w.-]*$/.test(id)) throw new HttpError(400, `Invalid plugin id '${id}'`);
  const bundled = join(ROOT, "plugins", `${id}.mjs`);
  if (existsSync(bundled)) return bundled;
  const local = join(PLUGINS_DIR, `${id}.mjs`);
  if (existsSync(local)) return local;
  throw new HttpError(404, `Plugin module '${id}' not found (looked in plugins/ and ${PLUGINS_DIR})`);
}

/** Load a plugin's tools into the registry. */
export async function activatePlugin(id) {
  const row = q.get("SELECT * FROM plugins WHERE id = ?", id);
  if (!row) throw new HttpError(404, `Plugin '${id}' is not installed`);
  const spec = JSON.parse(row.spec_json || "{}");

  if (row.kind === "mcp") {
    // Re-activation replaces the old client — kill it first or the
    // spawned server process leaks each time the plugin is toggled.
    if (mcpClients.has(id)) await deactivatePlugin(id);
    const client = new McpClient(spec);
    let tools;
    try {
      await client.connect();
      tools = await client.listTools();
    } catch (err) {
      // A failed handshake still spawned a process — reap it.
      client.close();
      throw err;
    }
    mcpClients.set(id, client);
    for (const t of tools) {
      registerTool({
        name: `${id}:${t.name}`,
        description: `[MCP ${id}] ${t.description ?? ""}`,
        parameters: t.inputSchema ?? { type: "object", properties: {} },
        danger: "confirm",
        handler: async (args) => client.callTool(t.name, args),
      });
    }
    return tools.map((t) => `${id}:${t.name}`);
  }

  const mod = await import(pathToFileURL(modulePath(id)).href);
  const plugin = mod.default ?? mod;
  for (const t of plugin.tools ?? []) {
    const existing = getTool(t.name);
    // Same-plugin re-activation is idempotent; another owner is a conflict.
    if (existing && existing.pluginId !== id) {
      throw new HttpError(409, `Tool '${t.name}' is already registered`);
    }
    if (existing) continue;
    registerTool({
      name: t.name,
      description: t.description ?? "",
      parameters: t.parameters ?? { type: "object", properties: {} },
      danger: t.danger ?? "confirm",
      pluginId: id,
      handler: (args, ctx) => t.handler(args, ctx),
    });
  }
  return (plugin.tools ?? []).map((t) => t.name);
}

export async function deactivatePlugin(id) {
  const row = q.get("SELECT * FROM plugins WHERE id = ?", id);
  if (!row) return;
  const spec = JSON.parse(row.spec_json || "{}");
  if (row.kind === "mcp") {
    mcpClients.get(id)?.close();
    mcpClients.delete(id);
    // MCP tools were registered with the `<id>:` prefix
    unregisterTools(`${id}:`);
  } else {
    try {
      const mod = await import(pathToFileURL(modulePath(id)).href);
      const plugin = mod.default ?? mod;
      for (const t of plugin.tools ?? []) unregisterTools(t.name);
    } catch { /* module file gone */ }
  }
}

export async function installPlugin(id) {
  const entry = MARKETPLACE.find((e) => e.id === id);
  const isLocalModule = existsSync(join(PLUGINS_DIR, `${id}.mjs`));
  if (!entry && !isLocalModule) throw new HttpError(404, `No marketplace entry or local module named '${id}'`);
  // Insert disabled, activate, then mark enabled — a failed activation
  // must not leave a ghost 'Enabled' row that boot retries forever.
  q.run(
    `INSERT INTO plugins (id, name, kind, spec_json, enabled)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET spec_json = excluded.spec_json`,
    id,
    entry?.name ?? id,
    entry?.kind ?? "module",
    JSON.stringify(entry?.spec ?? {})
  );
  try {
    const tools = await activatePlugin(id);
    q.run("UPDATE plugins SET enabled = 1 WHERE id = ?", id);
    return tools;
  } catch (err) {
    q.run("DELETE FROM plugins WHERE id = ?", id);
    throw err;
  }
}

export async function uninstallPlugin(id) {
  await deactivatePlugin(id);
  q.run("DELETE FROM plugins WHERE id = ?", id);
}

export async function setPluginEnabled(id, enabled) {
  if (enabled) await activatePlugin(id);
  else await deactivatePlugin(id);
  q.run("UPDATE plugins SET enabled = ? WHERE id = ?", enabled ? 1 : 0, id);
}

export function listInstalledPlugins() {
  return q.all("SELECT * FROM plugins ORDER BY installed_at").map((r) => ({
    id: r.id, name: r.name, kind: r.kind, enabled: !!r.enabled, installedAt: r.installed_at,
  }));
}

export function listLocalModules() {
  if (!existsSync(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => f.replace(/\.mjs$/, ""));
}

/** Activate every enabled installed plugin at boot (failures are logged, not fatal). */
export async function activateInstalledPlugins() {
  for (const p of listInstalledPlugins()) {
    if (!p.enabled) continue;
    try { await activatePlugin(p.id); }
    catch (err) { console.error(`[plugins] failed to activate '${p.id}':`, err.message); }
  }
}
