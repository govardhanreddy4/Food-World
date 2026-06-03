/**
 * vite.config.js
 * --------------
 * Vite build configuration for the Food World Restaurant App.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    open: false,
    // Allow connections from any host in local network (for testing on phones)
    host: true,
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    // Chunk splitting for better caching of large dependencies
    rollupOptions: {
      output: {
        // Function form required by Rollup 4+ / Vite 6+
        manualChunks(id) {
          if (id.includes("firebase")) return "firebase";
          if (id.includes("react-router-dom")) return "react-router";
          if (id.includes("react") || id.includes("react-dom")) return "react";
          if (id.includes("qrcode")) return "qrcode";
        },
      },
    },
  },
});
