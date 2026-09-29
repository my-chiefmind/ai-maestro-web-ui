// Vite config for the ai-maestro-web-ui SPA. Built once (`npm run build`) into ui/dist, which the
// published tarball ships; react/react-dom/vite are devDependencies only.
// MWU_API is dev/preview only: it points the vite proxy at a running ai-maestro-web-ui server.
// In production the package server serves ui/dist itself, so the UI calls /api same-origin.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const api = process.env.MWU_API ?? "http://127.0.0.1:3021";

// Third-party code gets its own long-cached chunks — React, and the Markdown renderer
// (react-markdown + remark-gfm and their unified/micromark tree) — so no chunk crosses
// Vite's 500 kB warning and an app-only change doesn't re-download the libraries.
const REACT = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/;
function vendorChunk(id) {
  if (!id.includes("node_modules")) return undefined;
  return REACT.test(id) ? "react" : "markdown";
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/",
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist", emptyOutDir: true, sourcemap: false, target: "es2020",
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  server: { proxy: { "/api": { target: api } } },
  preview: { proxy: { "/api": { target: api } } },
});
