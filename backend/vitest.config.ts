import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Node is the default Vitest environment — explicit here for clarity.
    environment: "node",
  },
});
