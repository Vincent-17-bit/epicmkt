// npm run seed:types  loads every wave 5 product type (A24 to A28) into the database in DATABASE_URL. Safe to run again.
import pg from "pg";
import { ALL_TYPES, seedProductTypes } from "./seeds/index.mjs";
import { validateProductType } from "../shared/src/index.js";

const bad = ALL_TYPES.map((t) => validateProductType(t)).filter((r) => !r.ok);
if (bad.length) { console.error(bad.flatMap((r) => r.errors).join("\n")); process.exit(1); }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const r = await seedProductTypes(client);
  console.log(`Seeded ${r.types} product types (${r.departments} new departments).`);
} finally { await client.end(); }
