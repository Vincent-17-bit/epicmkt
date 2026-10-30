import test from "node:test";
import assert from "node:assert/strict";
import { buildCrumbs, isItemActive } from "./breadcrumbs.js";

const groups = [
  { items: [{ label: "Command center", to: "/admin", end: true }] },
  { label: "Sellers", items: [{ label: "Applications", to: "/admin/applications" }, { label: "Businesses", to: "/admin/businesses" }] },
  { label: "Moderation and payments", items: [{ label: "Payments", to: "/admin/payments" }] },
];

test("the home page is a single crumb with no section", () => {
  assert.deepEqual(buildCrumbs("/admin", groups), { title: "Command center", crumbs: [{ label: "Command center" }] });
  assert.deepEqual(buildCrumbs("/admin/", groups).crumbs, [{ label: "Command center" }]);
});

test("a section page shows its section, then the page", () => {
  const { title, crumbs } = buildCrumbs("/admin/payments", groups);
  assert.equal(title, "Payments");
  assert.deepEqual(crumbs, [{ label: "Moderation and payments" }, { label: "Payments" }]);
});

test("a detail page links back to its list", () => {
  const { title, crumbs } = buildCrumbs("/admin/businesses/abc-123", groups);
  assert.equal(title, "Business details");
  assert.deepEqual(crumbs, [{ label: "Sellers" }, { label: "Businesses", to: "/admin/businesses" }, { label: "Business details" }]);
  assert.equal(buildCrumbs("/admin/applications/42", groups).title, "Application details");
});

test("pages outside the sidebar still get a real title", () => {
  assert.equal(buildCrumbs("/admin/account", groups).title, "Account");
  assert.equal(buildCrumbs("/admin/somewhere-else", groups).title, "Admin");
});

test("the home item is only active on exactly /admin", () => {
  assert.equal(isItemActive(groups[0].items[0], "/admin"), true);
  assert.equal(isItemActive(groups[0].items[0], "/admin/payments"), false);
  assert.equal(isItemActive(groups[1].items[1], "/admin/businesses/9"), true);
});
