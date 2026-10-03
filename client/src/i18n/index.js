import en from "./en.js";

const dictionaries = { en };

export function t(key, lang = "en") {
  return dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
}
