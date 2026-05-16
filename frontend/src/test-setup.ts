import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react auto-registers cleanup via `afterEach` at import
// time, but only if `afterEach` is a global. This project's vitest config
// doesn't set `globals: true` (tests import vitest primitives explicitly),
// so we register cleanup ourselves once, here.
afterEach(() => {
  cleanup();
});
