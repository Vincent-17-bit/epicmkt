import test from "node:test";
import assert from "node:assert/strict";
import { describeLoadError } from "./errorCopy.js";

test("known codes give a specific problem and fix", () => {
  assert.match(describeLoadError({ code: "unauthorized" }).fix, /sign in again/i);
  assert.match(describeLoadError({ code: "forbidden" }).problem, /can't view/);
  assert.match(describeLoadError({ code: "rate_limited" }).fix, /Wait a minute/);
});

test("a network failure says to check the connection", () => {
  const out = describeLoadError(new TypeError("Failed to fetch"));
  assert.match(out.problem, /couldn't reach/);
  assert.match(out.fix, /internet connection/);
});

test("an unknown error keeps a short readable detail and drops bare codes", () => {
  assert.equal(describeLoadError(new Error("relation does not exist")).detail, "relation does not exist");
  assert.equal(describeLoadError(new Error("server_error")).detail, "");
  assert.equal(describeLoadError(null).problem, "The server returned an error.");
});
