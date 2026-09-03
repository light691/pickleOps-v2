import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { openDb } from "./db.ts";
import type { AuthedContext } from "./middleware.ts";
import { createAuthRoutes } from "./routes/auth.ts";
import { createBookingRoutes } from "./routes/bookings.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env["PORT"] ?? 5173);
const isProd = process.env["NODE_ENV"] === "production";

const db = openDb();
const app = new Hono<AuthedContext>();
app.route("/", createAuthRoutes({ db }));
app.route("/", createBookingRoutes({ db }));
app.notFound((c) => c.json({ error: "Not found." }, 404));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Something went wrong." }, 500);
});

function readBody({ req }: { req: IncomingMessage }): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      parts.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(parts));
    });
    req.on("error", reject);
  });
}

async function toRequest({ req }: { req: IncomingMessage }): Promise<Request> {
  const host = req.headers.host ?? `localhost:${port}`;
  const url = `http://${host}${req.url ?? "/"}`;
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const body = await readBody({ req });
  if (body.length === 0) {
    return new Request(url, { method, headers });
  }
  const bytes = new Uint8Array(body.length);
  bytes.set(body);
  return new Request(url, { method, headers, body: bytes });
}

async function sendResponse({ res, response }: { res: ServerResponse; response: Response }): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function contentType({ file }: { file: string }): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".ico")) return "image/x-icon";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".woff")) return "font/woff";
  if (file.endsWith(".map")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function serveProdStatic({
  req,
  res,
  dist,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  dist: string;
}): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const candidate = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
  const relative = path.relative(dist, candidate);
  const inside = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (inside) {
    try {
      const body = await readFile(candidate);
      res.writeHead(200, { "content-type": contentType({ file: candidate }) });
      res.end(body);
      return true;
    } catch {
      // Fall through to the SPA fallback below.
    }
  }
  if (url.pathname.startsWith("/api/") || url.pathname.includes(".")) return false;
  try {
    const fallback = await readFile(path.join(dist, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fallback);
    return true;
  } catch {
    return false;
  }
}

async function startDev(): Promise<void> {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: "custom" });
  const template = await readFile(path.join(root, "index.html"), "utf8");
  const server = createHttpServer((req, res) => {
    handleDev({ req, res, template, vite }).catch((error: unknown) => {
      console.error(error);
      if (!res.writableEnded) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("Something went wrong.");
      }
    });
  });
  server.listen(port, () => {
    console.log(`PickleOps dev server on http://localhost:${port}`);
  });
}

interface DevDeps {
  req: IncomingMessage;
  res: ServerResponse;
  template: string;
  vite: { middlewares: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void; transformIndexHtml: (url: string, html: string) => Promise<string> };
}

async function handleDev({ req, res, template, vite }: DevDeps): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    await sendResponse({ res, response: await app.fetch(await toRequest({ req })) });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    vite.middlewares(req, res, (error?: unknown) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
  if (res.writableEnded) return;
  const html = await vite.transformIndexHtml(url.pathname, template);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

async function startProd(): Promise<void> {
  const dist = path.join(root, "dist", "client");
  const server = createHttpServer((req, res) => {
    handleProd({ req, res, dist }).catch((error: unknown) => {
      console.error(error);
      if (!res.writableEnded) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("Something went wrong.");
      }
    });
  });
  server.listen(port, () => {
    console.log(`PickleOps server on http://localhost:${port}`);
  });
}

async function handleProd({
  req,
  res,
  dist,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  dist: string;
}): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    await sendResponse({ res, response: await app.fetch(await toRequest({ req })) });
    return;
  }
  const served = await serveProdStatic({ req, res, dist });
  if (!served) {
    await sendResponse({ res, response: new Response("Not found.", { status: 404 }) });
  }
}

if (isProd) {
  await startProd();
} else {
  await startDev();
}
