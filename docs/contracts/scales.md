# Scales

> A02 owns the first part of this file (the scale registry and the scales it adds). The section below is A03's. On a merge conflict
> keep both sides.

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
