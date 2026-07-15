import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative base so built asset URLs resolve wherever the site is served from.
  // GitHub project Pages serves this repo at /<repo>/ (currently /sentinel/); a
  // relative base plus HashRouter works at any sub-path, so a future repo rename
  // (this repo has already been renamed once) won't 404 the JS/CSS.
  base: "./",
  build: {
    outDir: "dist",
  },
});
