import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, toApiError } from "./errors.js";

test("RPC exceptions keep their meaning", () => {
  assert.equal(toApiError({ message: "forbidden", code: "42501" }).code, "forbidden");
  assert.equal(toApiError({ message: "not_found", code: "P0001" }).code, "not_found");
  assert.equal(toApiError({ message: "invalid_status", code: "P0001" }).code, "invalid_status");
});

test("row-level security and permission failures read as forbidden", () => {
  assert.equal(toApiError({ message: "permission denied for table applications" }).code, "forbidden");
  assert.equal(toApiError({ message: "new row violates row-level security policy" }).code, "forbidden");
});

test("an expired session reads as unauthorized", () => {
  assert.equal(toApiError({ message: "JWT expired", code: "PGRST301" }).code, "unauthorized");
});

test("anything unknown becomes server_error and keeps the original on cause", () => {
  const raw = { message: "connection reset by peer" };
  const e = toApiError(raw);
  assert.equal(e.code, "server_error");
  assert.equal(e.cause, raw);
  assert.equal(toApiError(undefined).code, "server_error");
});

test("an ApiError passes through untouched", () => {
  const original = new ApiError("not_found");
  assert.equal(toApiError(original), original);
});
