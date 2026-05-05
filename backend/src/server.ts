import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { recommendRouter } from "./routes/recommend";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// Structured request logger — one JSON line per request on res.finish.
// Metadata only: no headers, no body. Keeps PII / future prompts out of logs.
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const method = req.method;
  // req.path is the URL path without query string — query strings can carry
  // sensitive values (tokens, etc.) so we deliberately exclude them from logs.
  const path = req.path;
  res.on("finish", () => {
    const line: Record<string, unknown> = {
      t: new Date().toISOString(),
      requestId: (res.locals.requestId as string | undefined) ?? null,
      method,
      path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    };
    if (res.statusCode === 400) line.validation = "failed";
    else if (res.statusCode >= 200 && res.statusCode < 300) line.validation = "ok";
    else line.validation = "n/a";
    console.log(JSON.stringify(line));
  });
  next();
}

app.use(cors({ origin: "http://localhost:5173" }));
app.use(requestLogger);
app.use(express.json({ limit: "32kb" }));
app.use("/api", healthRouter);
app.use("/api", recommendRouter);

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
