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
