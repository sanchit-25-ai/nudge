import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  Dish,
  HungerLevel,
  MealType,
  Q3Constraint,
  RecommendAnswers,
  RecommendRequest,
} from "@shared/types";
import { ensureProfile, saveProfile } from "../lib/profile";
import { buildPassiveContext } from "../lib/passiveContext";
import { buildProfileSignal } from "../lib/profileSignal";
import { postRecommend, RecommendApiError } from "../lib/recommend";
import DishCard from "../components/DishCard";
import Pill from "../components/Pill";

type View =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success"; dishes: Dish[]; requestId: string }
  | { state: "error"; message: string };

const Q1_OPTIONS: { code: HungerLevel; label: string }[] = [
  { code: "light-snack", label: "Light snack" },
  { code: "regular-meal", label: "Regular meal" },
  { code: "very-hungry", label: "Very hungry" },
];

const Q2_OPTIONS: { code: MealType; label: string }[] = [
  { code: "comfort-favourite", label: "Comfort favourite" },
  { code: "healthy", label: "Healthy" },
  { code: "indulgent", label: "Indulgent" },
  { code: "surprise-me", label: "Surprise me" },
];

const Q3_OPTIONS: { code: Q3Constraint; label: string }[] = [
  { code: "veg-only", label: "Veg only" },
  { code: "fast-delivery", label: "Fast delivery" },
  { code: "budget", label: "Budget" },
  { code: "high-rated", label: "High-rated" },
];

const ARROW_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

const Q3_SKIP_COLLAPSE_THRESHOLD = 3;
const PARTY_SIZE_DEFAULT = 2;
const PARTY_SIZE_MIN = 1;
const PARTY_SIZE_MAX = 10;

// WAI-ARIA radio pattern: arrows move focus + selection together within the
// group, anchored on the currently focused pill. Falls back to the selected
// pill (or the edge of the list) when focus is not yet on a pill. Q1 and Q2
// each own their own ref array so arrow keys don't cross groups.
function useRadioArrowHandler<T extends string>(
  options: readonly { code: T }[],
  current: T | null,
  setCurrent: (code: T) => void,
  refs: React.MutableRefObject<(HTMLButtonElement | null)[]>,
) {
  return useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!ARROW_KEYS.has(e.key)) return;
      e.preventDefault();
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      let anchor = refs.current.findIndex(
        (el) => el === document.activeElement,
      );
      if (anchor === -1 && current) {
        anchor = options.findIndex((o) => o.code === current);
      }
      const next =
        anchor === -1
          ? forward
            ? 0
            : options.length - 1
          : (anchor + (forward ? 1 : -1) + options.length) % options.length;
      const nextOption = options[next];
      if (!nextOption) return;
      setCurrent(nextOption.code);
      refs.current[next]?.focus();
    },
    [options, current, setCurrent, refs],
  );
}

export default function Questions() {
  // Stable profile snapshot for the lifetime of this mount. ensureProfile()
  // already ran in App.tsx; this is a cheap re-read of the same localStorage
  // slot used by the lazy initialiser for Q3 (veg auto-select) and by the
  // skip-count write on submit.
  const profile = useMemo(() => ensureProfile(), []);
  const showQ3 = profile.q3SkipCount < Q3_SKIP_COLLAPSE_THRESHOLD;

  const [hunger, setHunger] = useState<HungerLevel | null>(null);
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [q3, setQ3] = useState<Q3Constraint[]>(() =>
    showQ3 && profile.dietaryPattern === "veg" ? ["veg-only"] : [],
  );
  const [partySize, setPartySize] = useState<number>(PARTY_SIZE_DEFAULT);
  const [view, setView] = useState<View>({ state: "idle" });

  const q1Refs = useRef<(HTMLButtonElement | null)[]>([]);
  const q2Refs = useRef<(HTMLButtonElement | null)[]>([]);
  // One-shot guard: ensures retry-after-error within the same mount doesn't
  // double-increment the skip counter. A single user intent = a single skip.
  const didCountSkipRef = useRef(false);

  const onQ1KeyDown = useRadioArrowHandler(Q1_OPTIONS, hunger, setHunger, q1Refs);
  const onQ2KeyDown = useRadioArrowHandler(Q2_OPTIONS, mealType, setMealType, q2Refs);

  function toggleQ3(code: Q3Constraint) {
    // Synchronous click handler — q3 here is the current state, not stale.
    // Keep the setState updater pure (Strict Mode double-invocation safe) by
    // doing the partySize reset outside the setQ3 call.
    const wasSelected = q3.includes(code);
    setQ3(wasSelected ? q3.filter((c) => c !== code) : [...q3, code]);
    // Deselecting budget resets the stepper so re-selecting starts at the
    // default rather than the user's last value.
    if (code === "budget" && wasSelected) setPartySize(PARTY_SIZE_DEFAULT);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hunger || view.state === "loading") return;
    setView({ state: "loading" });

    const answers: RecommendAnswers = { q1: hunger };
    if (mealType) answers.q2 = mealType;
    if (q3.length > 0) answers.q3 = q3;
    if (q3.includes("budget")) answers.partySize = partySize;

    const req: RecommendRequest = {
      answers,
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

    // Operational definition of "skip": Q3 was actually shown and the user
    // submitted with zero chips selected. Runs once per mount regardless of
    // retry-after-error path.
    if (!didCountSkipRef.current && showQ3 && q3.length === 0) {
      didCountSkipRef.current = true;
      saveProfile({ ...profile, q3SkipCount: profile.q3SkipCount + 1 });
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
        onKeyDown={onQ1KeyDown}
        className="mt-6 flex flex-wrap gap-2"
      >
        {Q1_OPTIONS.map((opt, i) => {
          const selected = hunger === opt.code;
          const isFirst = i === 0;
          return (
            <Pill
              key={opt.code}
              selected={selected}
              onClick={() => setHunger(opt.code)}
              tabIndex={selected || (!hunger && isFirst) ? 0 : -1}
              refCallback={(el) => {
                q1Refs.current[i] = el;
              }}
            >
              {opt.label}
            </Pill>
          );
        })}
      </div>

      <h2 className="mt-8 text-xl font-semibold text-text-primary">
        What kind of meal?
      </h2>
      <div
        role="radiogroup"
        aria-label="Meal type"
        onKeyDown={onQ2KeyDown}
        className="mt-6 flex flex-wrap gap-2"
      >
        {Q2_OPTIONS.map((opt, i) => {
          const selected = mealType === opt.code;
          const isFirst = i === 0;
          return (
            <Pill
              key={opt.code}
              selected={selected}
              onClick={() => setMealType(opt.code)}
              tabIndex={selected || (!mealType && isFirst) ? 0 : -1}
              refCallback={(el) => {
                q2Refs.current[i] = el;
              }}
            >
              {opt.label}
            </Pill>
          );
        })}
      </div>

      {showQ3 && (
        <>
          <h2 className="mt-8 text-xl font-semibold text-text-primary">
            Any constraints?
          </h2>
          <div
            role="group"
            aria-label="Constraints"
            className="mt-6 flex flex-wrap gap-2"
          >
            {Q3_OPTIONS.map((opt) => {
              const selected = q3.includes(opt.code);
              return (
                <Pill
                  key={opt.code}
                  selected={selected}
                  onClick={() => toggleQ3(opt.code)}
                  role="checkbox"
                >
                  {opt.label}
                </Pill>
              );
            })}
          </div>

          {q3.includes("budget") && (
            <>
              <h3 className="mt-6 text-base font-medium text-text-primary">
                How many people?
              </h3>
              <div
                className="mt-3 flex items-center gap-3"
                aria-label="Party size"
              >
                <button
                  type="button"
                  onClick={() =>
                    setPartySize((n) => Math.max(PARTY_SIZE_MIN, n - 1))
                  }
                  disabled={partySize <= PARTY_SIZE_MIN}
                  aria-label="Decrease party size"
                  className="h-11 w-11 rounded-card border border-border bg-surface-warm text-text-primary text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span
                  aria-live="polite"
                  className="min-w-8 text-center text-text-primary font-medium"
                >
                  {partySize}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPartySize((n) => Math.min(PARTY_SIZE_MAX, n + 1))
                  }
                  disabled={partySize >= PARTY_SIZE_MAX}
                  aria-label="Increase party size"
                  className="h-11 w-11 rounded-card border border-border bg-surface-warm text-text-primary text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </>
          )}
        </>
      )}

      {view.state === "loading" && (
        <div
          role="status"
          aria-label="Loading"
          className="mt-8 self-center h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
        />
      )}

      {view.state === "success" && view.dishes[0] && (
        <div className="mt-8">
          <p className="text-text-primary">Here's what I'd order:</p>
          <div className="mt-3">
            <DishCard dish={view.dishes[0]} />
          </div>
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
