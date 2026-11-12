import ReviewSection from "../ReviewSection.jsx";
import { useProductTypes } from "./useProductTypes.js";

function Typed({ form, ...rest }) {
  const { types } = useProductTypes();
  const type = types.find((t) => t.id === form.productTypeId) ?? null;
  return <ReviewSection form={form} type={type} {...rest} />;
}

export default function ReviewStep({ form, checks, isNew, goTo, grandfathered, colourPhotos, sizeChart, onPublish, busy }) {
  const shared = { checks, isNew, onJump: goTo, grandfathered, colourPhotos, sizeChart, onPublish, busy };
  return form.productTypeId ? <Typed form={form} {...shared} /> : <ReviewSection form={form} {...shared} />;
}
