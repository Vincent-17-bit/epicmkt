import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin, asService } from "./db.mjs";

let c;
const anon = { role: "anon" };
const PAID = "now() + interval '30 days'";

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `update businesses set paid_until = ${PAID}`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from messages; delete from audit_log; delete from items`);
  await sql(c, `update businesses set status = 'live', deleted_at = null, paid_until = ${PAID}`);
});

const item = async (biz, name = "Fade", price = 1000, extra = {}) => {
  const f = { price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  const rows = await sql(
    c,
    `insert into items (business_id, name, price, ${keys.join(", ")}) values ($1, $2, $3, ${keys.map((_, i) => `$${i + 4}`).join(", ")}) returning id`,
    [biz, name, price, ...keys.map((k) => f[k])],
  );
  return rows[0].id;
};

const make = (who, biz, itemId, o = {}) =>
  tx(
    c,
    who,
    async (k) =>
      (
        await sql(
          k,
          `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value, headline, quantity_note, after_end)
           values ($1, $2, now() + $3::interval, now() + $4::interval, $5, $6, $7, $8, $9) returning *`,
          [biz, itemId, o.start ?? "0 seconds", o.end ?? "6 hours", o.type ?? "percent", o.value ?? 20, o.headline ?? null, o.note ?? null, o.after ?? "keep"],
        )
      )[0],
    { commit: true },
  );

const age = (id, startAgo = "2 hours", endAgo = "1 minute") =>
  tx(
    c,
    null,
    async (k) => {
      await k.query(`set local session_replication_role = replica`);
      await k.query(`update flash_sales set starts_at = now() - $2::interval, ends_at = now() - $3::interval where id = $1`, [id, startAgo, endAgo]);
    },
    { commit: true },
  );

const visible = async () => (await tx(c, anon, (k) => sql(k, `select id from public_flash_sales`))).map((r) => r.id);
const row = async (id) => (await sql(c, `select * from flash_sales where id = $1`, [id]))[0];
const audits = async (action) => sql(c, `select * from audit_log where action = $1 order by id`, [action]);
const inbox = async () => sql(c, `select * from messages where channel = 'in_app' order by created_at`);

test("anyone can read the server clock; nobody can read the table directly", async () => {
  const t = await tx(c, anon, (k) => sql(k, `select get_server_time() as t`));
  assert.ok(Math.abs(new Date(t[0].t).getTime() - Date.now()) < 5000);
  await rejects(c, anon, `select * from flash_sales`, [], /permission denied/);
  await rejects(c, anon, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ('${ids.bizA}', gen_random_uuid(), now() + interval '1 hour', 'percent', 10)`, [], /permission denied/);
  await rejects(c, anon, `select seller_end_flash_sale(gen_random_uuid())`, [], /permission denied/);
});

test("the public view returns live sales with server-computed prices and nothing else", async () => {
  const percent = await make(asA, ids.bizA, await item(ids.bizA, "Fade", 1000), { type: "percent", value: 20 });
  const rows = await tx(c, anon, (k) => sql(k, `select * from public_flash_sales where id = $1`, [percent.id]));
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual([Number(r.regular_price), Number(r.sale_price), Number(r.savings), Number(r.discount_percent)], [1000, 800, 200, 20]);
  assert.equal(r.business_slug, "shop-a");
  assert.ok(r.remaining_ms > 5.9 * 3600000 && r.remaining_ms <= 6 * 3600000);
  assert.ok(Math.abs(new Date(r.server_now).getTime() - Date.now()) < 5000);

  const off = await make(asB, ids.bizB, await item(ids.bizB, "Beard", 500), { type: "amount_off", value: 120 });
  const fixed = await make(asB, ids.bizB, await item(ids.bizB, "Wash", 333), { type: "sale_price", value: 199 });
  const odd = await make(asB, ids.bizB, await item(ids.bizB, "Odd", 999), { type: "percent", value: 15 });
  const got = Object.fromEntries((await tx(c, anon, (k) => sql(k, `select id, sale_price from public_flash_sales`))).map((x) => [x.id, Number(x.sale_price)]));
  assert.equal(got[off.id], 380);
  assert.equal(got[fixed.id], 199);
  assert.equal(got[odd.id], 849);
});

test("the view hides future, ended, cancelled, hidden, out of stock and inactive-business sales", async () => {
  const live = await make(asAdmin, ids.bizB, await item(ids.bizB, "Live"));
  const future = await make(asAdmin, ids.bizB, await item(ids.bizB, "Future"), { start: "2 hours", end: "5 hours" });
  const ended = await make(asAdmin, ids.bizB, await item(ids.bizB, "Ended"));
  const cancelled = await make(asAdmin, ids.bizB, await item(ids.bizB, "Cancelled"), { start: "2 hours", end: "5 hours" });
  const hiddenItem = await item(ids.bizB, "Hidden");
  const hidden = await make(asAdmin, ids.bizB, hiddenItem);
  const stockItem = await item(ids.bizB, "Stock");
  const stock = await make(asAdmin, ids.bizB, stockItem);
  const sellerHideItem = await item(ids.bizB, "Seller hidden");
  const sellerHide = await make(asAdmin, ids.bizB, sellerHideItem);

  await age(ended.id);
  await tx(c, asB, (k) => k.query(`select seller_end_flash_sale($1)`, [cancelled.id]), { commit: true });
  const all = [live, future, ended, cancelled, hidden, stock, sellerHide].map((s) => s.id);
  assert.deepEqual((await visible()).filter((id) => all.includes(id)).sort(), [live.id, hidden.id, stock.id, sellerHide.id].sort());

  await sql(c, `update items set availability = 'out_of_stock' where id = $1`, [stockItem]);
  await sql(c, `update items set visible = false where id = $1`, [sellerHideItem]);
  await sql(c, `update items set hidden_by_admin = true where id = $1`, [hiddenItem]);
  assert.deepEqual((await visible()).filter((id) => all.includes(id)), [live.id]);

  await sql(c, `update items set availability = 'available', visible = true where id = $1`, [sellerHideItem]);
  assert.ok((await visible()).includes(sellerHide.id), "hiding by the seller is reversible");

  for (const [status, paid] of [["paused", PAID], ["pending", PAID], ["live", "now() - interval '5 days'"], ["live", "null"]]) {
    await sql(c, `update businesses set status = '${status}', paid_until = ${paid} where id = '${ids.bizB}'`);
    assert.deepEqual((await visible()).filter((id) => id === live.id), [], `${status} ${paid}`);
    await sql(c, `update businesses set status = 'live', paid_until = ${PAID} where id = '${ids.bizB}'`);
  }
  assert.ok((await visible()).includes(live.id));
  await sql(c, `update businesses set deleted_at = now() where id = '${ids.bizB}'`);
  assert.deepEqual((await visible()).filter((id) => id === live.id), []);
});

test("the view stops showing a sale at ends_at even before the job runs", async () => {
  const s = await make(asB, ids.bizB, await item(ids.bizB));
  assert.ok((await visible()).includes(s.id));
  await age(s.id);
  assert.equal((await row(s.id)).status, "live", "the job has not run");
  assert.ok(!(await visible()).includes(s.id));
});

test("a sale needs a real discount on a priced, listed, in-stock item of the same business", async () => {
  const own = await item(ids.bizA, "Own", 1000);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'percent', 100)`, [ids.bizA, own], /discount_too_large|flash_sales_value/);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'amount_off', 1000)`, [ids.bizA, own], /discount_too_large/);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'sale_price', 0)`, [ids.bizA, own], /discount_too_large|flash_sales_value/);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'sale_price', 1000)`, [ids.bizA, own], /sale_price_not_lower/);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'sale_price', 1500)`, [ids.bizA, own], /sale_price_not_lower/);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() - interval '1 hour', 'percent', 10)`, [ids.bizA, own], /ends_in_past|invalid_window/);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '7 days 1 minute', 'percent', 10)`, [ids.bizA, own], /duration_too_long/);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value, headline) values ($1, $2, now() + interval '1 hour', 'percent', 10, 'x')`, [ids.bizA, own], /flash_sales_headline_check/);
  const week = await make(asA, ids.bizA, own, { end: "7 days" });
  assert.equal(week.status, "live");

  const contact = await item(ids.bizA, "Contact", null, { price_type: "contact" });
  const range = await item(ids.bizA, "Range", 100, { price_type: "range" });
  await rejects(c, asB, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'percent', 10)`, [ids.bizB, own], /item_not_found/);
  await sql(c, `delete from flash_sales`);
  for (const bad of [contact, range]) {
    await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'percent', 10)`, [ids.bizA, bad], /item_not_discountable/);
  }
  const hidden = await item(ids.bizA, "Hidden", 100, { visible: false });
  const out = await item(ids.bizA, "Out", 100, { availability: "out_of_stock" });
  const admin = await item(ids.bizA, "Admin", 100, { hidden_by_admin: true });
  for (const bad of [hidden, out, admin]) {
    await rejects(c, asService, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'percent', 10)`, [ids.bizA, bad], /item_unavailable/);
  }
  await sql(c, `update businesses set status = 'paused' where id = '${ids.bizA}'`);
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'percent', 10)`, [ids.bizA, own], /business_not_active/);
});

test("a start in the past becomes now; a future start stays scheduled; clients cannot pick the status", async () => {
  const id1 = await item(ids.bizB, "Alpha");
  const past = await tx(c, asB, async (k) => (await sql(k, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value, status, ended_at, ended_reason) values ($1, $2, now() - interval '3 hours', now() + interval '2 hours', 'percent', 10, 'ended', now(), 'time') returning *`, [ids.bizB, id1]))[0], { commit: true });
  assert.equal(past.status, "live");
  assert.equal(past.ended_at, null);
  assert.ok(new Date(past.starts_at).getTime() > Date.now() - 5000);
  const later = await make(asB, ids.bizB, await item(ids.bizB, "Bravo"), { start: "3 hours", end: "5 hours" });
  assert.equal(later.status, "scheduled");
});

test("one live or scheduled sale per item", async () => {
  const it = await item(ids.bizB);
  await make(asB, ids.bizB, it, { start: "1 hour", end: "2 hours" });
  await rejects(c, asB, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '90 minutes', now() + interval '3 hours', 'percent', 10)`, [ids.bizB, it], /item_has_sale/);
  const after = await make(asB, ids.bizB, it, { start: "3 hours", end: "4 hours" });
  assert.equal(after.status, "scheduled");
});

test("plan limits: concurrent and per month, with clear errors", async () => {
  const [a, b, d, e] = [await item(ids.bizA, "One"), await item(ids.bizA, "Two"), await item(ids.bizA, "Three"), await item(ids.bizA, "Four")];
  const first = await make(asA, ids.bizA, a, { start: "0 seconds", end: "1 hour" });
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '30 minutes', 'percent', 10)`, [ids.bizA, b], /limit_reached:flash_concurrent/);
  await make(asA, ids.bizA, b, { start: "2 hours", end: "3 hours" });
  await make(asA, ids.bizA, d, { start: "4 hours", end: "5 hours" });
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '6 hours', now() + interval '7 hours', 'percent', 10)`, [ids.bizA, e], /limit_reached:flash_per_month/);
  await tx(c, asA, (k) => k.query(`select seller_end_flash_sale($1)`, [first.id]), { commit: true });
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '6 hours', now() + interval '7 hours', 'percent', 10)`, [ids.bizA, e], /limit_reached:flash_per_month/);
  const cancelled = (await sql(c, `select id from flash_sales where business_id = $1 and starts_at > now() order by starts_at limit 1`, [ids.bizA]))[0];
  await tx(c, asA, (k) => k.query(`select seller_end_flash_sale($1)`, [cancelled.id]), { commit: true });
  assert.equal((await row(cancelled.id)).status, "cancelled");
  const again = await make(asA, ids.bizA, e, { start: "6 hours", end: "7 hours" });
  assert.equal(again.status, "scheduled");

  const premium = [];
  for (let i = 0; i < 5; i++) premium.push(await make(asB, ids.bizB, await item(ids.bizB, `Prem ${i}`)));
  await rejects(c, asB, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'percent', 10)`, [ids.bizB, await item(ids.bizB, "Prem six")], /limit_reached:flash_concurrent/);
  const admin = await make(asAdmin, ids.bizB, await item(ids.bizB, "Admin made"));
  assert.equal(admin.status, "live", "admins are not limited");
});

test("a seller cannot touch another business", async () => {
  const mine = await make(asA, ids.bizA, await item(ids.bizA));
  const theirs = await make(asB, ids.bizB, await item(ids.bizB));
  await rejects(c, asA, `insert into flash_sales (business_id, item_id, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 hour', 'percent', 10)`, [ids.bizB, (await sql(c, `select item_id from flash_sales where id = '${theirs.id}'`))[0].item_id], /row-level security|item_not_found/);
  await tx(c, asA, async (k) => {
    assert.deepEqual((await sql(k, `select id from flash_sales`)).map((r) => r.id), [mine.id]);
    assert.equal((await k.query(`update flash_sales set headline = 'hacked' where id = $1`, [theirs.id])).rowCount, 0);
    assert.equal((await k.query(`delete from flash_sales where id = $1`, [theirs.id])).rowCount, 0);
  });
  await rejects(c, asA, `select seller_end_flash_sale($1)`, [theirs.id], /not_found/);
  await rejects(c, asA, `select extend_flash_sale($1, now() + interval '9 hours')`, [theirs.id], /forbidden/);
  assert.equal((await row(theirs.id)).status, "live");
});

test("after the start only the headline and note can change; the window moves only through the audited function", async () => {
  const s = await make(asA, ids.bizA, await item(ids.bizA), { headline: "Weekend deal", end: "2 hours" });
  const edit = (set) => tx(c, asA, (k) => k.query(`update flash_sales set ${set} where id = '${s.id}'`), { commit: true });
  await edit(`headline = 'Updated deal', quantity_note = 'While stock lasts'`);
  assert.equal((await row(s.id)).headline, "Updated deal");
  for (const set of [
    `ends_at = ends_at + interval '1 hour'`,
    `starts_at = starts_at - interval '1 hour'`,
    `discount_value = 50`,
    `discount_type = 'amount_off'`,
    `after_end = 'unlist'`,
  ]) await rejects(c, asA, `update flash_sales set ${set} where id = '${s.id}'`, [], /flash_locked/);
  for (const set of [`status = 'ended'`, `status = 'cancelled'`, `ended_reason = 'seller'`, `ended_at = now()`]) {
    await rejects(c, asA, `update flash_sales set ${set} where id = '${s.id}'`, [], /flash_status_protected/);
  }
  await rejects(c, asA, `update flash_sales set business_id = '${ids.bizB}' where id = '${s.id}'`, [], /flash_immutable|row-level security/);
  await rejects(c, asAdmin, `update flash_sales set ends_at = ends_at + interval '1 hour' where id = '${s.id}'`, [], /flash_locked/);
  await rejects(c, asAdmin, `update flash_sales set status = 'ended' where id = '${s.id}'`, [], /flash_status_protected/);

  const before = (await row(s.id)).ends_at;
  const extended = await tx(c, asA, async (k) => (await sql(k, `select * from extend_flash_sale($1, $2::timestamptz, 'Busy day')`, [s.id, new Date(new Date(before).getTime() + 3600000).toISOString()]))[0], { commit: true });
  assert.equal(new Date(extended.ends_at).getTime() - new Date(before).getTime(), 3600000);
  const logs = await audits("flash_sale.extended");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].actor_role, "seller");
  assert.equal(logs[0].data.reason, "Busy day");
  assert.equal(logs[0].business_id, ids.bizA);
  await rejects(c, asA, `select extend_flash_sale($1, $2::timestamptz)`, [s.id, new Date(new Date(before).getTime()).toISOString()], /invalid_window/);
  await rejects(c, asA, `select extend_flash_sale($1, now() + interval '8 days')`, [s.id], /duration_too_long/);
  assert.equal((await audits("flash_sale.updated")).length, 1, "the headline edit is audited, the window change is logged as an extension");
});

test("before the start a seller can still reshape the sale", async () => {
  const s = await make(asA, ids.bizA, await item(ids.bizA, "Soon", 1000), { start: "2 hours", end: "4 hours" });
  await tx(c, asA, (k) => k.query(`update flash_sales set discount_value = 30, ends_at = now() + interval '5 hours', after_end = 'unlist' where id = $1`, [s.id]), { commit: true });
  const r = await row(s.id);
  assert.deepEqual([Number(r.discount_value), r.after_end], [30, "unlist"]);
  await rejects(c, asA, `update flash_sales set discount_value = 1000, discount_type = 'amount_off' where id = $1`, [s.id], /discount_too_large/);
  await rejects(c, asA, `update flash_sales set ends_at = starts_at + interval '8 days' where id = $1`, [s.id], /duration_too_long/);
  await tx(c, asA, (k) => k.query(`update flash_sales set starts_at = now() - interval '1 hour' where id = $1`, [s.id]), { commit: true });
  const now = await row(s.id);
  assert.equal(now.status, "live");
  assert.ok(new Date(now.starts_at).getTime() > Date.now() - 5000);
  assert.equal((await audits("flash_sale.updated")).length, 2);
});

test("ending: a seller cancels before the start and ends after it; closed sales cannot be touched", async () => {
  const future = await make(asA, ids.bizA, await item(ids.bizA, "Future one"), { start: "5 hours", end: "6 hours" });
  const out = await tx(c, asA, async (k) => (await sql(k, `select * from seller_end_flash_sale($1)`, [future.id]))[0], { commit: true });
  assert.deepEqual([out.status, out.ended_reason], ["cancelled", "seller"]);
  const live = await make(asA, ids.bizA, await item(ids.bizA, "Live one"), { after: "unlist" });
  const ended = await tx(c, asA, async (k) => (await sql(k, `select * from seller_end_flash_sale($1)`, [live.id]))[0], { commit: true });
  assert.deepEqual([ended.status, ended.ended_reason], ["ended", "seller"]);
  const lItem = (await row(live.id)).item_id;
  assert.deepEqual((await sql(c, `select visible, unlist_reason from items where id = $1`, [lItem]))[0], { visible: false, unlist_reason: "flash_ended" });
  await rejects(c, asA, `select seller_end_flash_sale($1)`, [live.id], /flash_closed/);
  await rejects(c, asA, `update flash_sales set headline = 'late' where id = $1`, [live.id], /flash_closed/);
  assert.equal((await audits("flash_sale.ended")).length, 2);
  assert.equal((await inbox()).length, 0, "the seller is not notified about their own action");
  await sql(c, `update items set visible = true where id = $1`, [lItem]);
  assert.equal((await sql(c, `select unlist_reason from items where id = $1`, [lItem]))[0].unlist_reason, null, "relisting clears the reason");
});

test("the expiry job ends sales, applies keep or unlist, notifies and audits; it is idempotent", async () => {
  const keepItem = await item(ids.bizB, "Keep", 800);
  const unlistItem = await item(ids.bizB, "Unlist", 800);
  const futureItem = await item(ids.bizB, "Future", 800);
  const fresh = await item(ids.bizB, "Fresh", 800);
  const keep = await make(asB, ids.bizB, keepItem, { after: "keep" });
  const unlist = await make(asB, ids.bizB, unlistItem, { after: "unlist" });
  const future = await make(asB, ids.bizB, futureItem, { start: "1 hour", end: "2 hours" });
  const running = await make(asB, ids.bizB, fresh);
  await age(keep.id);
  await age(unlist.id);
  await age(future.id, "30 minutes", "10 seconds");
  await sql(c, `update flash_sales set status = 'scheduled' where id = '${future.id}'`);

  await rejects(c, asB, `select flash_sales_sweep()`, [], /permission denied/);
  await rejects(c, anon, `select flash_sales_sweep()`, [], /permission denied/);
  const n = await tx(c, asService, async (k) => (await sql(k, `select flash_sales_sweep() as n`))[0].n, { commit: true });
  assert.equal(n, 3);

  for (const id of [keep.id, unlist.id, future.id]) {
    const r = await row(id);
    assert.deepEqual([r.status, r.ended_reason], ["ended", "time"], id);
    assert.ok(r.ended_at);
  }
  assert.equal((await row(running.id)).status, "live");
  assert.deepEqual((await sql(c, `select visible from items where id = $1`, [keepItem]))[0], { visible: true });
  assert.deepEqual((await sql(c, `select price, visible, unlist_reason from items where id = $1`, [unlistItem]))[0], { price: "800.00", visible: false, unlist_reason: "flash_ended" });
  assert.equal((await inbox()).length, 3);
  assert.match((await inbox()).find((m) => m.data.item_id === unlistItem).body, /unlisted/);
  const logs = await audits("flash_sale.ended");
  assert.equal(logs.length, 3);
  assert.ok(logs.every((l) => l.actor_role === "system" && l.data.ended_reason === "time"));

  const again = await tx(c, asService, async (k) => (await sql(k, `select flash_sales_sweep() as n`))[0].n, { commit: true });
  assert.equal(again, 0);
  assert.equal((await inbox()).length, 3);
  assert.equal((await visible()).length, 1);
});

test("the job turns a due scheduled sale live", async () => {
  const s = await make(asB, ids.bizB, await item(ids.bizB), { start: "1 hour", end: "3 hours" });
  await age(s.id, "1 minute", "-2 hours");
  assert.equal((await row(s.id)).status, "scheduled");
  assert.ok((await visible()).includes(s.id), "the view does not wait for the job");
  const n = await tx(c, asService, async (k) => (await sql(k, `select flash_sales_sweep() as n`))[0].n, { commit: true });
  assert.equal(n, 1);
  assert.equal((await row(s.id)).status, "live");
});

test("sales end by themselves when the item is removed, the business is suspended, expires or is deleted", async () => {
  const removedItem = await item(ids.bizB, "Removed");
  const removed = await make(asB, ids.bizB, removedItem);
  await sql(c, `update items set removed_by_admin = true where id = $1`, [removedItem]);
  assert.deepEqual([(await row(removed.id)).status, (await row(removed.id)).ended_reason], ["ended", "item_removed"]);

  const hiddenItem = await item(ids.bizB, "Hidden");
  const hidden = await make(asB, ids.bizB, hiddenItem, { after: "unlist" });
  await sql(c, `update items set hidden_by_admin = true where id = $1`, [hiddenItem]);
  assert.equal((await row(hidden.id)).ended_reason, "item_removed");
  assert.equal((await sql(c, `select unlist_reason from items where id = $1`, [hiddenItem]))[0].unlist_reason, null, "an admin action is not undone by the unlist rule");

  const one = await make(asB, ids.bizB, await item(ids.bizB, "Sus one"));
  await sql(c, `update businesses set status = 'suspended' where id = '${ids.bizB}'`);
  assert.equal((await row(one.id)).ended_reason, "admin");
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizB}'`);
  assert.equal((await row(one.id)).status, "ended", "reinstating the business does not revive a sale");

  const two = await make(asB, ids.bizB, await item(ids.bizB, "Sus two"));
  await sql(c, `update businesses set status = 'expired' where id = '${ids.bizB}'`);
  assert.equal((await row(two.id)).ended_reason, "subscription");
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizB}'`);

  const three = await make(asB, ids.bizB, await item(ids.bizB, "Sus three"));
  await sql(c, `update businesses set deleted_at = now() where id = '${ids.bizB}'`);
  assert.equal((await row(three.id)).ended_reason, "subscription");
  await sql(c, `update businesses set deleted_at = null where id = '${ids.bizB}'`);

  const four = await make(asB, ids.bizB, await item(ids.bizB, "Sus four"));
  await sql(c, `update businesses set paid_until = now() - interval '5 days' where id = '${ids.bizB}'`);
  await tx(c, asService, (k) => k.query(`select flash_sales_sweep()`), { commit: true });
  assert.equal((await row(four.id)).ended_reason, "subscription", "the job catches an unpaid listing");

  const five = await make(asB, ids.bizB, await item(ids.bizB, "Sus five"), {}).catch((e) => e);
  assert.match(String(five.message), /business_not_active/);
  assert.ok((await inbox()).length >= 5);
});

test("a paused business keeps its sale, which comes back with the business", async () => {
  const s = await make(asB, ids.bizB, await item(ids.bizB));
  await sql(c, `update businesses set status = 'paused' where id = '${ids.bizB}'`);
  await tx(c, asService, (k) => k.query(`select flash_sales_sweep()`), { commit: true });
  assert.equal((await row(s.id)).status, "live");
  assert.ok(!(await visible()).includes(s.id));
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizB}'`);
  assert.ok((await visible()).includes(s.id));
});

test("an admin ends any sale with a reason: audited and the seller is told", async () => {
  const s = await make(asB, ids.bizB, await item(ids.bizB, "Hot", 1000), { after: "unlist" });
  await rejects(c, asB, `select admin_end_flash_sale($1, 'because')`, [s.id], /forbidden/);
  await rejects(c, asAdmin, `select admin_end_flash_sale($1, ' ')`, [s.id], /reason_required/);
  const out = await tx(c, asAdmin, async (k) => (await sql(k, `select * from admin_end_flash_sale($1, 'Misleading price')`, [s.id]))[0], { commit: true });
  assert.deepEqual([out.status, out.ended_reason], ["ended", "admin"]);
  assert.ok(!(await visible()).includes(s.id));
  assert.equal((await sql(c, `select visible from items where id = $1`, [out.item_id]))[0].visible, true, "an admin stop does not unlist the item");
  const log = (await audits("flash_sale.ended"))[0];
  assert.equal(log.actor_role, "admin");
  assert.equal(log.data.reason, "Misleading price");
  const note = (await inbox())[0];
  assert.match(note.body, /Misleading price/);
  assert.equal(note.business_id, ids.bizB);
  await rejects(c, asAdmin, `select admin_end_flash_sale($1, 'again please')`, [s.id], /flash_closed/);
  const all = await tx(c, asAdmin, (k) => sql(k, `select id from flash_sales`));
  assert.equal(all.length, 1);
});

test("deleting an item removes its sales and tells the clients", async () => {
  const it = await item(ids.bizB);
  const s = await make(asB, ids.bizB, it);
  await sql(c, `delete from items where id = $1`, [it]);
  assert.equal((await sql(c, `select id from flash_sales where id = $1`, [s.id])).length, 0);
  assert.ok(!(await visible()).includes(s.id));
});

test("the job and the view agree on what is live", async () => {
  const ids_ = [];
  for (let i = 0; i < 4; i++) ids_.push((await make(asB, ids.bizB, await item(ids.bizB, `Item ${i}`), { end: `${i + 1} hours` })).id);
  await age(ids_[0]);
  await tx(c, asService, (k) => k.query(`select flash_sales_sweep()`), { commit: true });
  const viaStatus = (await sql(c, `select id from flash_sales where status in ('scheduled','live') order by id`)).map((r) => r.id);
  assert.deepEqual((await visible()).sort(), viaStatus);
});
