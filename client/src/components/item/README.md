# Item detail slots

`ItemDetail.jsx` (in `client/src/components`) owns the data, the timers, the focus handling and the handlers. Everything that is
drawn lives here, one component per slot. `ItemLayout.jsx` is the layout file: it says where each slot goes.

## How a slot works

- A slot takes the prop `ctx` and reads what it needs from it. The fields are built in `ItemDetail.jsx` (search for
  `const ctx`). Adding a field there does not touch any other slot.
- A slot with nothing to show returns `null`, so an empty slot adds no markup.
- The slots ItemView draws (Gallery, Header, Options, Details and its Specs table) also take `slot`: the props ItemView hands the
  part (`item`, `shown`, `t`, `activeId`, `onVariant`, ...). They pass it on to the matching `@epicmkt/ui` component, so the markup
  is the one ItemView always drew.
- Slots import `../ItemDetail.module.css` for their styles (the file stays where it is).
- Each later prompt edits its own slot file only.

## Slot map

Top to bottom, as they appear. The page frame is `ItemView` in `ui/src/item/ItemView.jsx` (package `@epicmkt/ui`). It is made of
exported parts (`ItemGallery`, `ItemHeader`, `ItemOptions`, `ItemDetails`, `ItemSpecs`) and takes a slot prop for each (`gallery`,
`header`, `options`, `details`, `specs`): leave it out for the default, or pass a node or a function of the part's props.
`ItemLayout.jsx` passes a function for each, which draws the client's slot file.

| Slot | File | Shows | Returns null when |
| --- | --- | --- | --- |
| TopBar | `TopBar.jsx` | Breadcrumb trail; close button in the sheet layout | never |
| States | `States.jsx` | `LoadFailed`, `Gone`, `Loading` (the body when there is no item) | not used when an item is showing |
| FlashSticky | `FlashSticky.jsx` | Sticky sale price once the banner scrolls away | no flash, sale held after ending, or no price |
| Gallery | `Gallery.jsx` | Photos and videos | no item |
| Header | `Header.jsx` | Brand, title, short description, price | no item |
| Flash | `Flash.jsx` | Flash banner and the "sale ended" notice; placed above the header | no flash sale |
| Options | `Options.jsx` | Variant picker | no item or no variants |
| Offers | `Offers.jsx` | Offers this item is in | no item or no offers |
| Quantity | `Quantity.jsx` | Placeholder, renders nothing yet | always, for now |
| Delivery | `Delivery.jsx` | Placeholder, renders nothing yet | always, for now |
| SoldFrom | `SoldFrom.jsx` | Seller card with visit, chat, call, share, report | no seller |
| Details | `Details.jsx` | Highlights and description; `Specs` (same file) is the specs table, which sits in its own column | no item, or nothing to show |
| Recommend | `Recommend.jsx` | Similar items (last section); `StoreMore` is more from this store, shown after the description and in the loading and gone states | no item (`Recommend`) |
| StickyNav | `StickyNav.jsx` | Footer: chat and visit store | no item or no seller |

Stock, availability, pack size and the section and offer badges still sit in `ItemView` between Options and Offers; they belong to
no slot.

## Where each slot sits

| ItemView prop | Filled with |
| --- | --- |
| `gallery` | `Gallery` |
| `header` | `Header` |
| `flash` | `Flash` |
| `options` | `Options` |
| `offers` | `Offers`, `Quantity`, `Delivery` (in that order, inside the info block after pack size) |
| `seller` | `SoldFrom` |
| `details` | `Details` |
| `after` | `ctx.selective` (`StoreMore`) |
| `specs` | `Specs` (from `Details.jsx`) |

`FlashSticky` is rendered just before `ItemView`, and `Recommend` just after it. `TopBar` and `StickyNav` are drawn by
`ItemDetail.jsx` around the body.

## Tests

`slots.test.jsx` has a render test for each slot the client owns, and `viewSlots.test.jsx` for Gallery, Header, Options and Details
(the parts ItemView draws; their own markup tests are in `ui/src/item/ItemView.test.jsx`). `ItemDetail.dom.test.jsx` compares the whole page's markup with saved
HTML and must pass without changes after any slot edit that is meant to leave a screen unchanged.
