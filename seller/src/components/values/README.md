# Open value inputs (B04)

Typed material, colour, brand, finish and flavour, backed by the shared list from migration 0090 (`seller_option_values`).

```jsx
import { OpenValueInput, ColorValueInput, useOpenValueSource } from "components/values";

const source = useOpenValueSource();           // the seller api (findOptionValues / addOptionValue)
<OpenValueInput kind="material" label="Material" value={v} onChange={setV} source={source} />
<OpenValueInput kind="brand" label="Brand" ... />
<ColorValueInput value={c} onChange={setC} source={source} />
```

- `value` is the dictionary value `{ id, kind, label, key, status, hex, tags }` or `null`. `onChange` always gets that object, never bare text.
- The seller's own spelling is kept (`label`); the key is only used to find and de-duplicate ("SAMSUNG", "Samsung", "samsung" are one value).
- A new value is usable at once and carries `status: "pending"`, shown with a "Pending review" badge and a note.
- After the item is saved, call `api.linkItemValues` so admin rename and merge reach it (see `editor/brandValue.js` for the brand).
- The brand field in the item editor already uses its own `ValueField`; these inputs are the general version for material, colour, finish and flavour.
- `source` is `{ search(kind, query, { limit }), add(kind, label, hex) }`. Tests inject a mock; `createLocalSource` is an in-memory stand-in.
- Keyboard: Down/Up move (wrap), Alt+Down opens, Enter chooses or adds, Escape closes then clears. Focus goes to "Change" after choosing.
- Text lives in `text.js` (the seller app has no i18n helper yet).

# Size and measurement editors (B04 value editors II, B05 measurement editors)

Every value goes through the shared scales API (`parse`, `format`, `sizeKey`, `toBase`, `plausible`), so what is stored is always
`{scale, system?, value, unit?, width?, shape?}`, never bare text.

```jsx
import { ValueEditor } from "components/values";

<ValueEditor scale="volume" label="Refill size" typeId="drinking-water" values={values} onChange={setValues} />
<ValueEditor scale="shoe" values={values} onChange={setValues} />                       // system switch, widths, quick fill, conversions
<ValueEditor scale="dimensions" typeId="sofa" label="3 seater" values={v} onChange={set} /> // boxes labelled for the type
```

- `ValueEditor` picks the editor: `shoe` -> `ShoeValueEditor`, `dimensions` -> `DimensionsEditor`, anything else -> `ScaleValueEditor` (typed text).
- Text scales: choice chips (`label`), count, volume, weight, duration, portion, voltage, power, ip-rating, color-temperature, apparel-alpha,
  apparel-numeric, kids-age, collar-inch, screen-inch, storage, length, bed-size, tyre-size, paper-size.
- "20" for a volume asks which unit (buttons); "20 litres" reads as 20 L. Commas add several at once ("5 L, 10 L, 20 L").
- Each editor shows the parse error inline (an alert once you try to add) and a live "Buyers will see" preview.
- Chips move earlier or later and can be removed (buttons that name the value). Duplicates merge by size with a quiet notice: 20 litres and
  20 L are one value, so are 5 m and 500 cm and 1 TB and 1024 GB. Shoes merge by sizeKey and width, so EU 42 and UK 8 stay as typed.
- Shoes: EU, UK, US men, US women, cm. A bare `42` means what the switch says. Each chip shows its other-system equivalents. Quick fill adds
  "EU 38 to 47 in whole or half steps", optionally with a width. Sizes outside the shoe chart are skipped and counted.
- Dimensions: rectangular or round; boxes follow the product type (table L x W x H, sofa W x D x H, door W x H, round table Diameter x Height);
  unit cm, m, in or ft. A number that is unusual (a 750 cm high table) warns and does not block; an impossible one (0, or 1000 times too big) is refused.
- Not here yet: option generation from the values (Prompt 3.2) and saving them onto an item (the axis `scale` and each value's `scaleValue` are
  passed to buyers by `publicOptions`, but the seller save path must keep them: see docs/contracts/CHANGES.md).
