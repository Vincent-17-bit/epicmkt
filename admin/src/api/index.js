import { isLive } from "../lib/supabase.js";
import * as live from "./live.js";
import * as mock from "./mock.js";

// Both modules export the same functions. The mock is only chosen while VITE_SUPABASE_URL is empty.
const impl = isLive ? live : mock;

export const getAdminCounts = () => impl.getAdminCounts();
