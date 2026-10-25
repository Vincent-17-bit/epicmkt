# Seller sign-in: temporary details first, then email and own password

## The idea

A new seller gets **only** a Seller ID and a temporary password (activation sets `must_change_password = true`).
From **Account** they then:

1. **Add and verify an email.** A code is sent to that address; they enter it plus their current password.
2. **Choose their own password.** A code is sent by **SMS** (Africa's Talking, to the phone on the listing) or by **email** (Resend, to the verified email) — their choice.

After that they sign in with their **email or their Seller ID**, plus their own password. Until step 2 is done a
"Finish setting up your sign-in" notice shows on every page.

## Where it is stored

| What | Where |
| --- | --- |
| The password | Supabase Auth (`updateUserById`). Never stored by us. |
| Sign-in email, when verified, when the password was last chosen by the seller | `businesses.login_email`, `login_email_verified_at`, `password_changed_at` (migration `0044`) |
| "Still on the temporary password" | `businesses.must_change_password` (cleared by a seller-chosen password, set again by an admin reset) |
| Who did what | `audit_log`: `password_changed`, `password_reset`, `login_email_set` (the code, password and full email are never logged) |

The Supabase Auth user keeps its internal address (`<seller id>@sellers.epicmkt.app`); the real email lives on the
business row. Changing it never touches Auth, and the Seller ID always keeps working.

## Edge functions

| Function | Does |
| --- | --- |
| `seller-login` | `identifier` = Seller ID or verified email. Both share one lockout counter. |
| `seller-otp-request` | `change_password` (`channel`: `sms` or `email`) or `verify_email` (sent to the new address). |
| `seller-set-email` | **new.** Needs the emailed code **and** the current password. Saves the address the code was issued for. |
| `seller-change-password` | Code (from either channel) + new password. Clears `must_change_password`. |
| `seller-forgot-request` / `-verify` | Signed-out reset by Seller ID or email, `channel` `sms` (default) or `email`. |

Safety rules: email codes only go to a **verified** address; forgot-password answers the same for every input;
a code for one address can never confirm another; the old address is told when the email changes.

## Deploying

1. Apply `supabase/migrations/0044_seller_sign_in.sql`.
2. Deploy the new function: `supabase functions deploy seller-set-email --no-verify-jwt` (and redeploy the five changed ones).
3. Make sure these secrets exist in production: `AT_API_KEY`, `AT_USERNAME`, `AT_SENDER` (SMS) and **`RESEND_API_KEY`, `MAIL_FROM`** (email codes). Without the Resend ones, email codes fail with `send_failed` and the SMS option keeps working.
4. Existing sellers: nothing to migrate. They are prompted to add an email; sellers who already chose their own password only see the soft "Add email" prompt on Account.
