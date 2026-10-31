import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, ROLES, explain, roleCan } from "./permissions.js";

test("the owner may do everything", () => {
  for (const action of Object.keys(ACTIONS)) assert.equal(roleCan("owner", action), true, action);
});

test("unknown roles and unknown actions are never allowed", () => {
  assert.equal(roleCan("intern", "payments.view"), false);
  assert.equal(roleCan(null, "payments.view"), false);
  assert.equal(roleCan("owner", "launch.rockets"), false);
});

test("the rules match what the database enforces", () => {
  // from has_role() in 0008, 0013, 0015 and 0016
  assert.equal(roleCan("reviewer", "applications.decide"), true);
  assert.equal(roleCan("support", "applications.decide"), false);
  assert.equal(roleCan("finance", "applications.view"), false);
  assert.equal(roleCan("finance", "payments.confirm"), true);
  assert.equal(roleCan("support", "payments.confirm"), false);
  assert.equal(roleCan("reviewer", "payments.confirm"), false);
  assert.equal(roleCan("support", "businesses.bulk"), true);
  assert.equal(roleCan("finance", "businesses.bulk"), false);
  assert.equal(roleCan("finance", "businesses.extend"), true);
  assert.equal(roleCan("reviewer", "businesses.extend"), false);
  assert.equal(roleCan("support", "messages.send"), true);
  assert.equal(roleCan("finance", "messages.send"), false);
  assert.equal(roleCan("support", "flash.end"), true);
  assert.equal(roleCan("finance", "flash.end"), false);
  assert.equal(roleCan("reviewer", "activity.view"), true);
  assert.equal(roleCan("support", "activity.view"), false);
});

test("deleting from the live activity feed is for the owner and reviewers, like admin_delete_activity() in 0059", () => {
  assert.equal(roleCan("owner", "activity.manage"), true);
  assert.equal(roleCan("reviewer", "activity.manage"), true);
  assert.equal(roleCan("finance", "activity.manage"), false);
  assert.equal(roleCan("support", "activity.manage"), false);
  assert.equal(roleCan(null, "activity.manage"), false);
  assert.equal(explain("reviewer", "activity.manage"), "");
  assert.equal(
    explain("support", "activity.manage"),
    "Only Owners and Reviewers can delete or clear items in the live activity feed. You are signed in as Support.",
  );
});

test("settings, the catalogue and admin accounts are owner only", () => {
  for (const action of ["settings.view", "settings.edit", "catalogue.edit", "admins.manage"]) {
    for (const role of ROLES.filter((r) => r !== "owner")) assert.equal(roleCan(role, action), false, `${role} ${action}`);
  }
});

test("every role has at least one thing to do besides the dashboard", () => {
  for (const role of ROLES) assert.ok(Object.keys(ACTIONS).some((a) => roleCan(role, a)), role);
});

test("explain names who can do it, and is empty when allowed", () => {
  assert.equal(explain("owner", "payments.confirm"), "");
  assert.equal(
    explain("support", "payments.confirm"),
    "Only Owners and Finance admins can confirm, reject or assign payments. You are signed in as Support.",
  );
  assert.match(explain(null, "payments.view"), /no admin role/);
  assert.equal(explain("owner", "nope"), "This action is not available.");
});
