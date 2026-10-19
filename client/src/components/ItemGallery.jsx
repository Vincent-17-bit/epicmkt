import { ProductGallery } from "@epicmkt/ui";
import { t } from "../i18n/index.js";

export default function ItemGallery({ images, name }) {
  return <ProductGallery images={images} name={name} labels={{ zoom: t("item.zoom"), photo: t("item.photo") }} />;
}
