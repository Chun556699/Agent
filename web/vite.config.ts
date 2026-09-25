import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor deps out of the app chunk so app code changes
        // don't invalidate their cache entry (and streams parse faster).
        manualChunks: {
          react: ["react", "react-dom", "radix-ui"],
          markdown: ["react-markdown", "react-syntax-highlighter"],
          icons: ["lucide-react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
