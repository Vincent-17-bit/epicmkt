// Which scale an option axis uses, so the seller gets the right values editor. An axis that names its own `scale` (Contract v1 AxisDef) wins;
// until every type does, this table fills the gap for the types we know. Anything else is a list of plain choices (the `label` scale).
// TODO(contract:A01) delete the table when product types carry AxisDef.scale.
export const AXIS_SCALES = {
  "phone.storage": "storage",
  "memory-card.capacity": "storage",
  "shoes-eu.size": "shoe",
  "table.size": "dimensions",
  "sofa.seats": "count",
  "bread.weight": "weight",
  "drinking-water.size": "volume",
  "fragrance.volume": "volume",
  "led-bulb.wattage": "power",
  "led-strip.length": "length",
  "led-strip.voltage": "voltage"
};

export const DEFAULT_SCALE = "label";

/** The scale id for one axis of a product type. */
export const scaleForAxis = (typeId, axis) => axis?.scale ?? AXIS_SCALES[`${typeId}.${axis?.key}`] ?? DEFAULT_SCALE;
