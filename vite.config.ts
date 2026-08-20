import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/oprosnik-kettella-16pf/",
  plugins: [react()],
});
