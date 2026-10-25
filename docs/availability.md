# Item availability

EpicMKT is a business directory, not a checkout. Nobody buys inside the app: customers find a business, see what it
sells, then call or WhatsApp. So availability answers one question for a customer: "will I waste a trip or a call?"

## The three outcomes

| What the seller says | What customers see |
| --- | --- |
| Available (or By appointment) | The item, with no marker at all. Normal is silent. |
| Low stock | The item, with a "Low stock" tag. If the seller allows it, "Only 3 left". |
| Out of stock | Nothing. The item is not listed anywhere customers look. |

Customers never see a red "unavailable" card. An item they cannot get is simply not there, so there is no dead end.

## How a seller sets it

There are two ways, and the seller picks per item.

1. **Just say it** (default). The Availability dropdown on the item: Available, Low stock, Out of stock, By appointment.
   Right for services and for shops that do not count stock.
2. **Count it.** Turn on "Count my stock" and enter how many are in hand. The system does the rest:
   - count is 0 -> Out of stock (delisted)
   - count is at or below the warning level (default 3) -> Low stock
   - anything higher -> Available

   Restocking is typing the new number. The item lists itself again.

## Seller side

- Out of stock items are gathered in one **Out of stock** section at the bottom of My listings, away from the live
  items, with the reason and a **Back in stock** button on each card.
- **Back in stock** on an item that is not counted: one tap, it is listed again.
  On a counted item it asks "How many do you have now?", because a count of 0 would put it straight back out.
- **Mark out of stock** is in each live item's menu (counted items go to 0).
- Out of stock items keep their place in the seller's manual order, so a restocked item returns where it was.
- The "N of M items are showing to customers" line does not count out of stock items, and says how many are out.

## Where it is enforced

The database is the single gate. `public_items`, and the offer views built on it, leave out out-of-stock items, so
every customer screen (home grid, store page, item page, search, offers, flash sales, link previews) agrees and a
direct link to a sold-out item shows "no longer available". The apps also filter, as a second line, so demo data and
cached responses cannot leak a sold-out item either.

Database values are unchanged: `available`, `limited_stock`, `out_of_stock`, `unavailable`, `by_appointment`.
`unavailable` is treated exactly like `out_of_stock`. No data is migrated.
