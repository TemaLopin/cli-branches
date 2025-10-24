import { build } from "esbuild";

build({
  entryPoints: ["./index.ts"],
  bundle: true,
  platform: "node",
  target: "node16",
  outfile: "dist/index.js",
  sourcemap: false,
  minify: false
}).catch(() => process.exit(1));
