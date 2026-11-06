// axe helper for jsdom. Fails only on serious and critical violations (the acceptance bar).
// jsdom has no layout engine, so colour-contrast and a few visual rules cannot run here; contrast is covered by
// the token audit (src/lib/contrast.js) and by the real-browser scan documented in docs/admin-contrast.md.
import { configureAxe } from "vitest-axe";

const run = configureAxe({
  rules: { "color-contrast": { enabled: false }, "scrollable-region-focusable": { enabled: false } },
});

export async function seriousViolations(container) {
  const results = await run(container);
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 140)) }));
}
