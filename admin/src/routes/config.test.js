import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTES, badgeFor, bottomBarRoutes, findRoute, hrefOf, visibleRoutes } from "./config.js";
import { COUNT_KEYS, normalizeCounts } from "../api/counts.js";

test("every route has a unique path and every badge key is a real admin_counts key", () => {
  assert.equal(new Set(ROUTES.map((r) => r.path)).size, ROUTES.length);
  for (const route of ROUTES) for (const key of route.badge ?? []) assert.ok(COUNT_KEYS.includes(key), `${route.id}: ${key}`);
});

test("each role sees only the pages it can open", () => {
  const ids = (role) => visibleRoutes(role).map((r) => r.id);
  assert.ok(ids("owner").includes("settings") && ids("owner").includes("applications"));
  assert.ok(!ids("finance").includes("applications") && !ids("finance").includes("settings"));
  assert.ok(ids("finance").includes("payments"));
  assert.ok(!ids("support").includes("applications") && ids("support").includes("moderation"));
  assert.deepEqual(visibleRoutes("nobody"), visibleRoutes("nobody").filter((r) => !r.permission));
});

test("the phone bottom bar shows four allowed pages", () => {
  assert.equal(bottomBarRoutes("owner").length, 4);
  assert.ok(bottomBarRoutes("finance").every((r) => visibleRoutes("finance").includes(r)));
});

test("findRoute ignores a trailing slash and rejects unknown paths", () => {
  assert.equal(findRoute("/admin").id, "command");
  assert.equal(findRoute("/admin/").id, "command");
  assert.equal(findRoute("/admin/payments/").id, "payments");
  assert.equal(findRoute("/admin/nope"), undefined);
  assert.equal(hrefOf(findRoute("/admin/audit")), "/admin/audit");
});

test("badges add their count keys and tolerate bad data", () => {
  const counts = normalizeCounts({ expiring_7d: 6, in_grace: "2", open_flags: -3, submitted: null });
  assert.equal(badgeFor(findRoute("/admin/businesses"), counts), 8);
  assert.equal(badgeFor(findRoute("/admin/moderation"), counts), 0);
  assert.equal(badgeFor(findRoute("/admin/audit"), counts), 0);
  assert.equal(badgeFor(findRoute("/admin"), undefined), 0);
});
