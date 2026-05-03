import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Gzip/deflate all responses — biggest single perf win
app.use(compression());

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
// In production the frontend is served from the same origin, so CORS is
// only needed for the Vite dev server (localhost / Replit preview URL).
if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: true, credentials: true }));
} else {
  // Allow same-origin only; restrict to explicit FRONTEND_URL if provided.
  const allowed = process.env["FRONTEND_URL"] ? [process.env["FRONTEND_URL"]] : [];
  if (allowed.length > 0) {
    app.use(cors({ origin: allowed, credentials: true }));
  }
  // If no FRONTEND_URL set in prod, no wildcard CORS is added at all.
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const frontendPath = join(__dirname, "../../am-cinema/dist/public");
  if (existsSync(frontendPath)) {
    // Hashed assets (JS/CSS) → 1 year cache; HTML → no-cache
    app.use(express.static(frontendPath, {
      maxAge: "1y",
      immutable: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    }));
    app.get("/{*path}", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(join(frontendPath, "index.html"));
    });
  }
}

export default app;
