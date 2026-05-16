import { useEffect } from "react";
import { ensureProfile, resetAndReload } from "./lib/profile";
import Questions from "./screens/Questions";

export default function App() {
  useEffect(() => {
    ensureProfile();
  }, []);

  return (
    <>
      <Questions />
      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={resetAndReload}
          className="fixed bottom-2 right-2 h-11 px-3 rounded-card border border-border bg-white text-2xs text-text-secondary"
        >
          Reset profile
        </button>
      )}
    </>
  );
}
