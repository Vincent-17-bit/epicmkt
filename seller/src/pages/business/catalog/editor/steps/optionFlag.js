// The option editors are off unless VITE_OPTION_EDITORS=true (the values stay in the draft until the price and stock grid exists).
export const optionEditorsOn = () => import.meta.env.VITE_OPTION_EDITORS === "true";
