import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    plugin: "src/plugin.d.ts"
  },
  format: ["cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
