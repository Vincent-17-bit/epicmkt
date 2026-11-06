import { useMemo } from "react";
import * as api from "../../api/index.js";
import { createApiSource, createLocalSource } from "./source.js";

// The source the editor steps pass to the inputs: the seller api (live or mock, whichever the app runs on).
// Only if the api has no option value wrappers (an old build) do local dev and tests get an in-memory stand-in; a production build gets null,
// and the inputs say suggestions are unavailable, so a stand-in never looks like it is saving a value nobody will see.
const hasApi = () => typeof api.findOptionValues === "function" && typeof api.addOptionValue === "function";

export function useOpenValueSource() {
  return useMemo(() => (hasApi() ? createApiSource(api) : import.meta.env?.PROD ? null : createLocalSource()), []);
}
