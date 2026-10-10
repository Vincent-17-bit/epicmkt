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

test("the mock mirrors the account rules: limits, locked fields, quotes and branches", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  await assert.rejects(mock.updateProfile({ tagline: "x".repeat(81) }), { code: "invalid_tagline" });
  await assert.rejects(mock.updateProfile({ logo_path: "other/logo.webp" }), { code: "invalid_logo_path" });
  const biz = await mock.getMyBusiness();
  await mock.updateProfile({ tagline: "Fresh cuts", logo_path: `${biz.id}/profile/logo.webp` });
  assert.equal((await mock.getMyBusiness()).tagline, "Fresh cuts");

  await assert.rejects(mock.requestChange("name", "A"), { code: "invalid_name" });
  await assert.rejects(mock.requestChange("name", biz.name), { code: "no_change" });
  await assert.rejects(mock.requestChange("location", "10,10"), { code: "invalid_location" });
  const dearer = await mock.requestChange("category_id", "salon");
  assert.ok(dearer.quote_kes > 0);
  assert.equal((await mock.getMyBusiness()).category_id, "barber", "the old value stays live");
  await mock.cancelChange(dearer.id);
  const cheaper = await mock.requestChange("category_id", "stall");
  assert.equal(cheaper.quote_kes, 0);
  const pin = await mock.requestChange("location", "-1.3,36.9");
  assert.equal(pin.new_value, "-1.300000,36.900000");

  await assert.rejects(mock.saveBranch({ name: "Westlands" }), { code: "premium_only" });
  mock.resetMock();
  await mock.login("ES100002", "Demo-Passw0rd");
  for (let i = 0; i < 5; i++) await mock.saveBranch({ name: `Branch ${i}`, phone: "0712 345 678" });
  await assert.rejects(mock.saveBranch({ name: "Sixth" }), { code: "limit_reached" });
  await assert.rejects(mock.saveBranch({ name: "Bad phone", id: (await mock.listBranches())[0].id, phone: "12" }), { code: "invalid_phone" });
  await mock.deleteBranch((await mock.listBranches())[0].id);
  assert.equal((await mock.listBranches()).length, 4);
  await assert.rejects(mock.updateProfile({ announcement: "Call 0712 345 678" }), { code: "invalid_announcement" });
  await mock.updateProfile({ announcement: "Open late on Fridays" });
  mock.resetMock();
});
