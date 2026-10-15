import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStatus } from "./status.js";

const user = { id: "u1", email: "a@b.c" };
const admin = { role: "reviewer" };

test("deriveStatus walks the sign-in flow", () => {
  assert.equal(deriveStatus(null), "signed_out");
  assert.equal(deriveStatus({ user: null }), "signed_out");
  assert.equal(deriveStatus({ user, admin: null, aal: "aal1", nextAal: "aal1" }), "no_access");
  assert.equal(deriveStatus({ user, admin: { role: "root" }, aal: "aal2", nextAal: "aal2" }), "no_access");
  assert.equal(deriveStatus({ user, admin, aal: "aal1", nextAal: "aal1" }), "needs_enrol");
  assert.equal(deriveStatus({ user, admin, aal: "aal1", nextAal: "aal2" }), "needs_challenge");
  assert.equal(deriveStatus({ user, admin, aal: "aal2", nextAal: "aal2" }), "ready");
});

test("a non-admin never reaches MFA, even at aal2", () => {
  assert.equal(deriveStatus({ user, admin: null, aal: "aal2", nextAal: "aal2" }), "no_access");
});
