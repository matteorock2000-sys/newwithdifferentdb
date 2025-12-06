import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals();

export default defineConfig({
  plugins: [
    remix({
      build: {
        // Relying on the adapter to handle function naming and routing automatically
        server: {
          adapter: "@remix-run/netlify",
        },
      },
    }),
    tsconfigPaths(),
  ],
});
