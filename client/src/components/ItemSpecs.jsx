import { ItemSpecs } from "@epicmkt/ui";
import { t } from "../i18n/index.js";

export default function ClientItemSpecs(props) {
  return <ItemSpecs t={t} {...props} />;
}
