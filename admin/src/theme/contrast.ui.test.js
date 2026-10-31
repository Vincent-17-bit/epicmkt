import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { audit, parseTokens } from "../lib/contrast.js";

// WCAG 2.2 AA over the design tokens. Text pairs need 4.5:1 (1.4.3); focus rings, field borders, icons and
// chart marks need 3:1 (1.4.11, 2.4.11). The same list produces docs/admin-contrast.md (npm run check:a11y).
const css = readFileSync(resolve(process.cwd(), "src/styles/theme.css"), "utf8");

describe.each(["light", "dark"])("WCAG AA contrast (%s)", (theme) => {
  const rows = audit(css, theme);
  it.each(rows.map((r) => [`${r.fg} on ${r.bg}${r.note ? ` (${r.note})` : ""}`, r]))("%s", (_name, r) => {
    expect(r.ratio, `${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(r.min);
  });

  it("defines every token the audit uses", () => {
    const tokens = parseTokens(css, theme);
    for (const r of rows) {
      expect(tokens[r.fg], r.fg).toBeTruthy();
      expect(tokens[r.bg], r.bg).toBeTruthy();
    }
  });
});
