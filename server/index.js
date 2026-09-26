import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { boot, createApi } from "./agentdesk/api.js";
import { HOST, PORT, WEB_DIST } from "./agentdesk/config.js";
import { createStaticHandler, json, securityHeaders } from "./agentdesk/http.js";

await boot();

const api = createApi();
const serveStatic = createStaticHandler(WEB_DIST);
const hasDist = existsSync(WEB_DIST);

const server = createServer(async (req, res) => {
  securityHeaders(res);
  try {
    if ((await api.handle(req, res)) === "handled") return;
    if (hasDist && (req.method === "GET" || req.method === "HEAD") && serveStatic(req, res)) return;
    if (!hasDist && req.url === "/") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(
        "AgentDesk API is running. Frontend not built yet — run `npm --prefix web run build` or `npm --prefix web run dev`."
      );
      return;
    }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[server]", err);
    if (!res.headersSent) json(res, 500, { error: "Internal error" });
    else if (!res.writableEnded) res.end();
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[server] port ${PORT} is already in use — is another AgentDesk running?`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`AgentDesk listening on http://${HOST}:${PORT}`);
  console.log(`API docs: http://${HOST}:${PORT}/api/health`);
});
