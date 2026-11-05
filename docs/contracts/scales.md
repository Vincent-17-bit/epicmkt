# Scales (Contract v1)

Status: Wave 1 (A02), 2026-11-05. Code: `shared/src/scales/` (one file per scale), exported as `scales` from `@epicmkt/shared`
(`import { scales } from "@epicmkt/shared"`; `sizeKey`, `validateAxisValues`, `registerScale`, `defineScale` and `listScales` are also exported flat).
Full API at `shared/src/scales/index.js`: `parse`, `format`, `sizeKey`, `compare`, `toBase`, `plausible`, `validateAxisValues`.

A stored value is `{ scale, system?, value, unit?, width? }`. It is never bare text. `parse(scaleId, raw, ctx)` returns `{ ok: true, value }` or
`{ ok: false, error: { code, message, needs?, options? } }`. `needs` is `"unit"`, `"system"` or `"gender"` when the person only has to add that.
`ctx` is what the form already knows: `{ system?, gender?, defaultUnit? }` (`defaultUnit` is also passed to the A03 scales as their `ctx.unit`).
`raw` may be text, or a stored value, which is re-validated and normalised.

The registry also holds the A03 scales (`./remaining`), fitted by `adoptScale()`: their string errors become `{ code, message }` (`unit-required`
with `needs: "unit"` when the text says "Add a unit"; otherwise `invalid`), and their own `sizeKey`, `compare` and `plausible(typeId, axisKey, value)` are used as they are.

## Scales

| Scale id | Name | Accepted input | Display format |
| --- | --- | --- | --- |
| `apparel-alpha` | Clothing size (letters) | XS, S, M, L, XL, XXL (or 2XL), 3XL, 4XL, 5XL; also words such as small, medium, extra large | XS, S, M, L, XL, XXL, 3XL, 4XL, 5XL (ordered smallest to largest) |
| `apparel-numeric` | Clothing size (US numbers) | whole US sizes 0 to 22, with or without 'US' (US 10, size 10) | US 0 to US 22 |
| `kids-age` | Kids age | newborn, or an age or range with a unit: 6 months, 3 years, 3-4 yrs, 12-18 months | Newborn, 6 months, 18 months, 2 years, 3-4 years |
| `collar-inch` | Shirt collar (inches) | inches in halves, 12 to 22: 15, 15.5, 15 1/2, 15½, 15", 15 inch | 15", 15.5" (half-inch steps) |
| `shoe` | Shoe size | EU 42, UK 8.5, US 9 men, US 10.5 women, 26.7 cm; half sizes; optional width (narrow, regular, wide, extra wide) | EU 42, UK 8.5, US 9 (men), US 10.5 (women), 26.7 cm, with ' · Wide' when a width is set |
| `screen-inch` | Screen size (inches) | inches with or without the unit: 42, 42", 42 inch, 42-inch, 6.7 in; centimetres are converted | 42", 6.7" |
| `storage` | Storage / memory | number + MB, GB or TB (1 TB = 1024 GB) | MB below 1 GB, TB from 1024 GB, otherwise GB: 512 MB, 128 GB, 1 TB, 2 TB |
| `body-measure` | Body measurement | a number with cm or in (90 cm, 36", 36 in); a bare number needs a unit | 90 cm, 36 in |
| `ring-size` | Ring size | US 3 to 13 in half sizes, UK letters F to Z+2 (L, L 1/2, Z+1), EU 44 to 72 (inner circumference in mm); a bare number is read as US (3 to 13) or EU (44 to 72) | US 7, UK N½, EU 54 |

The table above is A02's 9 scales. A03's 26 measure scales (`length`, `volume`, `weight`, `duration`, `dimensions`, `count` ...) are described in the
A03 section below. The registry holds all 35; `volume` and `weight` are A03's.

## Rules

- **Keys.** `sizeKey(value)` is `scale:system:value[:unit]`, with `-` when a scale has no system (the A03 convention). Shoe 42 (EU) is `shoe:eu:42`,
  a 42-inch TV is `screen-inch:-:42:in`, a dress 42 is `apparel-numeric:eu:42`: never equal. `width` is not in the key; an axis
  merges on key plus width.
- **Merging.** Equal amounts are stored one way so they share a key: `1 TB` and `1024 GB` are `storage:-:1024:GB`; `1000 ml` and `1 L` are
  `2xl` and `XXL` are `apparel-alpha:-:XXL`; `24 months` and `2 years` are `kids-age:-:2:y`. The same fit in two shoe
  systems (EU 42, UK 8) is the same size to `compare` and `toBase` but keeps two keys: an axis should use one system.
- **Axis merging.** `validateAxisValues` merges on `sizeKey` plus width, and also merges two values of one scale, system and width with the same base
  amount typed in different units (A03 keeps `1000 g` and `1 kg` as two keys; the axis keeps the first typed). Values with no base amount (labels, models) are
  never merged that way.
- **Units.** `storage`, `body-measure`, `kids-age` (and A03's `volume`, `weight`, `length` ...) need a unit (`needs: "unit"`) unless `ctx.defaultUnit` is given.
  `shoe` needs a system (`ctx.system`) and, for US sizes, men or women (`ctx.gender`). `screen-inch`, `collar-inch` and `apparel-*` have an
  implied unit. `ring-size` reads a bare number as US (3 to 13) or EU (44 to 72).
- **Ordering.** `compare` orders by `toBase`: rank for letters, cm for shoes, mm for rings, months for ages (lower bound), GB, ml, g, inches.
  Values of different scales sort by scale id, so a mixed list still has a stable order.
- **Round trip.** `parse(format(value))` equals `value` for every scale (tested).

## Conversion data

- Shoes: `shared/src/scales/shoeChart.js` is a plain table (`SHOE_CHART`, one row per whole EU size with UK, US men, US women and cm). A05 lets an
  admin edit it. Kids rows (EU 19 to 34) carry EU and cm only; UK and US kids sizes restart at 1 and are not in the chart yet.
- Rings: US to inner circumference in mm (`RING_US_MM` in `ring-size.js`); UK letters step 1.27 mm from L = 51.9 mm; EU is the whole-mm circumference.
- Charts are retail averages. Brands differ by up to a size.

## Plausibility

`plausible(typeId, axisKey, value)` returns `{ ok, warn? }`. `ok: false` means wrong scale or outside the hard limits; `ok: true` with `warn`
means unusual. Limits are keyed `<product type id>.<axis key>` in `PLAUSIBILITY_RULES` (`phone.storage`, `memory-card.capacity`,
`shoes-eu.size`, `bread.weight`, `drinking-water.size`, `fragrance.volume`); other axes get the scale's own check only.

## Adding a scale

One file in `shared/src/scales/` that default-exports `defineScale({ id, label, accepts, display, examples, parse, format, toBase, ... })`,
imported in `index.js`. A scale written as a plain object (the A03 style) goes through `adoptScale()`. `examples.valid` and `examples.invalid` are run by the tests; add a row to the table above (a test checks it matches the code).

---

## Remaining measure scales (A03)

Code: `shared/src/scales/remaining/` (`units.js`, `dimensions.js`, `sizes.js`, `ordinal.js`, `index.js`). Tests sit beside the code.

### What every scale gives you

| Function | Returns |
| --- | --- |
| `parse(raw, ctx)` | `{ok:true, value}` or `{ok:false, error}`. `raw` is text, a number, or a stored value. A stored value parses back to itself. |
| `format(value, opts)` | Display text. `opts.unit` converts (unit scales and dimensions). |
| `sizeKey(value)` | `scale:system:value[:unit]`. `-` stands for no system. The scale id is always first. |
| `compare(a, b)` | A number for sorting; 0 for the same size in different units. |
| `toBase(value)` | The value in the base unit; an array for `dimensions`; `null` when there is no base (`label`, `compat-model`). |
| `plausible(typeId, axisKey, value)` | `{ok:true}`, `{ok:true, warn}` (check this), or `{ok:false, warn}` (cannot be right). |

`ctx` fields used: `unit` (the unit when the text has none), `typeId` (picks dimension labels), `shape` (`round`), `system` (count kind,
gauge system), `models` and `open` (compat-model). Methods do not use `this`, so `list.sort(scale.compare)` works.

A bare number needs a unit (from the text or `ctx.unit`), except `power` (W), `voltage` (V), `current` (A), `battery-capacity` (mAh)
and `gsm`, which have one sensible unit.

### Stored shapes and base units

| Scale | Stored example | Base | Notes |
| --- | --- | --- | --- |
| `length` | `{scale:"length", value:5, unit:"m"}` | mm | m, cm, mm, ft, in. Fractions: `1 1/2 in`. |
| `thickness` | `{value:8, unit:"in"}` | mm | mm, cm, in. |
| `diameter` | `{value:0.75, unit:"in"}` | mm | mm, cm, in. |
| `volume` | `{value:20, unit:"l"}` | ml | ml, L. |
| `weight` | `{value:22.5, unit:"kg"}` | g | g, kg. |
| `duration` | `{value:3, unit:"month"}` | minutes | min, h, day, week, month, year. Words: daily, weekly, monthly, quarterly, annual. `1h 30min` stores `{value:90, unit:"min"}`. A month is 30 days and a year 365 for ordering. |
| `power` | `{value:9, unit:"w"}` | W | W, kW. |
| `voltage` | `{value:12, unit:"v"}` | V | |
| `current` | `{value:13, unit:"a"}` | A | A, mA. |
| `battery-capacity` | `{value:5000, unit:"mah"}` | mAh | mAh, Ah. |
| `gsm` | `{value:80, unit:"gsm"}` | g/m² | |
| `dimensions` | `{system:"rectangular", shape:"rectangular", value:"120x60x75", unit:"cm"}` | mm per part | Labels by type: table Length x Width x Height, sofa Width x Depth x Height, door Width x Height, round table Diameter x Height (`Ø90 x 75 cm`). Units mm, cm, m, in, ft. `dimensionLabels(typeId, shape)`. |
| `bed-size` | `{value:"4x6", unit:"ft", width:4}` | mm² | Feet by feet, width first. |
| `cross-section` | `{system:"rect", shape:"rect", value:"2x4", unit:"in", width:2}` or `{system:"area", shape:"area", value:2.5, unit:"mm2"}` | mm² | Timber and wire. |
| `tyre-size` | `{system:"metric", value:"205/55R16", width:205}` | overall diameter, mm | `195R15` and `195/70R15C` also work. |
| `paper-size` | `{system:"iso", value:"A4"}` | mm² | Fixed list: A0 to A7, B4 to B6, C3 to C6, DL, Letter, Legal. |
| `print-size` | `{value:"4x6", unit:"in", width:4}` | mm² | Also `10x15 cm` and 4R, 5R, 6R, 8R, 10R, 12R. |
| `frame-size` | `{value:"52-18-140", unit:"mm", width:52}` | eye, mm | Eye-bridge-temple. |
| `count` | `{system:"set", value:4}` | the number | Kinds: pieces, set, pack, box, seater, gang, tier, copies. |
| `portion` | `{system:"size", value:"small"}` or `{system:"plate", value:"half"}` | rank or fraction | small, regular, large, family; quarter, half, full plate. Not comparable across the two systems. |
| `vehicle-class` | `{system:"class", value:"saloon"}` | rank | motorbike, tuktuk, hatchback, saloon, suv, pickup, van, minibus, truck, bus. |
| `compat-model` | `{value:"iPhone 13"}` | none | `ctx.models` from the product type; `ctx.open` accepts an unlisted model. |
| `color-temperature` | `{system:"kelvin", value:2700, unit:"k"}` or `{system:"name", value:"warm"}` | K | Names: warm 2700, neutral 4000, cool 6000, daylight 6500 K (nominal). |
| `ip-rating` | `{system:"iec", value:"IP65"}` | rough code | IPX4, IP6X, IP69K. |
| `gauge` | `{system:"swg", value:28}` or `{system:"mm", value:0.5, unit:"mm"}` | mm | SWG 8 to 36. Thicker sorts higher, so gauge 26 is above 28. |
| `label` | `{value:"Heavy duty"}` | none | Fallback. Up to 40 characters. The key is the lower-case slug, so `Heavy Duty` and `heavy duty` match. |

### Plausibility

Warnings never block a save; a `false` answer is for values that cannot be right. Examples that the tests pin:

- `table` 120 x 60 x 750 cm: warns (`Height 750 cm is more than usual for table`); 7500 cm is refused.
- `table` with width over length, `door` with width over height: warns.
- `tyre-size` width 207 or aspect 57 (not steps of 5), rim 28: warns. `205/55R60`: refused by `parse`.
- `led-bulb/wattage` 2 kW, `drinking-water/size` 20 ml, `led-strip/length` 500 m: warn.
- `frame-size` eye 35 warns; eye 90 is refused.
- `count` 12-seater warns; 30-seater is refused.

Per-type ranges are keyed `typeId/axisKey` (see `ranges` in `units.js`) and fall back to the scale's own range.

### No collisions

Every `sizeKey` starts with the scale id, so two scales cannot make the same key. Inside one scale, different units make different
keys (`1 kg` and `1000 g`); use `compare(a, b) === 0` or `toBase` to match equal sizes. `:` never appears inside a segment.
