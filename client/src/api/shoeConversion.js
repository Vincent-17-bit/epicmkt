import * as backend from "@epicmkt/backend";
import { scales, shoeChartFrom } from "@epicmkt/shared";
import { isLive } from "./flash/mode.js";

// The shoe conversion chart a size chart modal shows. Live: public_shoe_conversion. Demo: the in-memory backend. Any failure gives the
// built-in chart, so the page never loses its conversion table.
export async function getShoeConversion() {
  try {
    if (isLive()) {
      const { supabase } = await import("./applications/supabaseClient");
      const { data, error } = await supabase.from("public_shoe_conversion").select("chart,version").maybeSingle();
      if (error || !data?.chart) throw error ?? new Error("no chart");
      return { chart: shoeChartFrom(data), version: data.version ?? 1 };
    }
    const row = await backend.getShoeConversion();
    return { chart: shoeChartFrom(row), version: row.version ?? 1 };
  } catch {
    return { chart: scales.SHOE_CHART, version: 0 };
  }
}
