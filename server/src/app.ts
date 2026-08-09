import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { createApiRouter, type AppDeps } from "./routes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/dist/app.js -> ../../web/dist (the built dashboard). Only present in
// a production build where both packages were built into one deploy image —
// local dev serves the dashboard separately via `vite`.
const WEB_DIST_DIR = path.resolve(__dirname, "../../web/dist");

export function createApp(deps: AppDeps): Express {
  const app = express();

  // Behind Fly/Render/Railway-style reverse proxies, trust X-Forwarded-* so
  // req.protocol reflects the real (https) scheme, not the proxy's http hop.
  app.set("trust proxy", true);

  app.use(pinoHttp({ logger }));
  app.use((req, res, next) => {
    // Vite marks built <script type="module"> / <link> tags `crossorigin`,
    // which makes Chrome send an Origin header even for same-origin asset
    // requests. In the single-service deploy (dashboard + API served from
    // the same host), that's never actually cross-origin — compute the
    // request's own origin and allow it alongside the configured allowlist,
    // rather than requiring every deploy host to be listed manually.
    const selfOrigin = `${req.protocol}://${req.get("host")}`;
    cors({
      origin: (origin, callback) => {
        if (!origin || origin === selfOrigin || config.server.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
    })(req, res, next);
  });
  app.use(express.json());

  app.use("/api", createApiRouter(deps));

  if (existsSync(WEB_DIST_DIR)) {
    app.use(express.static(WEB_DIST_DIR));
    // SPA fallback: any non-API GET that doesn't match a static file goes to
    // index.html so client-side routing (React Router) resolves the path.
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(WEB_DIST_DIR, "index.html"));
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "[app] unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
