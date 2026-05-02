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
    <div className="min-h-screen flex items-center justify-center font-sans">
      <p className="text-lg">Backend: {status}</p>
    </div>
  );
}
