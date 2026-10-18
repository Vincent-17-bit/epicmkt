# Breadcrumbs manual checklist

For each case, confirm the trail text, that every crumb except the last is a link that goes where it says, and that the last crumb is plain text.

1. Business via QR URL with no history
   - Open a fresh tab at `/s/<shortcode>`. It should redirect to `/b/<slug>` and show Home > Category > Town > Business.
   - No "Back to results" button appears.
2. Business via search
   - Search for a term, open a result. Trail is Home > Category > Town > Business and "Back to results" appears.
   - "Back to results" returns to the same search with filters and scroll restored.
3. Business via category
   - Open a category, open a business. Same trail. "Back to results" returns to the category.
4. Business via the featured carousel on Home
   - Trail is correct. No "Back to results" button, since Home is not a results page.
5. Item page
   - Open `/b/<slug>/item/<id>`. It is a normal page: the trail is Home > Category group > Category > Business > Item, the group crumb is plain text, and the item crumb is the current page (`aria-current`).
   - Press the Business crumb: the business page opens at the top. Browser Back returns to the item page.
   - Open the old `/b/<slug>?item=<id>`: it redirects (replace) to `/b/<slug>/item/<id>`, so Back does not return to the old URL.
   - Open `/b/<slug>/item/nope`: the page shows "This item is no longer available" with Visit Store, and the last crumb reads "Item unavailable".
   - On a phone the trail scrolls sideways instead of collapsing, with a Back button above it.
6. Town and category pages
   - `/c/<slug>` shows Home > Category. `/c/<slug>?town=<town>` shows Home > Category > Town, and the Category crumb clears the town.
7. Static pages
   - `/sell`, `/sell/register`, `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/cookies` each show Home > page name.
8. No trail
   - Home, the 404 page and the offline page show none. An unknown business slug shows the 404 page.
9. Phones (under 768px)
   - Home is icon only. A trail of five crumbs collapses the middle behind "..."; the popover opens, Escape closes it and focus returns to the button.
