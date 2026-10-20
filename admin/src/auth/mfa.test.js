import { test } from "node:test";
import assert from "node:assert/strict";
import { mfaStage } from "./mfa.js";

test("a verified session is ready", () => {
  assert.equal(mfaStage({ currentLevel: "aal2", nextLevel: "aal2" }), "ready");
});
test("an authenticator that has not been used this session means a code is asked for", () => {
  assert.equal(mfaStage({ currentLevel: "aal1", nextLevel: "aal2" }), "needsChallenge");
});
test("no authenticator yet means setup", () => {
  assert.equal(mfaStage({ currentLevel: "aal1", nextLevel: "aal1" }), "needsEnrol");
  assert.equal(mfaStage({}), "needsEnrol");
  assert.equal(mfaStage(), "needsEnrol");
});
