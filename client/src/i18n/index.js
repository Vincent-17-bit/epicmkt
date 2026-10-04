import en from "./en.js";
import sw from "./sw.js";

const dictionaries = { en, sw };

export function t(key, lang = "en") {
  return dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
}
