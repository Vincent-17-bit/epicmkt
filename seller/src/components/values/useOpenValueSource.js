import { useMemo } from "react";
import * as api from "../../api/index.js";
import { createApiSource, createLocalSource } from "./source.js";

const hasApi = () => typeof api.sellerOptionValues === "function" && typeof api.sellerAddOptionValue === "function";

// The source the editor steps pass to the inputs. It uses the real seller api as soon as the two wrappers exist.
// Until then local dev and tests get an in-memory stand-in; a production build gets null, and the inputs say suggestions are unavailable
// (a stand-in must never look like it is saving a value that nobody will ever see).  TODO(contract:A18)
export function useOpenValueSource() {
  return useMemo(() => (hasApi() ? createApiSource(api) : import.meta.env?.PROD ? null : createLocalSource()), []);
}
