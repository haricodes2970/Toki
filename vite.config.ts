import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    webExtension({
      manifest: "./manifest.json",
      // vite-plugin-web-extension handles multi-entry bundling:
      // background, content scripts, popup, dashboard – all in one pass.
      // popup.html is already declared in manifest action.default_popup – don't list it here.
      // Only list entries NOT referenced anywhere in manifest.json.
      additionalInputs: [
        "src/dashboard/dashboard.html",
      ],
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: mode === "development" ? "inline" : false,
    minify: mode === "production",

    rollupOptions: {
      // Prevent tiktoken WASM from being tree-shaken
      external: [],
    },
  },

  // Required for WASM (js-tiktoken ships a .wasm file)
  optimizeDeps: {
    exclude: ["js-tiktoken"],
  },

  // Inline WASM in the bundle so MV3 CSP is satisfied
  assetsInlineLimit: 0,
}));
