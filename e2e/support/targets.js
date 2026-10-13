import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { MIN_TARGET } from "./env.js";

export const BASELINE = join(process.cwd(), "e2e", "tap-target-baseline.json");
export const SCRATCH = join(process.cwd(), "test-results", "_tap-targets");

const known = () => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {});

export function collectTargets(min) {
  const SELECTOR = [
    "a[href]",
    "button",
    'input:not([type="hidden"])',
    "select",
    "textarea",
    "summary",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="option"]',
    '[role="combobox"]'
  ].join(",");
  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
  const root = document.scrollingElement || document.documentElement;

  const hiddenByStyle = (element) => {
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return true;
      if (node.hasAttribute("inert") || node.hidden) return true;
    }
    return false;
  };

  const boxOf = (element) => {
    if (element.matches('input[type="checkbox"],input[type="radio"],input[type="file"]')) {
      const label = element.labels && element.labels[0];
      if (label) return label.getBoundingClientRect();
    }
    return element.getBoundingClientRect();
  };

  const reachable = (element, box) => {
    let scrollsX = false;
    let scrollsY = false;
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const region = node.getBoundingClientRect();
      const clipsX = style.overflowX !== "visible";
      const clipsY = style.overflowY !== "visible";
      const canScrollX = style.overflowX === "auto" || style.overflowX === "scroll";
      const canScrollY = style.overflowY === "auto" || style.overflowY === "scroll";
      if (canScrollX) scrollsX = true;
      if (canScrollY) scrollsY = true;
      if (clipsX && !canScrollX && (box.right <= region.left || box.left >= region.right)) return false;
      if (clipsY && !canScrollY && (box.bottom <= region.top || box.top >= region.bottom)) return false;
    }
    if (!scrollsX && (box.right <= 0 || box.left >= root.scrollWidth)) return false;
    if (!scrollsY && box.bottom <= 0) return false;
    return true;
  };

  const insideSentence = (element) => {
    if (element.tagName !== "A" || getComputedStyle(element).display !== "inline") return false;
    let block = element.parentElement;
    while (block && getComputedStyle(block).display === "inline") block = block.parentElement;
    if (!block) return false;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let prose = 0;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (text.parentElement && text.parentElement.closest("a,button")) continue;
      prose += clean(text.textContent).length;
    }
    return prose >= 8;
  };

  const nameOf = (element) => {
    const labelled = element.getAttribute("aria-labelledby");
    const fromIds = labelled
      ? labelled
          .split(/\s+/)
          .map((id) => clean(document.getElementById(id) && document.getElementById(id).textContent))
          .join(" ")
      : "";
    const image = element.querySelector("img[alt]");
    const label = element.labels && element.labels[0];
    const value =
      element.getAttribute("aria-label") ||
      fromIds ||
      clean(element.innerText || element.textContent) ||
      clean(label && label.textContent) ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      (image && image.getAttribute("alt")) ||
      element.getAttribute("name") ||
      element.getAttribute("href") ||
      element.id ||
      "";
    return clean(value).slice(0, 48);
  };

  const roleOf = (element) => element.getAttribute("role") || (element.tagName === "INPUT" ? `input:${element.type}` : element.tagName.toLowerCase());

  const found = [];
  for (const element of document.querySelectorAll(SELECTOR)) {
    if (element.disabled || hiddenByStyle(element)) continue;
    const box = boxOf(element);
    if (box.width <= 0 || box.height <= 0) continue;
    if (!reachable(element, box)) continue;
    if (insideSentence(element)) continue;
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    if (width >= min && height >= min) continue;
    found.push({ key: `${roleOf(element)}|${nameOf(element)}`, width, height });
  }
  return found;
}

export async function auditTargets(page, id, project) {
  const found = await page.evaluate(collectTargets, MIN_TARGET);
  if (process.env.UPDATE_TARGET_BASELINE) {
    mkdirSync(SCRATCH, { recursive: true });
    const keys = [...new Set(found.map((item) => item.key))];
    writeFileSync(join(SCRATCH, `${id.replace(/\W+/g, "_")}__${project}.json`), JSON.stringify({ id, keys }));
    return;
  }
  const allowed = new Set(known()[id] ?? []);
  const fresh = found.filter((item) => !allowed.has(item.key));
  expect
    .soft(
      fresh.map((item) => `${item.key} ${item.width}x${item.height}`),
      `${id}: tap targets under ${MIN_TARGET}px that are not in e2e/tap-target-baseline.json`
    )
    .toEqual([]);
}
