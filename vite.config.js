import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "mindar-image-three": path.resolve(__dirname, "node_modules/mind-ar/dist/mindar-image-three.prod.js"),
    },
  },
});
