export const getSiteConfig = async () => {
  if (!import.meta.env.VITE_SUPABASE_URL) return {};
  const { supabase } = await import("./applications/supabaseClient.js");
  const { data, error } = await supabase.from("site_config").select("key, value");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
};
