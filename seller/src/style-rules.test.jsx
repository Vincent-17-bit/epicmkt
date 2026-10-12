import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src");
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(root).filter((f) => /\.(css|jsx?|mjs)$/.test(f) && !/\.test\./.test(f));

describe("seller design and code rules", () => {
  it("has files to check", () => expect(files.length).toBeGreaterThan(20));

  it("avoids the banned visual patterns", () => {
    const banned = [/#444\b/i, /#666\b/i, /marquee/i, /cursor-?follow/i, /\bamber\b/i, /\bgold\b/i, /--flash-/, /@keyframes/, /animation\s*:/, /radial-gradient/, /blur\(/, /font-weight:\s*200\b/];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const re of banned) expect(re.test(text), `${f} matches ${re}`).toBe(false);
    }
  });

  it("uses theme tokens instead of hard-coded colours in component styles", () => {
    for (const f of files.filter((x) => x.endsWith(".module.css"))) {
      expect(/#[0-9a-f]{3,8}\b/i.test(readFileSync(f, "utf8")), `${f} has a hex colour`).toBe(false);
    }
  });

  it("has no code comments", () => {
    for (const f of files) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => expect(/^\s*(\/\/|\/\*|\*\s)/.test(line), `${f}:${i + 1}`).toBe(false));
    }
  });
});
