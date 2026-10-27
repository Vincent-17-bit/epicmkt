# S6 My listings: how to check it works

All commands are PowerShell, run from the repository root. In Windows PowerShell 5, chain commands with `;` (not `&&`).

## 1. Get the branch

```powershell
git fetch origin
git checkout feature/s6-my-listings
npm install
```

## 2. Preview in demo mode (no database)

```powershell
npm run dev:seller
```

Open http://localhost:5174 and sign in with `ES100001` / `Demo-Passw0rd`. Click **My listings** in the top bar. Do not type the URL or reload on the login step: demo mode keeps the session in memory.

Check:

- The strip says "5 of 6 items are showing to customers", with the reason for the other one.
- Tracker tiles show counts. Click "Out of stock": the cards filter and a removable chip appears. Reload: the filter stays, because it lives in the URL.
- Press `/`: the search box takes focus. Type `bea`: only Beard trim stays.
- Sort has 13 options. Comfortable, Compact and List are remembered per device.
- Tick **Select** on two cards: the bulk bar appears. Try Hide, Show, Move to section, Set availability.
- **Change prices**: enter `10`, check the before and after table and the rounding note, then confirm.
- **Delete**: an Undo bar shows for 8 seconds. Undo brings the items back. Leaving the page commits the delete.
- Make the window narrower than 1024px: the side panel becomes a **Filters** button with Apply and Reset.
- **Import items** shows the Premium lock on the demo (Standard) account.
- Theme: use the Dark button in the top bar.

To try the real import, change `plan_key`/`planKey` to `premium` for the demo business in `seller/src/api/mock.js` (`resetBilling`, the `bill.business` line), then paste rows copied from Excel. A row starting with `=`, `+`, `-` or `@` must be rejected.

## 3. Test against Supabase

```powershell
supabase db push
Copy-Item seller\.env.example seller\.env
```

Edit `seller\.env`:

```
VITE_API_MODE=live
VITE_SUPABASE_URL=<your project url>
VITE_SUPABASE_ANON_KEY=<your anon key>
VITE_CLIENT_URL=<your customer site address, for example https://epicmkt.example>
```

`VITE_CLIENT_URL` is what makes "View as customer" open the right page.

Then, as a real seller:

1. Add an item. It lands as a draft and is not on the customer site.
2. Choose **Show**. It appears on the customer site.
3. Hide it. It disappears.
4. Suspend a test seller in the admin. Every listing action must be refused.

## 4. Run the tests

Shared logic, seller, client and admin:

```powershell
npm run test:shared
npm test -w seller
npm test -w client
npm run test:admin-ui
```

Database tests need a local Postgres that can create databases. Set the connection first if yours is not the default:

```powershell
$env:TEST_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5432/postgres"
npm run test:db
```

Edge function tests need Deno 2:

```powershell
npm run test:fn
npm run test:fn:db
```

Everything at once:

```powershell
npm run test:all
```

One file at a time:

```powershell
npx vitest run --root seller src/pages/business/catalog
node --test supabase/tests/listings.test.mjs
node --test shared/src/seller/filters.test.js shared/src/seller/bulk.test.js shared/src/seller/importer.test.js shared/src/seller/itemForm.test.js
```

Builds:

```powershell
$env:VITE_ALLOW_MOCK_BUILD = "true"
npm run build
```

## 5. Known points

- `flash.test.jsx` failed once under load before this work and then passed. If it fails, run it alone: `npx vitest run --root seller src/pages/business/flash.test.jsx`.
- The add and edit item dialog is a minimal stand-in until the full item editor (S4/S5) exists. New items are saved as drafts.
- Deleting is held for 8 seconds so it can be undone.
