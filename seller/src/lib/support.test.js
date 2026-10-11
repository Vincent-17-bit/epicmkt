import { test } from "node:test";
import assert from "node:assert/strict";
import { supportChannels, supportContact, upgradeRequest } from "./support.js";

const env = { VITE_CONTACT_EMAIL: "help@epicmkt.test", VITE_CONTACT_PHONE: "0712 345 678", VITE_CONTACT_WHATSAPP: "+254722111222", VITE_SUPPORT_HOURS: "Mon to Fri, 8am to 5pm" };
const plan = { current: "standard", plans: [{ key: "standard", priceKes: 500, itemsLimit: 25, topBenefits: [] }, { key: "premium", priceKes: 1300, itemsLimit: 70, topBenefits: [] }] };
const business = { name: "Fade Kings", sellerId: "ES100001" };

test("channels are real links built from the same variables the public contact page uses", () => {
  const ch = supportChannels({ subject: "Upgrade request", message: "Hello & thanks" }, env);
  assert.deepEqual(ch.map((c) => c.key), ["email", "whatsapp", "phone"]);
  assert.equal(ch[0].href, "mailto:help@epicmkt.test?subject=Upgrade%20request&body=Hello%20%26%20thanks");
  assert.equal(ch[1].href, "https://wa.me/254722111222?text=Hello%20%26%20thanks");
  assert.equal(ch[1].external, true);
  assert.equal(ch[2].href, "tel:+254712345678");
  assert.equal(supportContact(env).hours, "Mon to Fri, 8am to 5pm");
});

test("a channel appears only when its detail is configured; none configured means none", () => {
  assert.deepEqual(supportChannels({}, { VITE_CONTACT_EMAIL: "a@b.test" }).map((c) => c.key), ["email"]);
  assert.deepEqual(supportChannels({}, {}), []);
  assert.deepEqual(supportChannels({}, { VITE_CONTACT_PHONE: "" }), []);
});

test("the upgrade request names the business, the seller id and both plans", () => {
  const r = upgradeRequest({ business, plan });
  assert.equal(r.subject, "Upgrade request: Fade Kings to Premium");
  assert.match(r.message, /Fade Kings \(Seller ID ES100001\)/);
  assert.match(r.message, /from Standard to Premium/);
  assert.equal(upgradeRequest({ business, plan: { ...plan, current: "premium" } }), null, "nothing to request on the highest plan");
  assert.match(upgradeRequest({ business: { name: "X" }, plan }).message, /upgrade X from/);
});
