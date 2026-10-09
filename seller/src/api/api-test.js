import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SELLER_API } from "./contract.js";
import * as mock from "./mock.js";

const exportsOf = (file) => [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/export const (\w+)/g)].map((m) => m[1]);

test("mock and live expose the same functions under the same names", async () => {
  const live = exportsOf("./live.js").filter((n) => SELLER_API.includes(n)).sort();
  assert.deepEqual(live, [...SELLER_API].sort());
  for (const name of SELLER_API) assert.equal(typeof mock[name], "function", name);
  const index = exportsOf("./index.js");
  for (const name of SELLER_API) assert.ok(index.includes(name), `index exports ${name}`);
});

test("the mock enforces lockout, password rules and the allow-list", async () => {
  mock.resetMock();
  await assert.rejects(mock.updateProfile({ tagline: "x" }), { code: "unauthorized" });
  for (let i = 0; i < 4; i++) await assert.rejects(mock.login("ES100001", "nope"), { code: "invalid_credentials" });
  await assert.rejects(mock.login("ES100001", "nope"), { code: "locked" });
  await assert.rejects(mock.login("ES100001", "Demo-Passw0rd"), { code: "locked" });
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  await assert.rejects(mock.updateProfile({ status: "live" }), { code: "field_not_allowed" });
  await assert.rejects(mock.updateProfile({ announcement: "Sale" }), { code: "premium_only" });
  await assert.rejects(mock.changePassword({ code: "123456", newPassword: "short" }), { code: "weak_password" });
  await assert.rejects(mock.changePassword({ code: "000000", newPassword: "Brand-New-Pass1" }), { code: "invalid_code" });
  await mock.changePassword({ code: "123456", newPassword: "Brand-New-Pass1" });
  await mock.requestChange("town", "Kisumu");
  await assert.rejects(mock.requestChange("town", "Nairobi"), { code: "change_already_pending" });
  assert.equal(await mock.pauseListing(true), "paused");
  await assert.rejects(mock.pauseListing(true), { code: "invalid_status" });
});
