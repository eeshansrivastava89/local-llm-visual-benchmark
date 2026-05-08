import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "static",
  devToolbar: {
    enabled: false
  },
  adapter: node({
    mode: "standalone"
  }),
  vite: {
    plugins: [tailwindcss()]
  }
});
