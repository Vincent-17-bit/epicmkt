# Payments: how M-Pesa works in EpicMKT

Everyone pays the same way: **Paybill, an account number, an amount, a PIN.** Nobody types a transaction code.
Safaricom tells our server about each payment, the server records it and does the right thing.

## The rules

1. **Nothing is lost.** Every callback from Safaricom is saved untouched (`mpesa_callbacks`) before anything else happens.
   Every payment becomes a row in `mpesa_transactions`, whatever its account number, amount or format.
2. **Money is credit.** Each payment is added to a credit balance on the application (before activation) or on the business
   (after). Whole months are taken from that balance; the rest waits. One mechanism covers short payments, top-ups,
   prepaying several months and overpaying.
3. **The account number is a short code, never a business name.** See "Why not the business name" below.
4. **A person is only needed when a person is needed.** Renewals apply by themselves. A first payment waits for one
   Confirm click (that creates the seller's login). Anything unclear waits in the admin list with the money safe.

## What the payer types as the account number

| Who | Account number | Where they see it |
|---|---|---|
| Applicant (first payment) | Their **application reference**, e.g. `EPM-2026-ABC234` | Approval SMS and e-mail, status page |
| Seller (renewals, upgrades) | Their **Seller ID**, e.g. `ES100001` | Subscription page, payment SMS |

Typing is forgiving: capitals, spaces and hyphens do not matter (`epm 2026 abc234` works). After activation the old
application reference still works and goes to the business.

### Why not the business name

Two shops can share a name (Upendo Shop in Maseno and in Kiambu). The name has no length limit in our forms, but the
Paybill account field does: Daraja documentation for C2B describes it as alphanumeric and under 20 characters, and the
STK Push prompt allows only 12. So a long name can be cut off, and a name can be mistyped. A short unique code cannot be
confused with anyone else's. Business names still work as a **fallback** (see scenario 6), and the admin always sees the
business name next to the code.

Please confirm the exact account-number limit for your Paybill with your Safaricom account manager. Our references
(15 and 8 characters) are within every limit we found.

## Scenarios

### A new shop (first payment)

| # | What happens | What the system does | What people see |
|---|---|---|---|
| 1 | Pays exactly the price, with the reference | Money credited; application moves to *payment confirming*; admin e-mailed | Client: "Payment received". Admin: **Ready to confirm** |
| 2 | Pays **less** (KES 300 of 500) | Credited; application stays *approved* | Client SMS: "KES 200 more is needed, same account". Status page shows received and balance. Admin: **Part paid** |
| 3 | Pays the rest later | Credit now covers the price; moves to *payment confirming* | As scenario 1 |
| 4 | Pays **3 months** at once (KES 1,500) | Credit 1,500; admin sees "Covers 3 months" | Admin presses **Confirm 3 months**: seller is live for 3 months |
| 5 | Pays **more than a whole number of months** (KES 1,600) | Admin confirms 3 months; KES 100 becomes the seller's credit | Seller sees KES 100 credit on the Subscription page |
| 6 | Types the business name instead of the reference | If exactly one shop has that name: matched. If several: see 7 | Admin sees how it matched |
| 7 | Two shops share the name | **Never guessed.** If the payer's phone (Safaricom sends it hashed) matches exactly one shop's number, that shop gets it. Otherwise the payment waits | Admin: **Needs assigning**, with both shops listed with their towns. One click assigns it. No shop is ever blocked |
| 8 | Pays **before approval** | Credited and kept | Client SMS: "We will use it when you are approved". On approval it goes straight to *payment confirming* |
| 9 | Pays twice (a second payment while one waits) | Added as more credit | Admin sees both. Extra months or credit follow |
| 10 | Typo in the reference | Recorded, not matched. Near-misses suggested | Admin: **Needs assigning**, with suggestions, plus search by name, town, phone, reference |
| 11 | Pays for a rejected application | Recorded, not credited | Admin: **Needs assigning** with the note "application was rejected" (refund outside the system, then **Ignore** with a reason) |
| 12 | Account left empty, or anything unknown | Recorded | Admin: **Needs assigning** |

### An existing seller (renewals and everything after)

| # | What happens | What the system does | What people see |
|---|---|---|---|
| 13 | Pays the monthly price with the Seller ID | **Automatic.** One month added from the current end date (or from today if expired) | Subscription page flips to "Payment received, paid until …" with a receipt. SMS and in-app message. No admin action |
| 14 | Pays **3 months** (KES 1,500) | 3 months added at once | Same, "covers 3 months" |
| 15 | Pays **KES 1,600** | 3 months added, KES 100 kept as credit | Credit shown on the card and counted in the next payment |
| 16 | Pays **less** (KES 300) | Kept as credit, no months yet | SMS and page: "KES 200 more is needed". The card now asks only for KES 200 |
| 17 | Pays the rest | Months added | As 13 |
| 18 | Pays a day late, or after expiry | One day late carries on from the old date. Expired restarts from today | Page shows the new end date |
| 19 | Pays far in advance | Up to **12 months** ahead (`max_prepay_months` in `site_settings`). The excess stays as credit and is used later | SMS explains |
| 20 | Opens **Upgrade to Premium** or a **category change** and pays | The portal tells the server what the payment is for. Money is **held** for it and applied automatically when complete | Plan changes by itself. A part payment shows what is still due |
| 21 | Has credit and wants to upgrade | **Use my KES X credit** button | Instant |
| 22 | Pays with the old application reference after activation | Goes to the business | As 13 |
| 23 | Pays someone else's Seller ID | Credits that shop (paying for another shop is harmless) | That shop sees it |
| 24 | Two shops, one owner | Each has its own Seller ID. Pay each separately | |
| 25 | Business renamed, moved town, phone changed | No effect: matching uses the code | |

### When something goes wrong

| # | What happens | What the system does |
|---|---|---|
| 26 | Safaricom sends the same callback twice | The M-Pesa code is stored once; the retry is ignored |
| 27 | The payload is odd (missing amount, strange ID, not JSON) | The raw callback is stored and flagged. Admin sees it under "callbacks could not be processed" with **Reprocess** and **Dismiss**. No payment row is invented |
| 28 | The database fails mid-way | The raw callback survives. Reprocess it. If the transaction row exists but crediting failed, it waits as **Needs assigning** with a note |
| 29 | A callback never arrives (Safaricom outage) | We cannot see what we are not told. The M-Pesa statement is the check: any code on the statement that is not in the Payments list is missing. Record it with **Record manual payment** (planned: statement import) |
| 30 | The payer's phone is hidden | Safaricom sends a SHA-256 hash. We never display it. The payer's name shows when sent |
| 31 | A customer reverses a payment at Safaricom | Credit not yet used: **Ignore** it (credit is taken back). Already turned into months: adjust the seller by hand, then note it. No automatic reversal |
| 32 | A fake callback | The URL contains a secret (`MPESA_CALLBACK_SECRET`) and Daraja does not sign callbacks, so keep the secret private. Optionally add Safaricom's IP list at your firewall |
| 33 | An admin confirms the wrong thing | Reject on a code takes the money back (it was only credit) and re-opens the application |

## What the admin sees (Payments)

- **Needs action** (default) and **All**.
- Each row: business, town and reference, the account the payer typed, amount (with "covers 3 months" or "KES 200 still due"),
  M-Pesa code, who paid, status, time.
- **Ready to confirm**: one button, *Confirm N months*. It creates the seller's login and sends the password.
- **Needs assigning**: *Assign…* opens the likely shops, a search box, and an **Ignore** field (wrong paybill, refund, test).
- A red box lists any callbacks that could not be processed.
- Every assign, ignore and reprocess is written to the audit log. Owner and finance can act; others can look.

## Setup

See the end of `supabase/README.md`: set the Paybill number (`supabase/set-mpesa.sql`), set `MPESA_CALLBACK_SECRET`,
deploy `pay-callback`, register the URLs with `scripts/register-mpesa-c2b.mjs`.

## Not built yet (worth doing next)

- **STK Push ("Pay now" button).** The seller enters their phone, gets a PIN prompt, and no account number is typed at all.
  Matching is exact. The account reference is limited to 12 characters, which suits Seller IDs. Needs the Daraja
  passkey and a second callback. This is the best next step.
- **Statement import** to catch callbacks that never arrived (scenario 29).
- **Automatic activation** of first payments (no Confirm click). Safe to add once you trust the matching; a setting.
- **Reversal tool** for scenario 31.
- Validation that **declines** a wrong account at the payer's phone. Needs Safaricom to enable external validation and
  conflicts with "record everything", so it is deliberately off.
