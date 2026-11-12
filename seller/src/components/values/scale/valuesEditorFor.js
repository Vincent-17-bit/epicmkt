import { EDITORS } from "./wrappers.jsx";
import ScaleValuesEditor from "./ScaleValuesEditor.jsx";

/** The editor component for an axis's scale; scales without a named editor use the generic one. */
export const valuesEditorFor = (scaleId) => EDITORS[scaleId] ?? null;
export { ScaleValuesEditor };
