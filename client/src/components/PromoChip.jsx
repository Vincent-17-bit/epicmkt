import { PromoChip as UiPromoChip } from "@epicmkt/ui";
import { t } from "../i18n/index.js";

export default function PromoChip(props) {
  return <UiPromoChip labels={{ flash: t("flash.promo"), offer: t("flash.offer") }} {...props} />;
}
