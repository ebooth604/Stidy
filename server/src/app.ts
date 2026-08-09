import cors from "cors";
import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { createApiRouter, type AppDeps } from "./routes/index.js";

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.server.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
    }),
  );
  app.use(express.json());

  app.use("/api", createApiRouter(deps));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "[app] unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
