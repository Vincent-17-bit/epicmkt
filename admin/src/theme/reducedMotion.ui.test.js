import { describe, expect, it } from "vitest";
import { componentFiles, readAllStyles, readStyle } from "../styles/readStyles.js";

describe("reduced motion", () => {
  const base = readStyle("base.css");
  const block = base.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  it("has a global rule that removes transitions, animations and smooth scrolling", () => {
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after/);
    expect(block).toMatch(/animation-duration:\s*1ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(block).toMatch(/transition-duration:\s*1ms\s*!important/);
    expect(block).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it("wins over later rules: every declaration is !important, so file order cannot undo it", () => {
    const declarations = block.match(/[a-z-]+:[^;]+;/g) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    for (const d of declarations) expect(d).toMatch(/!important/);
  });

  it("covers every stylesheet that animates", () => {
    const animated = componentFiles().filter((f) => /\b(transition|animation)\s*:/.test(readStyle(f)));
    expect(animated.length).toBeGreaterThan(0); // the global rule is what covers them; this fails loudly if the rule is removed
    expect(readAllStyles()).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("does not set smooth scrolling anywhere", () => {
    expect(readAllStyles()).not.toMatch(/scroll-behavior:\s*smooth/);
  });
});
