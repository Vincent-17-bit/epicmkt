import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDiscount } from "./flash.js";

test("discount wording matches the demo data", () => {
  assert.equal(describeDiscount("percent", "20.00"), "20% off");
  assert.equal(describeDiscount("amount_off", 200), "KES 200 off");
  assert.equal(describeDiscount("sale_price", 3500), "Sale price KES 3,500");
});
