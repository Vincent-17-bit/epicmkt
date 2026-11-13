# Link dictionary values chosen in type rows when the item is saved

- From: group 5 (5.6)      - To: the item editor shell (ItemEditor.jsx, brandValue.js)      - Date: 2026-11-12
- Status: done (ItemEditor looks up or reuses each typed value and sends brand and spec links in one call)

## Need
Typed rows (material, colour, finish, flavour) now use the open value inputs and keep the chosen dictionary value on the form as `form.specValues` (`{ [rowKey]: value }`). `specLinks(form)` in `editor/typedRows.js` returns `[{ slot: "spec", valueId }]` for them.

`seller_link_item_values` replaces all of an item's links, so on save ItemEditor must send the brand link together with `specLinks(form)` in one call (today `linkBrand` sends the brand alone). Until then admin rename and merge reach the brand but not these spec values; the text the seller chose is saved correctly either way.
