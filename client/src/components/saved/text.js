import { t } from "../../i18n/index.js";

// "{n} items" style copy: look the string up with t() and fill its {placeholders}. Tiny on purpose: the card hearts load this file on every page.
export const fill = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), t(key));
