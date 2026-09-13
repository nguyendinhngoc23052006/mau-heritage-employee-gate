import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Declared locally rather than pulling in @types/node for two reads: this file
// runs in Node at build time, so `process` exists — only its type is missing.
declare const process: { env: Record<string, string | undefined> };

// Cloudflare Pages sets CF_PAGES_COMMIT_SHA on every build. Baking it in is what
// makes "is my fix actually deployed?" a one-glance question instead of an
// investigation — this build stamp exists because answering that once took a
// full source audit that could not reach the deployed bundle.
const buildSha = (
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "dev"
).slice(0, 7);

export default defineConfig({
  envPrefix: ["VITE_"],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      // A tab left open keeps running the bundle it loaded, forever. That is
      // how a shipped fix can look un-shipped: the page still throws the bug
      // that main no longer contains. version.json is the one file a running
      // tab can cheaply re-read to notice it is behind.
      name: "emit-build-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ build: buildSha }),
        });
      },
    },
  ],
});
