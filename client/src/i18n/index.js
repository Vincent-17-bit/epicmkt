import en from "./en.js";

export const t = (key) => en[key] ?? key;

// Add strings that ship with a lazily loaded part of the app.
export const extend = (dict) => Object.assign(en, dict);
