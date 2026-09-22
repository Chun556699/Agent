import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const ROOT = resolve(__dirname, "..", "..");
export const WEB_DIST = join(ROOT, "web", "dist");

export const PORT = Number(process.env.AGENTDESK_PORT || 8787);
export const HOST = process.env.AGENTDESK_HOST || "127.0.0.1";

export const DATA_DIR =
  process.env.AGENTDESK_DATA_DIR || join(homedir(), ".agentdesk");

for (const dir of [DATA_DIR, join(DATA_DIR, "plugins"), join(DATA_DIR, "workspace")]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export const PLUGINS_DIR = join(DATA_DIR, "plugins");
export const WORKSPACE_DIR = join(DATA_DIR, "workspace");
export const DB_PATH = join(DATA_DIR, "agentdesk.db");
export const MASTER_KEY_PATH = join(DATA_DIR, ".master-key");
