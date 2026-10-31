import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, sql, ids } from "./db.mjs";

let c;
const A = ids.bizA;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const prefs = async (notifications) => {
  await sql(c, `delete from seller_settings where business_id = $1`, [A]);
  await sql(c, `insert into seller_settings (business_id, settings) values ($1, $2::jsonb)`, [A, JSON.stringify({ notifications })]);
};
const put = (kind, channel, at = "2030-01-01T09:00:00Z", extra = "false") =>
  sql(c, `insert into messages (business_id, channel, kind, subject, body, status, transactional, scheduled_at) values ($1, $2, $3, 's', 'b', $5, ${extra}, $4) returning id, status, read_at, scheduled_at`, [A, channel, kind, at, channel === "in_app" ? "sent" : "queued"]);
const clear = async () => {
  await sql(c, `delete from messages where business_id = $1`, [A]);
  await sql(c, `delete from seller_settings where business_id = $1`, [A]);
};

test("a text the seller switched off is never queued, one they kept is", async () => {
  await clear();
  await prefs({ events: { change_decision: { sms: false }, removal: { sms: true } } });
  assert.equal((await put("change", "sms")).length, 0);
  assert.equal((await put("removal", "sms")).length, 1);
  assert.equal((await sql(c, `select count(*)::int as n from messages where business_id = $1`, [A]))[0].n, 1);
});

test("critical events and messages with no matching event are never dropped or delayed", async () => {
  await clear();
  await prefs({ events: { expiry: { sms: false }, payment: { sms: false } } });
  for (const kind of ["reminder", "grace", "expiry", "payment", "question", "strike"]) {
    const [m] = await put(kind, "sms", "2030-01-01T09:00:00Z");
    assert.equal(new Date(m.scheduled_at).toISOString(), "2030-01-01T09:00:00.000Z", kind);
  }
  for (const kind of ["general", "approval"]) {
    const [m] = await put(kind, "sms", "2030-01-01T09:00:00Z");
    assert.equal(new Date(m.scheduled_at).toISOString(), "2030-01-01T09:00:00.000Z", kind);
  }
  assert.equal((await put("change", "sms", "2030-01-01T09:00:00Z", "true")).length, 1);
});

test("sellers have no quiet hours: a saved value is ignored and texts go out when they were scheduled", async () => {
  await clear();
  await prefs({ quiet_hours: { enabled: true, start: "21:00", end: "07:00" } });
  for (const at of ["2030-01-01T19:30:00Z", "2030-01-01T02:00:00Z", "2030-01-01T09:00:00Z"]) {  // 22:30, 05:00 and 12:00 Nairobi
    const m = (await put("removal", "sms", at))[0];
    assert.equal(new Date(m.scheduled_at).toISOString(), new Date(at).toISOString(), at);
  }
});

test("an in-app message the seller switched off arrives already read; one they kept stays unread", async () => {
  await clear();
  await prefs({ events: { customer_report: { in_app: false }, removal: { in_app: true } } });
  assert.notEqual((await put("report", "in_app"))[0].read_at, null);
  assert.equal((await put("removal", "in_app"))[0].read_at, null);
});

test("with nothing saved the defaults apply: removals text, customer reports do not", async () => {
  await clear();
  assert.equal((await put("removal", "sms"))[0].status, "queued");
  assert.equal((await put("report", "sms")).length, 0);
  assert.equal((await put("removal", "email")).length, 0);
});

test("public_businesses carries the three shop settings, the partial message only while something is unavailable", async () => {
  await sql(c, `update businesses set paid_until = now() + interval '20 days' where id = $1`, [A]);
  await sql(c, `update businesses set profile = '{"whatsapp_greeting":"Hi from {item}","show_closes_chip":false,"partial_closure_message":"Some things are out."}' where id = $1`, [A]);
  let row = (await sql(c, `select shop_settings from public_businesses where id = $1`, [A]))[0];
  assert.deepEqual(row.shop_settings, { whatsapp_greeting: "Hi from {item}", show_closes_chip: false });
  await sql(c, `insert into items (business_id, name, price, availability, visible, draft) values ($1, 'Sold out', 100, 'out_of_stock', true, false)`, [A]);
  row = (await sql(c, `select shop_settings from public_businesses where id = $1`, [A]))[0];
  assert.equal(row.shop_settings.partial_closure_message, "Some things are out.");
  await sql(c, `update businesses set profile = '{}' where id = $1`, [A]);
  assert.deepEqual((await sql(c, `select shop_settings from public_businesses where id = $1`, [A]))[0].shop_settings, {});
});
