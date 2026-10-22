import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, sql } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_apply_form" }));
  await seedFixtures(c);
});
after(async () => { await c.end(); });

// Same columns the submit-application function writes. `year` is a SQL literal so a test can pass null.
const insert = (idType, idNumber, year = "2020") =>
  sql(c, `
    insert into public.applications (status, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
      phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp,
      terms_version, privacy_version, authorised)
    values ('uploading', 'barber', 'standard', 500, '{}', 'Owner Name', $1, $2, '+254700000001', 'o@x.co', 'Biz', false, ${year}, 'SBP1', '2099-01-01',
      'Kisumu', 'Maseno', 'Market Road', -0.0, 34.6, '+254700000001', '1', '1', true)
    returning id`, [idType, idNumber]);

test("a Maisha Card applicant can be stored", async () => {
  const [row] = await insert("maisha_card", "123456789");
  const [saved] = await sql(c, `select owner_id_type, owner_id_number from public.applications where id = $1`, [row.id]);
  assert.deepEqual({ ...saved }, { owner_id_type: "maisha_card", owner_id_number: "123456789" });
});

test("National ID and passport still work", async () => {
  await insert("national_id", "12345678");
  await insert("passport", "A1234567");
});

test("an unknown ID type is still refused", async () => {
  await assert.rejects(insert("driving_licence", "12345678"), /applications_owner_id_type_check|violates check constraint/);
});

test("year established may be left out", async () => {
  const [row] = await insert("national_id", "12345678", "null");
  const [saved] = await sql(c, `select year_established from public.applications where id = $1`, [row.id]);
  assert.equal(saved.year_established, null);
});
