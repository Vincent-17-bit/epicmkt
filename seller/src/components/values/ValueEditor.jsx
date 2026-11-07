import DimensionsEditor from "./DimensionsEditor.jsx";
import ScaleValueEditor from "./ScaleValueEditor.jsx";
import ShoeValueEditor from "./ShoeValueEditor.jsx";

/** Picks the editor for a scale id: shoes and dimensions have their own, every other scale is typed text with a preview. */
export default function ValueEditor({ scale, ...props }) {
  if (scale === "shoe") return <ShoeValueEditor {...props} />;
  if (scale === "dimensions") return <DimensionsEditor {...props} />;
  return <ScaleValueEditor scale={scale} {...props} />;
}
