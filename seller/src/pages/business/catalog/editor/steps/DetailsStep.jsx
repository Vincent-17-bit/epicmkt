import DetailsSection from "../DetailsSection.jsx";
import { useMoreDetails } from "../detailMode.js";
import { useProductTypes } from "./useProductTypes.js";

function Typed(props) {
  const { types } = useProductTypes();
  const [more, setMore] = useMoreDetails();
  const type = types.find((t) => t.id === props.form.productTypeId) ?? null;
  return <DetailsSection {...props} type={type} more={more} onMore={() => setMore(true)} />;
}

import SizeGuideAsk from "./guide/SizeGuideAsk.jsx";

export default function DetailsStep({ form, patch, errors, focusOn, askGuide, guideShown, category }) {
  const shared = { form, patch, errors, focusOn, category };
  return (
    <>
      {form.productTypeId ? <Typed {...shared} /> : <DetailsSection {...shared} />}
      {askGuide && !guideShown && <SizeGuideAsk onAdd={askGuide} />}
    </>
  );
}
