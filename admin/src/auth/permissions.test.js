import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, ROLES, explain, roleCan } from "./permissions.js";

test("the owner passes every known action", () => {
  for (const action of Object.keys(ACTIONS)) assert.equal(roleCan("owner", action), true, action);
});

test("matches the README role table", () => {
  // Applications and documents: owner and reviewer only.
  assert.deepEqual(ROLES.filter((r) => roleCan(r, "applications.view")), ["owner", "reviewer"]);
  assert.deepEqual(ROLES.filter((r) => roleCan(r, "documents.view")), ["owner", "reviewer"]);
  assert.deepEqual(ROLES.filter((r) => roleCan(r, "applications.assign")), ["owner", "reviewer"]);
  // Catalogue and settings: owner only.
  assert.deepEqual(ROLES.filter((r) => roleCan(r, "catalogue.edit")), ["owner"]);
  assert.deepEqual(ROLES.filter((r) => roleCan(r, "settings.edit")), ["owner"]);
  // Payments: every admin reads, owner and finance write.
  assert.deepEqual(ROLES.filter((r) => roleCan(r, "payments.view")), ROLES);
  assert.deepEqual(ROLES.filter((r) => roleCan(r, "payments.confirm")), ["owner", "finance"]);
});

test("unknown roles and unknown actions fail closed", () => {
  assert.equal(roleCan(undefined, "payments.view"), false);
  assert.equal(roleCan("admin", "payments.view"), false);
  assert.equal(roleCan("owner", "does.not.exist"), false);
});

test("explain is empty when allowed and names who can otherwise", () => {
  assert.equal(explain("finance", "payments.confirm"), "");
  assert.equal(
    explain("support", "payments.confirm"),
    "Only Owners and Finance admins can confirm or reject payments. You are signed in as Support.",
  );
  assert.match(explain("support", "applications.decide"), /Owners and Reviewers can approve/);
  assert.match(explain("support", "settings.edit"), /^Only Owners can change settings\./);
  assert.match(explain(null, "payments.view"), /no admin role/);
});
