import { test as base, expect } from "@playwright/test";
import { prepare, settle, expand, watch } from "./stabilize.js";
import { auditTargets } from "./targets.js";

export const test = base.extend({
  page: async ({ page }, use) => {
    await prepare(page);
    const issues = watch(page);
    await use(page);
    expect(issues, "JavaScript errors or failed requests").toEqual([]);
  }
});

export { expect };

export async function check(page, id, { full = true } = {}) {
  const info = test.info();
  await settle(page);
  if (full) await expand(page);
  if (info.project.use.hasTouch) await auditTargets(page, id, info.project.name);
  await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: full });
}
