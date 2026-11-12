# Request: store a made-to-measure config on an item (from B07, Prompts 3.4 and 3.7, to the data prompt 3.1)

**Why.** An optional "made to measure" choice for tailors and furniture makers needs a place to keep the measurements the buyer must give and the price rule. The existing option fields cannot hold it: `seller_save_item` (0086/0088) accepts only the axis, value and variant keys it lists and raises `invalid_option` for anything else.

**Shape** (validated by `validateCustomSize` in `shared/src/options/customSize.js`, which the database should mirror):

```json
{ "enabled": true, "axisKey": "size",
  "fields": [{ "key": "bust", "label": "Bust", "unit": "cm", "min": 60, "max": 200, "required": true }],
  "price": { "mode": "fixed", "base": 4500 }
}
```
or `"price": { "mode": "per-extra", "base": 30000, "perUnit": 100, "field": "width", "over": 180 }`.

**Needed.**
1. A nullable `custom_size jsonb` on `items` (or a table keyed by item id), with a check: at most 6 fields, unique labels, unit `cm` or `in`, whole-KES prices.
2. `seller_save_item` accepts `customSize` (null clears it); `seller_item_options` returns it.
3. `public_item_options` returns it as `customSize` (axis flag included) for public items only.
4. RLS as for the other option data: shop staff write, the public reads.

**Until then.** The seller and buyer components are built and tested but switched off: `CUSTOM_SIZE_STORED` in `shared/src/options/customSize.js` is `false`, so no shop sees a control whose answer would not be saved. Turn it on in the same PR that lands the fields.
