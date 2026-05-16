import type {
  Location,
  PassiveContext,
  PastOrder,
  UserProfile,
} from "@shared/types";

export const GEO_TIMEOUT_MS = 4000;

const FIELD_MAX_LEN = 80;
const RECENCY_DAYS_MAX = 365;

type TimeOfDayBucket =
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

// Defence-in-depth before the blurb flows into the model prompt: strip
// newlines and bound length. Profile fields are Zod-validated on read today,
// but Item 20's persona-edit UI will let users author these.
function sanitizeField(s: string, maxLen = FIELD_MAX_LEN): string {
  return s.replace(/[\r\n]+/g, " ").slice(0, maxLen);
}

function timeOfDayBucket(hour: number): TimeOfDayBucket {
  if (hour >= 5 && hour <= 10) return "morning";
  if (hour >= 11 && hour <= 13) return "midday";
  if (hour >= 14 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 21) return "evening";
  return "night";
}

function topCuisine(history: PastOrder[]): string | null {
  if (history.length === 0) return null;
  // Tie-breaking assumes history is most-recent-first (the seeded persona is).
  const counts = new Map<string, { count: number; firstSeenIndex: number }>();
  for (let i = 0; i < history.length; i++) {
    const cuisine = sanitizeField(history[i].cuisineCategory);
    const existing = counts.get(cuisine);
    if (existing) {
      existing.count++;
    } else {
      counts.set(cuisine, { count: 1, firstSeenIndex: i });
    }
  }
  let bestCuisine: string | null = null;
  let bestCount = 0;
  let bestFirstSeenIndex = Infinity;
  for (const [cuisine, { count, firstSeenIndex }] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && firstSeenIndex < bestFirstSeenIndex)
    ) {
      bestCuisine = cuisine;
      bestCount = count;
      bestFirstSeenIndex = firstSeenIndex;
    }
  }
  return bestCuisine;
}

function daysSince(lastOrderedAt: string, now: Date): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastOrderedAt);
  if (!match) return null;
  // Parse as local-day. `new Date("YYYY-MM-DD")` is parsed as UTC and can
  // flip the date near local midnight; the explicit `T00:00:00` form keeps
  // the comparison in the user's timezone.
  const last = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  if (Number.isNaN(last.getTime())) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rawDays = Math.floor(
    (startOfToday.getTime() - last.getTime()) / 86_400_000,
  );
  if (rawDays < 0) return null;
  const days = Math.min(rawDays, RECENCY_DAYS_MAX);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function getBrowserLocation(profile: UserProfile): Promise<Location> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(profile.location);
  }
  return new Promise<Location>((resolve) => {
    // Belt-and-suspenders against a WebView that ignores `timeout` and
    // never fires either callback. Cleared as soon as the API responds.
    const fallback = setTimeout(
      () => resolve(profile.location),
      GEO_TIMEOUT_MS + 1000,
    );
    const finish = (loc: Location) => {
      clearTimeout(fallback);
      resolve(loc);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Current location",
        }),
      () => finish(profile.location),
      {
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 5 * 60 * 1000,
        enableHighAccuracy: false,
      },
    );
  });
}

export function buildHistorySummary(profile: UserProfile, now: Date): string {
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const bucket = timeOfDayBucket(now.getHours());
  const parts: string[] = [`It is ${weekday} ${bucket}.`];

  if (profile.orderHistory.length > 0) {
    const top = topCuisine(profile.orderHistory);
    if (top) parts.push(`User most frequently orders ${top}.`);

    const recentNames = profile.orderHistory
      .slice(0, 3)
      .map((o) => sanitizeField(o.dishName))
      .join(", ");
    parts.push(`Recent orders: ${recentNames}.`);

    const recency = daysSince(profile.lastOrderedAt, now);
    if (recency !== null) parts.push(`Last ordered ${recency}.`);
  }

  return parts.join(" ");
}

export async function buildPassiveContext(
  profile: UserProfile,
): Promise<PassiveContext> {
  const now = new Date();
  const location = await getBrowserLocation(profile);
  return {
    time: now.toISOString(),
    location,
    historySummary: buildHistorySummary(profile, now),
  };
}
