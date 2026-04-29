import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api", router);

// In production, serve the built React frontend (study-ai) as static files,
// with SPA fallback to index.html for client-side routing.
const staticDir =
  process.env.STATIC_DIR ??
  path.resolve(process.cwd(), "artifacts/study-ai/dist/public");

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir, { index: false }));

  app.get(/.*/, (req: Request, res: Response, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });

  logger.info({ staticDir }, "Serving frontend static files");
}

export default app;
