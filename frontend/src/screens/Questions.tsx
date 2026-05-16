import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  Dish,
  HungerLevel,
  RecommendRequest,
} from "@shared/types";
import { ensureProfile } from "../lib/profile";
import { buildPassiveContext } from "../lib/passiveContext";
import { buildProfileSignal } from "../lib/profileSignal";
import { postRecommend, RecommendApiError } from "../lib/recommend";

type View =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success"; dishes: Dish[]; requestId: string }
  | { state: "error"; message: string };

const OPTIONS: { code: HungerLevel; label: string }[] = [
  { code: "light-snack", label: "Light snack" },
  { code: "regular-meal", label: "Regular meal" },
  { code: "very-hungry", label: "Very hungry" },
];

const ARROW_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

function pillClass(selected: boolean): string {
  const base =
    "min-h-11 min-w-11 px-4 rounded-full font-medium border transition-colors";
  return selected
    ? `${base} bg-primary text-white border-primary`
    : `${base} bg-surface-warm text-text-primary border-border`;
}

export default function Questions() {
  const [hunger, setHunger] = useState<HungerLevel | null>(null);
  const [view, setView] = useState<View>({ state: "idle" });
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleGroupKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!ARROW_KEYS.has(e.key)) return;
    e.preventDefault();
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    // WAI-ARIA radio pattern: arrows move focus + selection together,
    // anchored on the currently focused pill. Fall back to the selected
    // pill (or to the edge of the list) if focus isn't on a pill yet.
    let anchor = pillRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    if (anchor === -1 && hunger) {
      anchor = OPTIONS.findIndex((o) => o.code === hunger);
    }
    const next =
      anchor === -1
        ? forward
          ? 0
          : OPTIONS.length - 1
        : (anchor + (forward ? 1 : -1) + OPTIONS.length) % OPTIONS.length;
    setHunger(OPTIONS[next].code);
    pillRefs.current[next]?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hunger || view.state === "loading") return;
    setView({ state: "loading" });
    const profile = ensureProfile();
    const req: RecommendRequest = {
      answers: { q1: hunger },
      passiveContext: await buildPassiveContext(profile),
      profileSignal: buildProfileSignal(profile),
    };
    try {
      const res = await postRecommend(req);
      setView({
        state: "success",
        dishes: res.dishes,
        requestId: res.requestId,
      });
    } catch (err) {
      const message =
        err instanceof RecommendApiError ? err.message : "Something went wrong.";
      setView({ state: "error", message });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-[390px] min-h-screen flex flex-col px-4 py-6"
    >
      <h1 className="text-xl font-semibold text-text-primary">
        How hungry are you?
      </h1>

      <div
        role="radiogroup"
        aria-label="Hunger level"
        onKeyDown={handleGroupKeyDown}
        className="mt-6 flex flex-wrap gap-2"
      >
        {OPTIONS.map((opt, i) => {
          const selected = hunger === opt.code;
          const isFirst = opt.code === OPTIONS[0].code;
          return (
            <button
              key={opt.code}
              ref={(el) => {
                pillRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!hunger && isFirst) ? 0 : -1}
              onClick={() => setHunger(opt.code)}
              className={pillClass(selected)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {view.state === "loading" && (
        <div
          role="status"
          aria-label="Loading"
          className="mt-8 self-center h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
        />
      )}

      {view.state === "success" && (
        <div className="mt-8">
          <p className="text-text-primary">
            Received {view.dishes.length} dishes.
          </p>
          <pre className="mt-2 text-2xs text-text-secondary overflow-auto">
            {JSON.stringify(view.dishes, null, 2)}
          </pre>
        </div>
      )}

      {view.state === "error" && (
        <div className="mt-8">
          <p className="text-text-primary">{view.message}</p>
          <button
            type="button"
            onClick={() => setView({ state: "idle" })}
            className="mt-2 min-h-11 px-4 rounded-card border border-border text-text-primary"
          >
            Try again
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={!hunger || view.state === "loading"}
        className="mt-auto h-13 rounded-card bg-primary text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Find my meal
      </button>
    </form>
  );
}
