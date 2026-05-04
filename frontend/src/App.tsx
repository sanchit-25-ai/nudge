import { useEffect, useState } from "react";
import type { HealthResponse, UserProfile } from "@shared/types";
import { ensureProfile, resetAndReload } from "./lib/profile";

export default function App() {
  const [status, setStatus] = useState<string>("…");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    setProfile(ensureProfile());
  }, []);

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
      {profile && (
        <p className="text-sm text-text-secondary">
          {profile.userId} · {profile.location.label} · {profile.dietaryPattern}
        </p>
      )}
      <button
        type="button"
        onClick={resetAndReload}
        className="h-11 min-w-11 px-4 rounded-card border border-border text-sm text-text-primary"
      >
        Reset profile
      </button>
    </div>
  );
}
