import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const adminEmail = process.env.ADMIN_EMAIL || "admin@epicmkt.app";
const adminName = process.env.ADMIN_NAME || "EpicMKT Admin";

console.log(`Seed admin: ${adminName} <${adminEmail}>`);
console.log("Add the user in Supabase Auth, then run the SQL below in the SQL editor:");
console.log(`
insert into public.admins (user_id, role, email, display_name)
select id, 'owner', '${adminEmail}', '${adminName}'
from auth.users where email = '${adminEmail}'
on conflict (user_id) do update
set role = excluded.role, email = excluded.email, display_name = excluded.display_name;
`);
