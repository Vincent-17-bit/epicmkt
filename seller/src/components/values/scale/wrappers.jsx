import ScaleValuesEditor from "./ScaleValuesEditor.jsx";

// One named editor per scale, so a form reads <VolumeValuesEditor ... />. Each is the generic editor with its scale fixed.
const make = (scaleId, name) => {
  const C = (props) => <ScaleValuesEditor {...props} scaleId={scaleId} />;
  C.displayName = name;
  return C;
};

export const ChoiceValuesEditor = make("label", "ChoiceValuesEditor");
export const CountValuesEditor = make("count", "CountValuesEditor");
export const VolumeValuesEditor = make("volume", "VolumeValuesEditor");
export const WeightValuesEditor = make("weight", "WeightValuesEditor");
export const DurationValuesEditor = make("duration", "DurationValuesEditor");
export const PortionValuesEditor = make("portion", "PortionValuesEditor");
export const VoltageValuesEditor = make("voltage", "VoltageValuesEditor");
export const PowerValuesEditor = make("power", "PowerValuesEditor");
export const IpRatingValuesEditor = make("ip-rating", "IpRatingValuesEditor");
export const ColorTemperatureValuesEditor = make("color-temperature", "ColorTemperatureValuesEditor");

export const EDITORS = {
  label: ChoiceValuesEditor, count: CountValuesEditor, volume: VolumeValuesEditor, weight: WeightValuesEditor, duration: DurationValuesEditor,
  portion: PortionValuesEditor, voltage: VoltageValuesEditor, power: PowerValuesEditor, "ip-rating": IpRatingValuesEditor, "color-temperature": ColorTemperatureValuesEditor
};
