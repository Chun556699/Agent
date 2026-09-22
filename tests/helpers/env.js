// Must be imported before any agentdesk module: config.js reads env at load time.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.AGENTDESK_DATA_DIR) {
  process.env.AGENTDESK_DATA_DIR = mkdtempSync(join(tmpdir(), "agentdesk-test-"));
}
