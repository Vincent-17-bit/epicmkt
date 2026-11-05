import { useCallback, useReducer } from "react";
import { itemReducer } from "./index.js";

// The item form, with the same two handles the editor always had: patch(key, value) and, for a save or Start over, replace(form).
// patch and replace keep the same identity for the life of the editor.
export const useItemModel = (initialForm) => {
  const [form, dispatch] = useReducer(itemReducer, initialForm);
  const patch = useCallback((key, value) => dispatch({ type: "patch", key, value }), []);
  const replace = useCallback((next) => dispatch({ type: "replace", form: next }), []);
  return { form, patch, replace, dispatch };
};
