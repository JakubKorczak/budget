import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// https://vite.dev/config/
export default defineConfig(() => {
  const enableAnalyzer = process.env.ANALYZE === "true";

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(enableAnalyzer
        ? [
            visualizer({
              filename: "dist/bundle-report.html",
              gzipSize: true,
              brotliSize: true,
              template: "treemap",
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      reportCompressedSize: true,
      chunkSizeWarningLimit: 800,
    },
  };
});
