import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Monorepo'da duplicate React / Zustand instance hatasını önler
    dedupe: ['react', 'react-dom', 'zustand'],
    alias: {
      // Vite TypeScript kaynak dosyalarını doğrudan kullanır (dist gerekmez)
      "@sonaralabs/types":               path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@sonaralabs/daw-studio/src/index.css": path.resolve(__dirname, "../../packages/daw-studio/src/index.css"),
      "@sonaralabs/daw-studio":          path.resolve(__dirname, "../../packages/daw-studio/src/index.ts"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'router': ['react-router-dom'],
          'daw': ['@sonaralabs/daw-studio'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5174,
    fs: { allow: [".."] },
    proxy: {
      "/api": {
        // VITE_PROXY_TARGET: Docker-internal gateway (container-to-container).
        // VITE_API_BASE_URL: fallback for local dev (host-side gateway on :3000).
        target: process.env.VITE_PROXY_TARGET || process.env.VITE_API_BASE_URL || "http://localhost:3000",
        changeOrigin: true,
        // SSE (Server-Sent Events) için: yanıtı buffer'lamadan doğrudan ilet
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            // SSE stream'lerini flush etmeden tut
            if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache";
              proxyRes.headers["connection"]    = "keep-alive";
            }
          });
        },
      },
    },
  },
});
