// What each scale's editor says and offers. The scale itself (parse, format, units, systems) always comes from @epicmkt/shared;
// this file holds only wording and which quick ranges to offer. No shop data.
export const UNIT_NAMES = { ml: "ml", l: "litres (L)", g: "grams (g)", kg: "kilograms (kg)", min: "minutes", h: "hours", day: "days", week: "weeks", month: "months", year: "years", w: "watts (W)", kw: "kilowatts (kW)", v: "volts (V)", k: "kelvin (K)" };

export const SCALE_EDITORS = {
  label: { title: "Choice", hint: "Refill, New bottle with water, Brown", examples: "Refill", noun: "choice" },
  count: { title: "Count", hint: "4, 3-seater, set of 6, pack of 12", examples: "3-seater" },
  volume: { title: "Volume", hint: "20 litres, 500 ml, 1.5 L", examples: "20 litres" },
  weight: { title: "Weight", hint: "22.5 kg, 500 g, 1 kg", examples: "22.5 kg" },
  duration: { title: "Duration", hint: "30 min, 1 hour, 3 months", examples: "90 min" },
  portion: { title: "Portion", hint: "small, regular, large, half plate, full plate", examples: "half plate" },
  voltage: { title: "Voltage", hint: "12 V, 24V, 230 V", examples: "12 V" },
  power: { title: "Power", hint: "9 W, 4.8 W, 1.5 kW", examples: "9 W" },
  "ip-rating": { title: "Water and dust protection", hint: "IP20, IP44, IP67", examples: "IP67" },
  "color-temperature": { title: "Colour temperature", hint: "3000 K warm white, 6500K", examples: "3000 K" }
};

export const configFor = (scaleId) => SCALE_EDITORS[scaleId] ?? { title: scaleId, hint: "", examples: "" };
