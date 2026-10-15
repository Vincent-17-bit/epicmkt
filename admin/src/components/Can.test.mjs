// Renders <Can> and <ActionButton> for each role with esbuild + react-dom/server, with useAuth stubbed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

async function load() {
  const stub = {
    name: "stub-auth",
    setup(b) {
      b.onResolve({ filter: /AuthProvider\.jsx$/ }, () => ({ path: "stub-auth", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const useAuth = () => ({ admin: globalThis.__admin });", loader: "js" }));
    },
  };
  const entry = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { Can, ActionButton } from ${JSON.stringify(path.join(here, "Can.jsx"))};
    export const render = (role) => { globalThis.__admin = role ? { role } : null;
      return renderToStaticMarkup(React.createElement("div", null,
        React.createElement(Can, { action: "settings.edit" }, "SETTINGS"),
        React.createElement(ActionButton, { action: "payments.confirm", onClick() {} }, "Confirm")));
    };`;
  const out = await build({ stdin: { contents: entry, resolveDir: here, loader: "jsx" }, bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom/server"], plugins: [stub], loader: { ".js": "jsx" } });
  const file = path.join(here, `.can-test-${process.pid}.mjs`);
  const { writeFileSync, rmSync } = await import("node:fs");
  writeFileSync(file, out.outputFiles[0].text);
  try { return await import(file); } finally { rmSync(file); }
}

test("Can hides what a role may not see; ActionButton blocks and explains", async () => {
  const { render } = await load();
  const owner = render("owner");
  assert.match(owner, /SETTINGS/);
  assert.doesNotMatch(owner, /aria-disabled/);

  const finance = render("finance");
  assert.doesNotMatch(finance, /SETTINGS/, "finance cannot see owner-only content");
  assert.doesNotMatch(finance, /aria-disabled/, "finance may confirm payments");

  const support = render("support");
  assert.match(support, /aria-disabled="true"/);
  assert.match(support, /role="tooltip"[^>]*>Only Owners and Finance admins can confirm or reject payments\. You are signed in as Support\./);
  assert.match(support, /aria-describedby="/);

  const nobody = render(null);
  assert.match(nobody, /aria-disabled="true"/, "no role: everything blocked");
});
