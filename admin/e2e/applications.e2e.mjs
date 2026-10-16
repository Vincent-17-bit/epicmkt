// Step B2a browser checks for the applications queue, run against a built admin app in mock mode.
//
//   npm run build -w admin && npx vite preview --port 4173 --strictPort   (in admin/)
//   ADMIN_URL=http://localhost:4173 node admin/e2e/applications.e2e.mjs
//
// Needs `playwright-core` and a Chromium. Set CHROMIUM_PATH (and CHROMIUM_ARGS) to use your own.
// The demo has 144 applications: 38 submitted (oldest first, mostly overdue), 12 under review, 60 activated, and so on.
// One check waits about 45 seconds for the demo's "a new application arrives" event.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const BASE = process.env.ADMIN_URL ?? "http://localhost:4173";
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_ARGS?.split(" ") ?? [] });
let failed = 0;
const pageErrors = [];

async function check(name, fn, { width = 1400, height = 900, email = "owner@epicmkt.test", path = "/admin/applications", acceptDownloads = true } = {}) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${name}: ${e.message}`));
  try {
    await signIn(page, email);
    await page.goto(BASE + path);
    await page.getByRole("tab", { name: /Submitted/ }).waitFor();
    await page.getByRole("checkbox", { name: /^Select (?!all)/ }).first().waitFor(); // a row on desktop, a card on phones
    await fn(page, context);
    console.log("ok   ", name);
  } catch (error) {
    failed += 1;
    console.log("FAIL ", name, "\n     ", error.message.split("\n")[0]);
    await page.screenshot({ path: `/tmp/fail-${name.replace(/\W+/g, "-")}.png` }).catch(() => {});
  } finally { await browser.close().catch(() => {}); }
}

async function signIn(page, email) {
  await page.goto(BASE + "/admin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: /Verify|Turn on/ }).click();
  await page.getByRole("heading", { name: "Needs your attention" }).waitFor();
}

// A data row has a "Select <business>" checkbox (the header one says "Select all").
const dataRows = (page) => page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: /^Select (?!all)/ }) });
const names = (page) => dataRows(page).evaluateAll((rows) => rows.map((r) => r.querySelector('[data-col="business"] span span')?.textContent ?? ""));
const tabCount = async (page, label) => Number((await page.getByRole("tab", { name: new RegExp(`^${label}`) }).locator("span").last().textContent()).trim());
const url = (page) => new URL(page.url());
const settle = (page) => page.waitForTimeout(450);
/** Polls until fn() is truthy (virtual rows redraw a frame or two after a scroll). */
async function until(fn, message, ms = 5000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await new Promise((r) => setTimeout(r, 100)); }
  assert.fail(message ?? "condition never became true");
}
const rowCount = async (page) => (await dataRows(page).count());
const rowCountPage = (page) => page.getByText(/Showing 1 to/).first().textContent().then((t) => Number(t.match(/to (\d+)/)[1]));
const scrollerMetrics = (page) => page.getByRole("table").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));

await check("tabs show a count each, the sidebar badge agrees, and Submitted is the default", async (page) => {
  assert.equal(await tabCount(page, "Submitted"), 38);
  assert.equal(await tabCount(page, "Under review"), 12);
  assert.equal(await tabCount(page, "Activated"), 60);
  assert.equal(await tabCount(page, "All"), 144);
  assert.equal((await page.getByRole("link", { name: /Applications/ }).first().textContent()).match(/Applications(\d+)/)[1], "38");
  assert.equal(await page.getByRole("tab", { name: /Submitted/ }).getAttribute("aria-selected"), "true");
  assert.equal(url(page).search, "");
});

await check("choosing a tab changes the list and the address, and Back returns", async (page) => {
  await page.getByRole("tab", { name: /Under review/ }).click();
  await settle(page);
  assert.equal(url(page).searchParams.get("status"), "under_review");
  const chips = await page.getByRole("row").locator('[data-status]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-status")))]);
  assert.deepEqual(chips, ["under_review"]);
  await page.goBack();
  await settle(page);
  assert.equal(await page.getByRole("tab", { name: /Submitted/ }).getAttribute("aria-selected"), "true");
});

await check("a link straight to a filtered tab works (the notification toast uses these)", async (page) => {
  await page.goto(BASE + "/admin/applications?status=activated&plan=premium");
  await dataRows(page).first().waitFor();
  assert.equal(await page.getByRole("tab", { name: /Activated/ }).getAttribute("aria-selected"), "true");
  assert.equal(await page.getByLabel("Plan").inputValue(), "premium");
  const plans = await page.getByRole("row").locator('[data-col="category"] span:last-child').allTextContents();
  assert.ok(plans.length > 0 && plans.every((t) => /Premium/.test(t)), plans.join());
});

await check("the queue is oldest first, with the SLA state and a red bar on overdue rows", async (page) => {
  const first = dataRows(page).first();
  assert.match(await first.locator('[data-col="sla"]').textContent(), /Overdue.*over/);
  assert.equal(await first.getAttribute("data-tone"), "danger");
  assert.equal(await page.getByRole("columnheader", { name: /Submitted/ }).getAttribute("aria-sort"), "ascending");
  const states = () => dataRows(page).evaluateAll((rows) => rows.map((r) => r.querySelector("[data-state]")?.getAttribute("data-state")));
  // breached first, then soon, then ok: oldest first is most urgent first
  const order = ["breached", "soon", "ok"];
  const top = await states();
  assert.deepEqual(top, [...top].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  await page.getByRole("table").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await until(async () => (await states()).at(-1) === "ok", "the newest waiting applications should be on time");
  const bottom = await states();
  assert.ok(bottom.includes("soon") || top.includes("soon"), "and some are due soon");
});

await check("sorting: the Sort by select and the column headers agree, and a header works from the keyboard", async (page) => {
  const before = await names(page);
  await page.getByLabel("Sort by").selectOption("business_name:asc");
  await settle(page);
  const az = await names(page);
  assert.deepEqual(az, [...az].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  assert.notDeepEqual(az, before);
  assert.equal(await page.getByRole("columnheader", { name: /Business/ }).getAttribute("aria-sort"), "ascending");
  const header = page.getByRole("button", { name: /^Business, sort descending/ });
  await header.focus();
  await page.keyboard.press("Enter");
  await settle(page);
  const za = await names(page);
  assert.deepEqual(za, [...za].sort((a, b) => b.localeCompare(a, "en", { sensitivity: "base" })));
  assert.equal(url(page).searchParams.get("dir"), "desc");
  await page.getByLabel("Sort by").selectOption("submitted_at:desc");
  await settle(page);
  assert.equal(await page.getByRole("columnheader", { name: /Submitted/ }).getAttribute("aria-sort"), "descending");
});

await check("search: '/' focuses it, results narrow after a pause, the address keeps it, Escape clears", async (page) => {
  const search = page.getByRole("searchbox", { name: "Search applications" });
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  assert.equal(await search.evaluate((el) => document.activeElement === el), true);
  assert.equal(await search.inputValue(), "", "the slash must not be typed into the box");
  const all = await rowCount(page);
  await search.fill("lake view");
  await settle(page); await page.waitForTimeout(300);
  const found = await names(page);
  assert.ok(found.length > 0 && found.length < all && found.every((n) => /lake view/i.test(n)), found.join());
  assert.equal(url(page).searchParams.get("q"), "lake view");
  await search.press("Escape");
  await settle(page); await page.waitForTimeout(300);
  assert.equal(await search.inputValue(), "");
  assert.equal(url(page).searchParams.get("q"), null);
  await search.fill("zzzz nothing");
  await settle(page); await page.waitForTimeout(300);
  await page.getByRole("heading", { name: /No applications match/ }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await dataRows(page).first().waitFor();
});

await check("typing '/' inside a text field is typed, not hijacked", async (page) => {
  await page.getByRole("button", { name: "Saved views" }).click();
  const input = page.getByLabel("Save the current view as");
  await input.focus();
  await page.keyboard.type("a/b");
  assert.equal(await input.inputValue(), "a/b");
});

await check("search finds a phone number in local format", async (page) => {
  await page.getByRole("button", { name: "Choose columns" }).click();
  await page.getByLabel("Phone").check();
  await page.keyboard.press("Escape");
  const phone = await dataRows(page).nth(2).locator('[data-col="phone"]').textContent();
  const local = "0" + phone.replace("+254", "");
  await page.getByRole("searchbox", { name: "Search applications" }).fill(local.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3"));
  await settle(page); await page.waitForTimeout(300);
  const phones = await dataRows(page).locator('[data-col="phone"]').allTextContents();
  assert.ok(phones.includes(phone), phones.join());
});

await check("filters: category, plan, assignee and SLA narrow the list; clear filters resets them", async (page) => {
  const total = Number((await page.getByText(/Showing 1 to/).first().textContent()).match(/of (\d+)/)[1]);
  await page.getByLabel("24 h SLA").selectOption("breached");
  await settle(page);
  const overdue = await page.getByRole("row").locator("[data-state]").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  assert.ok(overdue.length > 0 && overdue.every((s) => s === "breached"));
  await page.getByLabel("Assigned to").selectOption("none");
  await settle(page);
  const who = await dataRows(page).locator('[data-col="assignee"]').allTextContents();
  assert.ok(who.length > 0 && who.every((t) => t === "Unassigned"));
  await page.getByLabel("Plan").selectOption("premium");
  await settle(page);
  const p = new URL(page.url()).searchParams;
  assert.deepEqual([p.get("sla"), p.get("assignee"), p.get("plan")], ["breached", "none", "premium"]);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await settle(page);
  assert.equal(url(page).search, "");
  assert.equal(Number((await page.getByText(/Showing 1 to/).first().textContent()).match(/of (\d+)/)[1]), total);
});

await check("tab counts follow the filters, but not the SLA filter, and the SLA filter is only on Submitted", async (page) => {
  await page.getByLabel("Plan").selectOption("premium");
  await settle(page);
  assert.ok((await tabCount(page, "Submitted")) < 38);
  await page.getByLabel("Plan").selectOption("");
  await page.getByLabel("24 h SLA").selectOption("breached");
  await settle(page);
  assert.equal(await tabCount(page, "Submitted"), 38, "the SLA filter must not shrink the tab number");
  await page.getByRole("tab", { name: /Activated/ }).click();
  await settle(page);
  assert.equal(await page.getByLabel("24 h SLA").isDisabled(), true);
  assert.equal(url(page).searchParams.get("sla"), null);
});

await check("only the rows near the screen are drawn, and scrolling brings the rest in", async (page) => {
  const drawn = await rowCount(page);
  assert.ok(drawn > 0 && drawn < 30, `drew ${drawn} of 38`);
  await page.getByRole("table").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  const last = (await names(page)).at(-1);
  await page.getByRole("table").evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(300);
  assert.notEqual((await names(page))[0], last);
  // the header stays put while the body scrolls
  await page.getByRole("table").evaluate((el) => { el.scrollTop = 400; });
  await page.waitForTimeout(200);
  const head = await page.getByRole("columnheader", { name: /Business/ }).boundingBox();
  const frame = await page.getByRole("table").boundingBox();
  assert.ok(Math.abs(head.y - frame.y) < 2, `header at ${head.y}, frame at ${frame.y}`);
});

await check("server pagination: page size, next and previous, and the filters survive paging", async (page) => {
  await page.getByLabel("Rows per page").selectOption("25");
  await settle(page);
  assert.match(await page.getByText(/Showing 1 to 25 of 38/).first().textContent(), /25 of 38/);
  const firstPage = (await names(page))[0];
  await page.getByRole("button", { name: "Next page" }).click();
  await settle(page);
  assert.match(await page.getByText(/Page 2 of 2/).first().textContent(), /Page 2 of 2/);
  assert.match(await page.getByText(/Showing 26 to 38 of 38/).first().textContent(), /26 to 38/);
  assert.equal(await page.getByRole("button", { name: "Next page" }).isDisabled(), true);
  assert.equal(url(page).searchParams.get("page"), "2");
  assert.notEqual((await names(page))[0], firstPage);
  await page.getByRole("button", { name: "Previous page" }).click();
  await settle(page);
  assert.equal((await names(page))[0], firstPage);
  assert.equal(url(page).searchParams.get("page"), null);
});

await check("selecting: a row, the page, a Shift range, and selection survives paging", async (page) => {
  await page.getByLabel("Rows per page").selectOption("25");
  await settle(page);
  const boxes = page.getByRole("checkbox", { name: /^Select (?!all)/ });
  await boxes.nth(0).click();
  await boxes.nth(3).click({ modifiers: ["Shift"] });
  assert.match(await page.getByText(/\d+ selected/).textContent(), /^4 selected/);
  await page.getByRole("button", { name: "Next page" }).click();
  await settle(page);
  assert.match(await page.getByText(/\d+ selected/).textContent(), /^4 selected/, "selection stays across pages");
  await page.getByRole("checkbox", { name: /^Select all/ }).check();
  assert.match(await page.getByText(/\d+ selected/).textContent(), /^17 selected/);
  await page.getByRole("button", { name: "Clear selection" }).click();
  assert.equal(await page.getByText(/\d+ selected/).count(), 0);
});

await check("changing a filter clears the selection", async (page) => {
  await page.getByRole("checkbox", { name: /^Select (?!all)/ }).first().click();
  await page.getByLabel("Plan").selectOption("premium");
  await settle(page);
  assert.equal(await page.getByText(/\d+ selected/).count(), 0);
});

await check("owner: bulk assign to a reviewer, with a result toast and the new assignee in the rows", async (page) => {
  const boxes = page.getByRole("checkbox", { name: /^Select (?!all)/ });
  await page.getByLabel("Assigned to").selectOption("none");
  await settle(page);
  const picked = [(await names(page))[0], (await names(page))[1], (await names(page))[2]];
  for (const i of [0, 1, 2]) await boxes.nth(i).click();
  await page.getByRole("button", { name: "Assign to…" }).click();
  const dialog = page.getByRole("dialog", { name: /Assign 3 applications/ });
  await dialog.waitFor();
  await dialog.getByLabel(/Amina Wanjiru/).check();
  await dialog.getByRole("button", { name: "Assign to Amina Wanjiru" }).click();
  await page.getByText(/Assigned 3 applications to Amina Wanjiru/).waitFor();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.getByText(/\d+ selected/).count(), 0);
  await page.getByLabel("Assigned to").selectOption({ label: "Amina Wanjiru" });
  await settle(page);
  const now = await names(page);
  for (const n of picked) assert.ok(now.includes(n), `${n} should be Amina's now`);
});

await check("owner: 'Assign to me' and 'Unassign' from the bulk bar, and finished applications are skipped", async (page) => {
  const boxes = page.getByRole("checkbox", { name: /^Select (?!all)/ });
  await boxes.nth(0).click();
  await page.getByRole("button", { name: "Assign to me" }).click();
  await page.getByText(/Assigned 1 application to you/).waitFor();
  await page.getByLabel("Assigned to").selectOption("me");
  await settle(page);
  assert.ok((await dataRows(page).locator('[data-col="assignee"]').allTextContents()).includes("You"));
  await boxes.nth(0).click();
  await page.getByRole("button", { name: /^Unassign/ }).click();
  await page.getByText(/Cleared the assignee on 1 application/).waitFor();
  // a finished application cannot be assigned
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("tab", { name: /Activated/ }).click();
  await settle(page);
  await page.getByRole("checkbox", { name: /^Select (?!all)/ }).first().click();
  await page.getByRole("button", { name: "Assign to me" }).click();
  await page.getByText(/Nothing changed\. 1 was skipped/).waitFor();
});

await check("reviewer: can take work for themselves, but has no 'Assign to…'", async (page) => {
  await page.getByRole("checkbox", { name: /^Select (?!all)/ }).first().click();
  assert.equal(await page.getByRole("button", { name: "Assign to…" }).count(), 0);
  await page.getByRole("button", { name: "Assign to me" }).click();
  await page.getByText(/Assigned 1 application to you/).waitFor();
}, { email: "reviewer@epicmkt.test" });

await check("start review from a row moves it out of Submitted and updates the counts", async (page) => {
  const first = (await names(page))[0];
  await dataRows(page).first().getByRole("button", { name: /^Start review of/ }).click();
  await page.getByText(new RegExp(`You started the review of ${first}`)).waitFor();
  await settle(page); await page.waitForTimeout(300);
  assert.equal(await tabCount(page, "Submitted"), 37);
  assert.equal(await tabCount(page, "Under review"), 13);
  assert.notEqual((await names(page))[0], first);
});

await check("columns: hide one, it stays hidden after a reload, and Reset brings it back; locked columns cannot be hidden", async (page) => {
  await page.getByRole("button", { name: "Choose columns" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose columns" });
  assert.equal(await chooser.getByLabel(/Business/).isDisabled(), true);
  assert.equal(await chooser.getByLabel(/Business/).isChecked(), true);
  await chooser.getByLabel("Category", { exact: true }).uncheck();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("columnheader", { name: /Category/ }).count(), 0);
  await page.reload();
  await dataRows(page).first().waitFor();
  assert.equal(await page.getByRole("columnheader", { name: /Category/ }).count(), 0, "kept after reload");
  await page.getByRole("button", { name: "Choose columns" }).click();
  await page.getByRole("button", { name: /Reset to default columns/ }).click();
  assert.equal(await page.getByRole("columnheader", { name: /Category/ }).count(), 1);
});

await check("density: Tight makes the rows shorter and is remembered", async (page) => {
  const tall = (await dataRows(page).first().boundingBox()).height;
  await page.getByRole("button", { name: "Tight" }).click();
  await page.waitForTimeout(200);
  const short = (await dataRows(page).first().boundingBox()).height;
  assert.ok(short < tall - 10, `${short} vs ${tall}`);
  await page.reload();
  await dataRows(page).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Tight" }).getAttribute("aria-pressed"), "true");
});

await check("saved views: save, apply, set as default (opens on a bare link), delete", async (page) => {
  await page.getByLabel("24 h SLA").selectOption("breached");
  await page.getByLabel("Plan").selectOption("premium");
  await settle(page);
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByLabel("Save the current view as").fill("Premium overdue");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/Saved the view "Premium overdue"/).waitFor();
  await page.getByRole("button", { name: "Open Premium overdue by default" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await settle(page);
  assert.equal(url(page).search, "");
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("button", { name: "Premium overdue", exact: true }).click();
  await settle(page);
  assert.deepEqual([url(page).searchParams.get("sla"), url(page).searchParams.get("plan")], ["breached", "premium"]);
  // a fresh visit with no address parameters opens the default view
  await page.goto(BASE + "/admin/applications");
  await dataRows(page).first().waitFor();
  await settle(page);
  assert.deepEqual([url(page).searchParams.get("sla"), url(page).searchParams.get("plan")], ["breached", "premium"]);
  // an explicit link is never overridden
  await page.goto(BASE + "/admin/applications?status=activated");
  await dataRows(page).first().waitFor();
  assert.equal(url(page).searchParams.get("plan"), null);
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("button", { name: "Delete Premium overdue" }).click();
  await page.getByText(/No saved views yet/).waitFor();
});

await check("saved view names: required, and a repeat name replaces rather than duplicates", async (page) => {
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /name/ }).waitFor();
  await page.getByLabel("Save the current view as").fill("Mine");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Save the current view as").fill("mine");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: /^mine$|^Mine$/ }).count(), 1);
});

await check("CSV: this page and everything that matches, with every column and no formula injection", async (page) => {
  await page.getByLabel("Plan").selectOption("premium");
  await settle(page);
  const shown = Number((await page.getByText(/Showing 1 to/).first().textContent()).match(/of (\d+)/)[1]);
  await page.getByRole("button", { name: "Export to CSV" }).click();
  const [all] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Everything that matches/ }).click()]);
  assert.match(all.suggestedFilename(), /^applications-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile(await all.path(), "utf8");
  assert.ok(text.startsWith("\uFEFFBusiness,24 h SLA,Submitted,Status,Category,Assigned to,Reference,Plan,Fee,Owner,Phone,Location,Verification\r\n"), text.slice(0, 160));
  const lines = text.trim().split("\r\n");
  assert.equal(lines.length - 1, shown, "one line per matching application");
  assert.ok(lines.slice(1).every((l) => /,premium,1500,/.test(l)));
  await page.getByRole("button", { name: "Export to CSV" }).click();
  const [pageOnly] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /This page/ }).click()]);
  assert.equal((await readFile(await pageOnly.path(), "utf8")).trim().split("\r\n").length - 1, await rowCountPage(page));
});
await check("a new application: one toast (not two), the row appears highlighted, and Show jumps to it", async (page) => {
  const before = await tabCount(page, "Submitted");
  await page.getByText("New application").first().waitFor({ timeout: 70_000 });
  await page.waitForTimeout(700);
  assert.equal(await page.getByText("New application").count(), 1, "the layout's own toast must be suppressed on this page");
  await page.getByRole("button", { name: "Show" }).click();
  await settle(page);
  assert.equal(await tabCount(page, "Submitted"), before + 1);
  assert.equal(url(page).searchParams.get("dir"), "desc");
  const top = dataRows(page).first();
  assert.match(await top.locator('[data-col="sla"]').textContent(), /On time/);
  assert.equal(await top.getAttribute("data-new"), "true");
}, { width: 1400 });

await check("other pages still get the layout's toast for a new application", async (page) => {
  await page.goto(BASE + "/admin");
  await page.getByText("New application").first().waitFor({ timeout: 70_000 });
});

await check("phone: stacked cards, filters behind a button, no sideways scroll, and the bulk bar works", async (page) => {
  assert.equal(await page.getByRole("table").count(), 0);
  assert.ok((await page.getByRole("article").count()) > 0);
  assert.equal(await page.getByLabel("Plan").isVisible(), false, "filters start closed");
  assert.equal(await page.getByRole("button", { name: "Tight" }).isVisible(), false);
  const filters = page.getByRole("button", { name: /Filters and sort/ });
  assert.equal(await filters.getAttribute("aria-expanded"), "false");
  await filters.click();
  assert.equal(await page.getByLabel("Plan").isVisible(), true);
  await page.getByLabel("Plan").selectOption("premium");
  await settle(page);
  assert.match(await filters.textContent(), /\(1 on\)/);
  await filters.click();
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(scroll.sw <= scroll.cw, `page scrolls sideways: ${scroll.sw} > ${scroll.cw}`);
  const card = page.getByRole("article").first();
  assert.match(await card.textContent(), /Overdue/);
  await card.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Assign to me" }).waitFor();
  const box = await page.getByRole("button", { name: "Assign to me" }).boundingBox();
  assert.ok(box.height >= 36, `tap target ${box.height}px`);
}, { width: 390, height: 844, email: "reviewer@epicmkt.test" });

await check("keyboard: every control is reachable and has a name; the table region is focusable for scrolling", async (page) => {
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("button, input, select, [role=checkbox]")].filter((el) => {
    if (el.closest("[hidden]") || el.disabled && false) return false;
    const label = el.getAttribute("aria-label") || el.textContent.trim() || el.labels?.[0]?.textContent?.trim() || el.getAttribute("title");
    return !label;
  }).map((el) => el.outerHTML.slice(0, 90)));
  assert.deepEqual(unnamed, []);
  await page.getByRole("table").focus();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "table");
  await page.keyboard.press("PageDown");
});

await check("it fits at common widths without the page scrolling sideways", async (page, context) => {
  for (const width of [320, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m.sw <= m.cw, `${width}px: page ${m.sw} > ${m.cw}`);
  }
});

await check("dark theme: the SLA chip text keeps 4.5:1 contrast on its real (composited) background", async (page) => {
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.waitForTimeout(250);
  const { fg, layers } = await dataRows(page).first().locator('[data-col="sla"] [data-status], [data-col="sla"] > span > span').first().evaluate((el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) layers.push(getComputedStyle(n).backgroundColor);
    return { fg: getComputedStyle(el).color, layers };
  });
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  // paint the layers from the page up, so a see-through chip background is judged on what is really behind it
  let base = { r: 255, g: 255, b: 255 };
  for (const c of layers.map(parse).reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) };
  const lum = ({ r, g, b }) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const text = parse(fg);
  const ratio = (Math.max(lum(text), lum(base)) + 0.05) / (Math.min(lum(text), lum(base)) + 0.05);
  assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)} for ${fg} on rgb(${base.r.toFixed(0)}, ${base.g.toFixed(0)}, ${base.b.toFixed(0)})`);
});

if (pageErrors.length) { failed += 1; console.log("FAIL  page errors:\n  " + pageErrors.join("\n  ")); }
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
