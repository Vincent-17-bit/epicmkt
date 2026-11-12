import { SectionCard } from "../parts.jsx";
import { useProductTypes } from "./useProductTypes.js";
import { axisValues, withAxisValues } from "../model/options.js";
import { scaleForAxis } from "../../../../../lib/axisScales.js";
import { EDITORS, ScaleValuesEditor } from "../../../../../components/values/index.js";
import { optionEditorsOn } from "./optionFlag.js";
import styles from "../editor.module.css";

// The options of the item's type, one values editor per axis, chosen by the axis's scale (volume, weight, shoe sizes, dimensions ...).
// Shown only when the option editors are switched on (see steps/index.js) and the item has a type with axes.
export default function OptionsStep(props) {
  // Off (the default): nothing renders and nothing is fetched, as before.
  if (!optionEditorsOn() || !props.form?.productTypeId) return null;
  return <OptionsFields {...props} />;
}

function OptionsFields({ form, patch }) {
  const { types } = useProductTypes();
  const type = types.find((t) => t.id === form.productTypeId) ?? null;
  const axes = (type?.axes ?? []).slice(0, 3); // an item has up to 3 option axes
  const setAxis = (key, list) => {
    const next = withAxisValues(form, key, list);
    patch("optionValues", next.optionValues ?? null);
  };

  return (
    <SectionCard id="options" title="Options" why="List the sizes, volumes or choices buyers can pick. Type them the way you would say them; we show buyers a clean version.">
      {axes.length === 0 ? <p>{type ? `${type.name} has no options to fill in.` : "Pick a type first to see its options."}</p> : axes.map((axis) => {
        const scaleId = scaleForAxis(type.id, axis);
        const Editor = EDITORS[scaleId] ?? ScaleValuesEditor;
        const props = { label: axis.label, values: axisValues(form, axis.key), onChange: (list) => setAxis(axis.key, list), typeId: type.id, axisKey: axis.key };
        return (
          <div key={axis.key} className={styles.field} data-axis={axis.key}>
            {Editor === ScaleValuesEditor ? <ScaleValuesEditor {...props} scaleId={scaleId} /> : <Editor {...props} />}
          </div>
        );
      })}
    </SectionCard>
  );
}
