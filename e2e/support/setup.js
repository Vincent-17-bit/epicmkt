import { existsSync } from "node:fs";
import { join } from "node:path";

export default function setup() {
  const missing = ["client", "seller", "admin"].filter((app) => !existsSync(join(process.cwd(), app, "dist", "index.html")));
  if (missing.length) throw new Error(`Missing build output for: ${missing.join(", ")}. Run npm run build:visual first.`);
}
