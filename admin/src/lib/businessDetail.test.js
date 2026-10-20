import { test } from "node:test";
import assert from "node:assert/strict";
import { DETAIL_TABS, auditLabel, bulkPermission, canToggleVisibility, friendlyError, kes, pickTab, visibleTabs } from "./businessDetail.js";
import { roleCan } from "../auth/permissions.js";

const tabIds = (role) => visibleTabs((action) => roleCan(role, action)).map((t) => t.id);

test("every role gets the tabs the database lets it read", () => {
  assert.deepEqual(tabIds("owner"), DETAIL_TABS.map((t) => t.id));
  assert.deepEqual(tabIds("reviewer"), ["overview", "payments", "items", "flags", "activity", "notes"]);
  assert.deepEqual(tabIds("support"), ["overview", "payments", "items", "flags", "activity", "notes"]);
  assert.deepEqual(tabIds("finance"), ["overview", "payments", "activity", "notes"], "finance cannot read items or flags");
});

test("an unknown or forbidden tab in the URL falls back to the first one", () => {
  const tabs = visibleTabs((a) => roleCan("finance", a));
  assert.equal(pickTab("items", tabs), "overview");
  assert.equal(pickTab("payments", tabs), "payments");
  assert.equal(pickTab(null, tabs), "overview");
});

test("extending is a finance action, everything else is reviewer or support", () => {
  assert.equal(bulkPermission("extend"), "businesses.extend");
  for (const a of ["suspend", "unsuspend", "strike", "unlist", "feature", "tag"]) assert.equal(bulkPermission(a), "businesses.bulk");
});

test("errors turn into sentences", () => {
  assert.match(friendlyError({ code: "forbidden" }), /role cannot/);
  assert.match(friendlyError({ code: "not_found" }), /no longer exists/);
  assert.match(friendlyError({ code: "invalid_status" }), /live or paused/);
  assert.equal(friendlyError({ code: "reason_required", message: "A reason of at least 5 characters is required." }), "A reason of at least 5 characters is required.");
  assert.match(friendlyError(new Error("TypeError: Failed to fetch")), /Cannot reach/);
  assert.equal(friendlyError(new Error("boom")), "Something went wrong. Try again.");
  assert.equal(friendlyError(null, "Custom"), "Custom");
});

test("audit actions are readable, even unknown ones", () => {
  assert.equal(auditLabel("item.hide"), "Hid an item");
  assert.equal(auditLabel("business.bulk_suspend"), "Business bulk suspend");
  assert.equal(auditLabel(""), "Change");
});

test("only live or paused, undeleted businesses can be hidden or shown", () => {
  assert.equal(canToggleVisibility({ status: "live" }), true);
  assert.equal(canToggleVisibility({ status: "paused" }), true);
  assert.equal(canToggleVisibility({ status: "suspended" }), false);
  assert.equal(canToggleVisibility({ status: "live", deleted_at: "2026-01-01" }), false);
});

test("money is shown in KES with separators", () => {
  assert.equal(kes(1300), "KES 1,300");
  assert.equal(kes(null), "KES 0");
});
