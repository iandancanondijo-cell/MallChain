import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5176,
    host: "0.0.0.0",
    cors: {
      origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5176", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5176"],
      credentials: true,
    },
  },
});
