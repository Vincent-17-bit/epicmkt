# Product search filters

How the filters on `/products` are chosen, ordered and shown. The rules live in two files, shared by the browser, the
demo backend and the `/api/products?op=search` endpoint, so all three always agree:

- `shared/src/search/data/facetCatalog.js`: every filter (`FACETS`) and every kind of thing sold (`KINDS`), as data.
- `shared/src/search/search.js`: matching, counting, hiding, ordering and paging.

## Three layers

1. **Listing type and department.** Products and services are separate listing types (tabs: All, Products, Services).
   A service has no stock (no "In stock" or "Only 3 left") and is done at the shop or comes to you; a product has no booking.
2. **The kind's own filters.** Each kind lists its filters, most used first. Only the dominant kind(s) of the results
   give filters, so meat never shows colour, a haircut never shows size, and a print job never shows pack weight.
3. **Filters every listing has**: condition (second-hand kinds only), availability (products only), deals, delivery,
   the shop (open now, open 24 hours, verified), seller, town and county.

## Rules

- **Shown only with a choice.** A filter is left out when the current results would give it fewer than two different
  values (a yes/no filter needs results with it and without it). A filter in use always stays, so it can be taken off.
- **Most used first.** The kind's list is the order: size first for clothes and shoes, make, model and year first for car
  parts, cut and weight first for meat, cylinder size first for gas. `brand`, `price` and `colour` may sit anywhere in a
  kind's list (`PLACED_FACETS`); when a kind leaves Brand or Price out, they go after its first three filters.
- **Quick chips.** The first five filters (after Department) are the chips above the results, eBay style. Each opens its
  options in a panel; "All filters" opens the whole column (a bottom sheet with "Apply (N results)" on phones).
  `logEvent("product_search_filter")` records which filters are used, for tuning the order with real data.
- **Numbers are ranges, labels are checkboxes.** A number filter has range buckets plus the shopper's own min and max,
  typed in the filter's unit (`r_weight=0.5-2` in the address). Labels (brand, flavour, cut) are checkboxes; clothes
  sizes are chips; colours are a labelled list; yes/no filters are switches.
- **Units are one scale.** Readers turn "1 kg", "1000 g", "1,000 gms", "½ kg" and "half a kilo" into the same number
  (kg); litres and millilitres likewise; gsm, cc, months of warranty, megapixels, bedrooms and guests are read too.
  Values are always shown with their unit ("500 g", "1.5 L", "150 cc", "80 gsm").
- **Model follows Make.** With a make ticked, Model offers only that make's models.

## Adding a filter or a kind

1. Add the filter to `FACETS` (a `facet` of choices or a `range` with a reader and buckets). If it says *what the thing
   is*, add its id to `BY_NAME` so it reads the name, not the description.
2. Put its id in the kinds that have it, at the position of how often it is used.
3. A new kind: give it the words that name it (whole words; put specific words before generic ones, and mind the order of
   `KINDS`: the first match wins within goods and within services) and the shop categories that sell it.
4. Add a line to the "names land in the right kind" test in `search.test.js`.

## Loading

`/products` loads like the home grid: one page of 16 at a time (each its own cached URL), the next page fetched about a
screen ahead with an IntersectionObserver, the first two extra pages added on their own, then "Load more" one page per
tap, page links to jump, and never more than 20 pages. Pages after the first ask for `view=items`, so the endpoint does
not recount the filters for them.
