import BasicsSection from "../BasicsSection.jsx";
import { useMoreDetails } from "../detailMode.js";
import { useProductTypes } from "./useProductTypes.js";

function Typed(props) {
  const { types } = useProductTypes();
  const [more, setMore] = useMoreDetails();
  const type = types.find((t) => t.id === props.form.productTypeId) ?? null;
  return <BasicsSection {...props} type={type} more={more} onMore={() => setMore(true)} />;
}

export default function BasicsStep(props) {
  const { form, patch, errors, category, sections, focusOn } = props;
  const shared = { form, patch, errors, category, sections, focusOn };
  return form.productTypeId ? <Typed {...shared} /> : <BasicsSection {...shared} />;
}
