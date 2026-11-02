import { ItemDescription } from "@epicmkt/ui";
import { t } from "../i18n/index.js";

export default function ClientItemDescription(props) {
  return <ItemDescription t={t} {...props} />;
}
