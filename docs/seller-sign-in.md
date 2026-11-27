# Seller sign-in: temporary details first, then email and own password

## The idea

A new seller gets **only** a Seller ID and a temporary password (activation sets `must_change_password = true`).
From **Account** they then:

1. **Add and verify an email.** A code is sent to that address; they enter it plus their current password.
2. **Choose their own password.** A code is sent by **SMS** (Africa's Talking, to the phone on the listing) or by **email** (Resend, to the verified email) — their choice.

After that they sign in with their **email or their Seller ID**, plus their own password. Until step 2 is done a
"Finish setting up your sign-in" notice shows on every page.

## Changing the phone number

The phone on the listing is the number customers call and the one password codes are texted to, so it is changed the same careful way as the email.
It can be **from any country**: a seller picks the country (flag and dial code) and types the number the way they know it.

1. On **Account → Phone number** (or **Settings → Account and security → Change**) they enter the new number and their current password.
2. A code is texted to the **new** number, proving they hold it. Nothing is sent if the password is wrong.
3. They enter the code and the number is saved (`seller_set_verified_phone`, migration `0156`). The old number is texted and the verified email is told.

A seller who cannot do this (lost password, the new number is not with them) can still **ask an admin**: the older request flow (`seller_request_change`) stays as the way out.
Saving a verified number cancels any such request that was still pending, so it can never be approved later and overwrite the new number.

### Call number and WhatsApp number are separate

A business has two public numbers. `businesses.phone` is the **Call** button on the shop page and is also where password and sign-in codes are texted.
`businesses.whatsapp` is the **WhatsApp** button, and the Chat and Order buttons on every item (they use WhatsApp and fall back to the call number).
They can be the same number or two different ones:

- **Changing the call number** (the code flow above) has a checkbox, **Use this number for WhatsApp too**. It is ticked when WhatsApp is the same as the call number today or not set,
  and unticked when the seller keeps a different WhatsApp number, so a separate WhatsApp number is never overwritten by accident (`seller_set_verified_phone(..., p_also_whatsapp)`).
- **Changing only WhatsApp** is on Account → WhatsApp number: any country, saved straight away (it is not a sign-in channel, so no code), or **Use my call number** in one tap.

Both read live from the `businesses` row, so the shop page, the item buttons and the admin site show a new number as soon as it is saved.
The extra "business phones" typed on the apply form only stay on the application record; the shop page shows the first one (`activate.ts` copies it to `businesses.phone`).

### Old numbers and emails are kept (migration `0157`)

A trigger on `businesses` writes every previous **phone, WhatsApp number and sign-in email** to `business_contact_history` whenever one changes,
whoever changes it (the seller, an admin approving a request, an admin editing). The application record is never touched, so the number they applied with stays there too.
Nothing in the app erases a history row. Admins see them on the business page under **Previous numbers and emails** (`admin_contact_history`),
with who changed it (the seller, or the admin's name). Only the **owner** can remove one (`admin_delete_contact_history`, permission `businesses.contact_history_delete`),
after confirming, and the removal and what was removed are written to the audit log.

### Phone numbers in general

Every phone number in the app is held as one international number, `+<country code><number>` (E.164), and read with `libphonenumber-js`.
`@epicmkt/shared/phone` has the logic (country list from `Intl.DisplayNames` and libphonenumber, search, parsing, validation) and `PhoneInput` in `@epicmkt/ui`
is the control: a country button (flag and dial code) that opens a searchable list, beside the number box. Old values written the local way
(`0712 345 678`) still load, as Kenyan numbers. The database (`normalize_phone_ke`, migration `0011`) and the edge functions already accept any country.
Flags use the bundled Twemoji font (`ui/src/assets/fonts`, CC-BY 4.0) because Windows shows two letters instead of a flag.

## Where it is stored

| What | Where |
| --- | --- |
| The password | Supabase Auth (`updateUserById`). Never stored by us. |
| Sign-in email, when verified, when the password was last chosen by the seller | `businesses.login_email`, `login_email_verified_at`, `password_changed_at` (migration `0044`) |
| "Still on the temporary password" | `businesses.must_change_password` (cleared by a seller-chosen password, set again by an admin reset) |
| Who did what | `audit_log`: `password_changed`, `password_reset`, `login_email_set`, `phone_changed` (the code, password and full email or phone number are never logged; phones are masked) |

The Supabase Auth user keeps its internal address (`<seller id>@sellers.epicmkt.app`); the real email lives on the
business row. Changing it never touches Auth, and the Seller ID always keeps working.

## Edge functions

| Function | Does |
| --- | --- |
| `seller-login` | `identifier` = Seller ID or verified email. Both share one lockout counter. |
| `seller-otp-request` | `change_password` (`channel`: `sms` or `email`), `verify_email` (sent to the new address; the current password may come with it so a typo is caught before the code is spent) or `verify_phone` (texted to the **new** number; the current password is required and is checked before any SMS is sent). |
| `seller-set-email` | **new.** Needs the emailed code **and** the current password. Saves the address the code was issued for. |
| `seller-set-phone` | Needs the texted code **and** the current password. Saves the number the code was issued for, texts the **old** number and emails the verified address. |
| `seller-change-password` | Code (from either channel) + new password. Clears `must_change_password`. |
| `seller-forgot-request` / `-verify` | Signed-out reset by Seller ID or email, `channel` `sms` (default) or `email`. |

Safety rules: email codes only go to a **verified** address; forgot-password answers the same for every input;
a code for one address can never confirm another; the old address is told when the email changes.

## Deploying

1. Apply `supabase/migrations/0044_seller_sign_in.sql`, then `0156_seller_verified_phone.sql` and `0157_contact_history.sql` (or the regenerated catch-up files).
2. Deploy the new functions: `supabase functions deploy seller-set-email --no-verify-jwt` and `supabase functions deploy seller-set-phone --no-verify-jwt`, and redeploy `seller-otp-request`.
3. Make sure these secrets exist in production: `AT_API_KEY`, `AT_USERNAME`, `AT_SENDER` (SMS) and **`RESEND_API_KEY`, `MAIL_FROM`** (email codes). Without the Resend ones, email codes fail with `send_failed` and the SMS option keeps working.
4. Existing sellers: nothing to migrate. They are prompted to add an email; sellers who already chose their own password only see the soft "Add email" prompt on Account.
