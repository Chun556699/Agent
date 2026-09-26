import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export function json(res, status, body) {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

export function sse(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(": connected\n\n");
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
  };
  return { send, close: () => res.end() };
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    routes.push({
      method,
      segments: pattern.split("/").filter(Boolean),
      handler,
    });
  };

  const match = (method, pathname) => {
    const parts = pathname.split("/").filter(Boolean);
    for (const route of routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) { ok = false; break; }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > 10 * 1024 * 1024) {
          reject(new HttpError(413, "Body too large"));
          req.destroy();
        } else chunks.push(c);
      });
      req.on("end", () => {
        if (!chunks.length) return resolve(undefined);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new HttpError(400, "Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });

  return {
    get: (p, h) => add("GET", p, h),
    post: (p, h) => add("POST", p, h),
    put: (p, h) => add("PUT", p, h),
    patch: (p, h) => add("PATCH", p, h),
    delete: (p, h) => add("DELETE", p, h),
    /** @returns {Promise<"handled"|"miss">} */
    async handle(req, res) {
      const url = new URL(req.url, "http://localhost");
      const m = match(req.method, url.pathname);
      if (!m) return "miss";
      const ctx = { req, res, params: m.params, query: url.searchParams };
      ctx.body = await readBody(req);
      try {
        const result = await m.handler(ctx);
        // Handlers that write headers themselves (SSE, streams) own the
        // response — don't write a JSON body or force-close them.
        if (!res.headersSent) json(res, 200, result);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        if (!res.headersSent) {
          json(res, status, {
            error: err.message || "Internal error",
            details: err.details,
          });
        } else if (!res.writableEnded) {
          res.end();
        }
        if (status === 500) console.error("[api]", err);
      }
      return "handled";
    },
  };
}

export function createStaticHandler(rootDir) {
  const root = normalize(rootDir);
  return (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    let file = normalize(join(root, pathname));
    // Prefix must include the separator — otherwise "../root-evil/x" style
    // siblings sharing the root's name prefix would slip through.
    if (file !== root && !file.startsWith(root + sep)) return false;
    if (!existsSync(file) || !statSync(file).isFile()) {
      // SPA fallback
      file = join(root, "index.html");
      if (!existsSync(file)) return false;
    }
    const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "content-length": statSync(file).size,
      "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    });
    if (req.method === "HEAD") { res.end(); return true; }
    createReadStream(file).pipe(res);
    return true;
  };
}

export function securityHeaders(res, { allowInline = false } = {}) {
  const scriptSrc = allowInline ? "'self' 'unsafe-inline'" : "'self'";
  res.setHeader(
    "content-security-policy",
    `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`
  );
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
}
