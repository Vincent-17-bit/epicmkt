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
5. Item deep link
   - Open `/b/<slug>?item=<id>`. The sheet opens; the page trail ends with the item; the sheet header shows "< Business > Item".
   - Press the Business crumb: the sheet closes, `?item` is gone, and the page keeps its scroll position.
   - Open `/b/<slug>?item=nope`: the item crumb is absent, the URL loses `?item`, and the toast "That item is no longer available" shows.
6. Town and category pages
   - `/c/<slug>` shows Home > Category. `/c/<slug>?town=<town>` shows Home > Category > Town, and the Category crumb clears the town.
7. Static pages
   - `/sell`, `/sell/register`, `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/cookies` each show Home > page name.
8. No trail
   - Home, the 404 page and the offline page show none. An unknown business slug shows the 404 page.
9. Phones (under 768px)
   - Home is icon only. A trail of five crumbs collapses the middle behind "..."; the popover opens, Escape closes it and focus returns to the button.
