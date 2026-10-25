import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "api");
const entries = readdirSync(apiDir).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"));

for (const name of entries) {
  test(`edge function ${name} bundles on its own, with no package imports Vercel cannot resolve`, async () => {
    const result = await build({
      entryPoints: [join(apiDir, name)],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      metafile: true,
      logLevel: "silent"
    });
    const bare = Object.entries(result.metafile.inputs).flatMap(([file, info]) =>
      info.imports.filter((item) => !item.original?.startsWith(".")).map((item) => `${file}: ${item.original}`)
    );
    assert.deepEqual(bare, []);
  });
}
