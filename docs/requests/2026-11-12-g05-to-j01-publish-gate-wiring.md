# Publish gate: what J01 / 11.1 / the seller editor still wire in

- From: group 5 (5.4)      - To: J01, 11.1, seller editor (5.7)      - Date: 2026-11-12
- Status: open
- Contract: v1, "5.4" in docs/contracts/CHANGES.md

## Need
1. 11.1: call `item_check_publish(item jsonb)` where an item goes live. The table trigger `items_spec_gate` already refuses the transition with `publish_blocked`, so the call is for the message list, not for safety.
2. Seller editor: send `publish: true` in the fields of `seller_check_item` before Publish and `publish: false` for the quality panel; render `spec` (`blockers`, `warnings`, `score`) and the `spec_missing` / `spec_invalid` issues. Show `publish_blocked` from a save or a bulk show in words (its `detail` is a JSON list of `{key, label, message}`).
3. `seller_bulk_items('show')` fails the whole call when one item is blocked. If the UI should skip those items and report them, that change is in `seller_bulk_items` (not mine).
4. A06: when product types are loaded from the real list, their `spec_rows` must follow `SpecRowDef` (shared/src/specRules/rows.js); the table refuses more than four required rows.
