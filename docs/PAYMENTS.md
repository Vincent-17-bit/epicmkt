# Payments: how M-Pesa works in EpicMKT

There are two ways to pay, and nobody types a transaction code in either:

- **Pay now** (STK Push): the payer presses one button, an M-Pesa PIN prompt appears on their phone, they enter the PIN.
  The amount and the account are filled in by the system; the payer cannot get them wrong.
- **Paybill**: the payer pays the business number with the account number and amount shown.

Safaricom tells our server about each payment, the server records it and does the right thing. Both ways feed the same
ledger, so everything below (credit, months, part payments, upgrades) works the same whichever way the money came.

## The rules

1. **Nothing is lost.** Every callback from Safaricom is saved untouched (`mpesa_callbacks`) before anything else happens.
   Every payment becomes a row in `mpesa_transactions`, whatever its account number, amount or format.
2. **Money is credit.** Each payment is added to a credit balance on the application (before activation) or on the business
   (after). Whole months are taken from that balance; the rest waits. One mechanism covers short payments, top-ups,
   prepaying several months and overpaying.
3. **The account number is a short code, never a business name.** See "Why not the business name" below.
4. **A person is only needed when a person is needed.** Renewals apply by themselves. A first payment that covers the current price goes live by itself (the seller's login is created and sent). Only unclear payments wait for an admin. Anything unclear waits in the admin list with the money safe.
5. **One price, decided by the server.** The price of a month is the **current** price of the shop's plan in its category
   (`business_unit_price`). The quote on the page, the amount in the phone prompt, the crediting and the admin list all use
   that one number. When the admin changes a plan price, every seller pays the new price from their next payment (time
   already paid for is not touched) and each one gets an in-app note. An upgrade to Premium moves the seller to the Premium
   price; a category change to the new category's price. (Before migration 0135 the crediting used a price frozen at
   activation, so a seller who paid exactly the amount shown could be told they were short, and an upgraded seller was
   credited at the Standard rate.) An admin's "charge a different amount" on an application applies to its first payment.

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
| 1 | Pays exactly the price, with the reference | Money credited; the system re-checks the current price for the category and plan, creates the login and the business goes live | Client: login SMS and e-mail. Admin: payment shown as confirmed |
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

## Pay now (M-Pesa prompt, STK Push)

### What the payer does

1. On the applicant status page (after approval) or the seller's Subscription page, the **M-Pesa phone number** box is
   already filled with the number on the application or listing. They can change it to any Safaricom number (a relative's,
   a second line). It accepts `0712 345 678`, `+254712345678`, `254712345678`, `0110 345 678`.
2. They choose how many months (renewals and first payments) and press **Pay KES X now**.
3. Their phone shows *"Do you want to pay KES X to EpicMKT, account ES100001?"*. They enter their PIN. That is all.
4. The page shows "Check your phone", then "Payment received" with the M-Pesa receipt, by itself. A first payment goes on
   to create the seller's login (SMS); a renewal shows the new paid-until date.

### What happens underneath

| Step | Where | What |
|---|---|---|
| 1 | `pay-stk-start` | Checks who is paying: the seller's login, or the applicant's status session (the one-time SMS code they signed in with). The browser sends only the phone, the months and what it is for, never an amount |
| 2 | `mpesa_stk_prepare` (database) | Works out the amount **now**: current plan price × months, minus any credit already held; upgrade and category change from the same quote the page shows. Refuses what cannot be paid (not approved yet, already paid, paid ahead to the limit, credit already covers it, more than KES 250,000). Records the request **before** Safaricom is called |
| 3 | Daraja | The prompt is sent with the request's amount, the account (Seller ID, or the application reference without "EPM", because STK allows 12 characters) and our callback URL |
| 4 | `pay-callback/<secret>/stk` | Safaricom's answer is stored raw first. A success is checked with Safaricom's own **status query** before any money moves. Then it is matched by its CheckoutRequestID to exactly one request, so it reaches exactly the shop that asked, for exactly what it asked |
| 5 | Ledger | Recorded in `mpesa_transactions` (receipt number unique) and credited like a Paybill payment: months added, upgrade applied, or the first payment activates the seller |
| 6 | `pay-stk-status` | The page asks every 3 seconds. If Safaricom's answer is late, it asks Safaricom itself |
| 7 | `pay-reconcile` (every 2 min) | Finishes answers that were stored but not processed, asks Safaricom about late prompts, expires prompts nobody answered, reports a "paid but no receipt" once |

### Scenarios

| # | What happens | What the system does | What people see |
|---|---|---|---|
| 34 | Pays the prompt | Credited once, for what was asked | "Payment received", receipt, new paid-until date (or login SMS for a new shop) |
| 35 | Presses Pay twice | The second press returns the prompt already on the phone; no second prompt within 75 seconds | One prompt |
| 36 | Cancels the prompt (1032), wrong PIN (2001), not enough balance (1), phone off (1037), another prompt open (1001) | Request marked failed with Safaricom's code. No money moved | A plain message for each code and **Try again**. The number is kept |
| 37 | Does nothing | After 10 minutes the request is "No answer". If the PIN was entered late, the late success is **still credited** | "No answer from your phone" and **Try again** / **Send the prompt again** |
| 38 | Safaricom sends the answer twice | The receipt is stored once | Nothing changes the second time |
| 39 | The Paybill confirmation of the same payment also arrives (before or after the STK answer) | Same receipt: credited once. If it comes first it is matched to the prompt (same account, amount and phone) and applied for the prompt's purpose | Nothing doubles |
| 40 | Safaricom's answer is lost | `pay-stk-status` and `pay-reconcile` ask Safaricom. "Paid" with no receipt yet shows "Payment confirmed by Safaricom, do not pay again"; the receipt arrives with the Paybill confirmation. If none comes in 30 minutes the admin is e-mailed | Seller is told not to pay again |
| 41 | Our reply from Safaricom was lost (network) but the prompt was sent | The success is matched by phone and amount within 15 minutes | Credited normally |
| 42 | A "success" whose amount differs from the prompt, a malformed receipt, or one Safaricom's status query says failed | **Never credited.** Held as *Needs checking* | Payer: "We are checking this payment, do not pay again". Admin: e-mail and the Phone prompts list |
| 43 | A success for a prompt we never sent | Recorded for an admin to assign, never dropped | Admin: **Needs assigning** |
| 44 | The admin changes the price while a prompt is open | The prompt keeps the amount it was sent with; the crediting uses the price at that moment, so any difference becomes credit or a balance | As 15 / 16 |
| 45 | Too many prompts | 6 per shop and 6 per phone in 15 minutes, 30 per network per hour | "Too many payment requests, wait a few minutes" |
| 46 | Daraja keys missing, or `stk` off | The Pay now box does not appear (or says it is not available) | Paybill details, exactly as before |

### Who can do what

- A seller can only start or read prompts for their own shop (login checked on every call; RLS lets them read only their own).
- An applicant can only pay for the application of the status session they signed in to.
- Nobody, including the seller, can set the amount. The callback URL carries a secret and every success is double-checked
  with Safaricom's status query (`MPESA_STK_VERIFY=query`, the default).
- Admins see every prompt in **Payments > Phone prompts (Pay now)**. Owner and finance can resolve a disputed or
  receipt-less one: credit it with the receipt and amount from the M-Pesa statement, or close it. Both are audited.

## What the admin sees (Payments)

- **Needs action** (default) and **All**.
- Each row: business, town and reference, the account the payer typed, amount (with "covers 3 months" or "KES 200 still due"),
  M-Pesa code, who paid, status, time.
- **Ready to confirm**: one button, *Confirm N months*. It creates the seller's login and sends the password.
- **Needs assigning**: *Assign…* opens the likely shops, a search box, and an **Ignore** field (wrong paybill, refund, test).
- A red box lists any callbacks that could not be processed.
- Every assign, ignore and reprocess is written to the audit log. Owner and finance can act; others can look.
- **Phone prompts (Pay now)**: every prompt, its amount, phone, what Safaricom answered and the receipt. *Needs checking*
  and *Paid, receipt on its way* rows have **Check and resolve**. A payment that came by prompt is marked
  "Phone prompt (Pay now)" in the main list.

## Setup

See the end of `supabase/README.md`: set the Paybill number (`supabase/set-mpesa.sql`), set `MPESA_CALLBACK_SECRET`,
deploy `pay-callback`, register the URLs with `scripts/register-mpesa-c2b.mjs`. For **Pay now**: set the Daraja keys and
passkey (`.env.example`, "Pay now" block), deploy `pay-stk-start`, `pay-stk-status` and `pay-reconcile`, re-run
`supabase/cron/schedule.sql`, then set `"stk": true` in `supabase/set-mpesa.sql`.

## Not built yet (worth doing next)

- **Statement import** to catch callbacks that never arrived (scenario 29).
- **Reversal tool** for scenario 31.
- Validation that **declines** a wrong account at the payer's phone. Needs Safaricom to enable external validation and
  conflicts with "record everything", so it is deliberately off.
