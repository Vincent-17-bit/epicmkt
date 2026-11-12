import ScaleValuesEditor from "./ScaleValuesEditor.jsx";
import ShoeValuesEditor from "./ShoeValuesEditor.jsx";
import DimensionsEditor from "./DimensionsEditor.jsx";

export { ShoeValuesEditor, DimensionsEditor };

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

export const ApparelAlphaValuesEditor = make("apparel-alpha", "ApparelAlphaValuesEditor");
export const ApparelNumericValuesEditor = make("apparel-numeric", "ApparelNumericValuesEditor");
export const KidsAgeValuesEditor = make("kids-age", "KidsAgeValuesEditor");
export const CollarValuesEditor = make("collar-inch", "CollarValuesEditor");
export const ScreenValuesEditor = make("screen-inch", "ScreenValuesEditor");
export const StorageValuesEditor = make("storage", "StorageValuesEditor");
export const LengthValuesEditor = make("length", "LengthValuesEditor");
export const BedSizeValuesEditor = make("bed-size", "BedSizeValuesEditor");
export const TyreSizeValuesEditor = make("tyre-size", "TyreSizeValuesEditor");
export const PaperSizeValuesEditor = make("paper-size", "PaperSizeValuesEditor");

export const EDITORS = {
  label: ChoiceValuesEditor, count: CountValuesEditor, volume: VolumeValuesEditor, weight: WeightValuesEditor, duration: DurationValuesEditor,
  portion: PortionValuesEditor, voltage: VoltageValuesEditor, power: PowerValuesEditor, "ip-rating": IpRatingValuesEditor, "color-temperature": ColorTemperatureValuesEditor,
  shoe: ShoeValuesEditor, dimensions: DimensionsEditor,
  "apparel-alpha": ApparelAlphaValuesEditor, "apparel-numeric": ApparelNumericValuesEditor, "kids-age": KidsAgeValuesEditor, "collar-inch": CollarValuesEditor,
  "screen-inch": ScreenValuesEditor, storage: StorageValuesEditor, length: LengthValuesEditor, "bed-size": BedSizeValuesEditor, "tyre-size": TyreSizeValuesEditor, "paper-size": PaperSizeValuesEditor
};
