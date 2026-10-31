// Test helper: the admin stylesheet is split across styles/**; this reads it back as one string,
// in cascade order (the order index.css imports them), so tests can keep asking "is there a rule for X".
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));

export function importedFiles() {
  const index = readFileSync(resolve(DIR, "index.css"), "utf8");
  return [...index.matchAll(/@import "\.\/([^"]+)";/g)].map((m) => m[1]);
}

// Everything except the token files: the files that must contain no hard-coded colours.
export const componentFiles = () => importedFiles().filter((f) => f !== "theme.css" && f !== "typography.css");
export const readStyle = (file) => readFileSync(resolve(DIR, file), "utf8");
export const readAllStyles = (files = componentFiles()) => files.map(readStyle).join("\n");
