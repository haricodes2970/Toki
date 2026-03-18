import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import path from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [
      react(),
      webExtension({
        manifest: "./manifest.json",
        // popup.html is already in manifest action.default_popup – don't list here.
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

    define: {
      // Ensures production logger strips console.log at build time
      // (import.meta.env.MODE is replaced with the string literal "production")
      __DEV__: isDev,
    },

    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: isDev ? "inline" : false,
      minify: isDev ? false : "esbuild",

      rollupOptions: {
        output: {
          // Deterministic chunk names (easier to audit CSP allowlists)
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },

    // WASM: js-tiktoken ships a .wasm binary that must not be processed by Vite
    optimizeDeps: {
      exclude: ["js-tiktoken"],
    },

    // Don't inline WASM as base64 – load it as a separate asset instead.
    // The extension CSP allows 'wasm-unsafe-eval' for the .wasm binary fetch.
    assetsInlineLimit: 0,
  };
});
