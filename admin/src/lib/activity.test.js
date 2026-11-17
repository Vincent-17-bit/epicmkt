import { test } from "node:test";
import assert from "node:assert/strict";
import { describeActivity } from "./activity.js";

test("a new application names the applicant's business and links to the queue", () => {
  const r = describeActivity({ kind: "application_submitted", business_name: "Umoja Market", data: { reference_no: "EPM-1" } });
  assert.equal(r.text, "New application from Umoja Market");
  assert.equal(r.to, "/admin/applications");
});

test("payments say what kind they are and which business", () => {
  assert.equal(describeActivity({ kind: "payment_submitted", business_name: "Shop A", data: { kind: "renewal" } }).text, "Shop A submitted a renewal payment to confirm");
  assert.equal(describeActivity({ kind: "payment_submitted", business_name: "Shop A", data: {} }).text, "Shop A submitted a payment to confirm");
  assert.equal(describeActivity({ kind: "payment_confirmed", business_name: "Shop A", data: { receipt: "EPM-R-2026-000001" } }).text, "Payment confirmed for Shop A (EPM-R-2026-000001)");
  assert.equal(describeActivity({ kind: "payment_rejected", business_name: "Shop A" }).to, "/admin/payments");
});

test("change requests use a readable field name and fall back when it is unknown", () => {
  assert.equal(describeActivity({ kind: "change_request", business_name: "Shop A", data: { field: "category_id" } }).text, "Shop A asked to change their category");
  assert.equal(describeActivity({ kind: "change_request", business_name: "Shop A", data: { field: "weird" } }).text, "Shop A asked to change a detail");
});

test("admin actions name who did them", () => {
  assert.equal(describeActivity({ kind: "application.open", actor: "reviewer@test" }).text, "reviewer@test started reviewing an application");
  assert.equal(describeActivity({ kind: "application.open" }).text, "The system started reviewing an application");
});

test("a kind it does not know still reads as a sentence, without made-up detail", () => {
  assert.equal(describeActivity({ kind: "payment.confirm", business_name: "Shop A", actor: "ao@test" }).text, "Payment confirm on Shop A (ao@test)");
  assert.equal(describeActivity({ kind: "" }).text, "Activity");
  assert.equal(describeActivity({ kind: "profile_updated" }).to, null);
});

test("a missing business name never prints 'null' or 'undefined'", () => {
  for (const kind of ["payment_submitted", "flag_reply", "listing_paused", "deletion_requested"]) {
    const { text } = describeActivity({ kind, business_name: null, data: null });
    assert.ok(!/null|undefined/.test(text), text);
    assert.ok(text.startsWith("A business"), text);
  }
});

test("demo rows keep their own text; empty input is safe", () => {
  assert.deepEqual(describeActivity({ text: "Sample line" }), { text: "Sample line", to: null });
  assert.deepEqual(describeActivity(null), { text: "", to: null });
});

test("a note opens the exact business or application when the row names one, else the list", () => {
  assert.equal(describeActivity({ kind: "change_request", business_id: "b9", business_name: "Shop A", data: {} }).to, "/admin/businesses/b9");
  assert.equal(describeActivity({ kind: "flag_reply", business_name: "Shop A", data: { business_id: "b7" } }).to, "/admin/businesses/b7");
  assert.equal(describeActivity({ kind: "listing_paused", business_name: "Shop A", data: {} }).to, "/admin/businesses");
  assert.equal(describeActivity({ kind: "application_submitted", business_name: "X", data: { application_id: "a5" } }).to, "/admin/applications/a5");
});
