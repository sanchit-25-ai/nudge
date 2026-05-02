import { useEffect, useState } from "react";
import type { HealthResponse } from "@shared/types";

export default function App() {
  const [status, setStatus] = useState<string>("…");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-lg text-text-primary">Backend: {status}</p>
      <span className="inline-block h-3 w-3 rounded-full bg-primary" aria-hidden />
    </div>
  );
}
