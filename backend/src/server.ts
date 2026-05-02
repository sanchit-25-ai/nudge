import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
app.use("/api", healthRouter);

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
