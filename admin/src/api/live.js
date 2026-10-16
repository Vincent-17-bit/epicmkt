let tokenProvider = async () => null;

/** The sign-in screen registers how to get the admin's JWT. */
export function setAccessTokenProvider(fn) {
  tokenProvider = fn;
}

const base = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function callFunction(name, body) {
  const token = await tokenProvider();
  if (!token) throw Object.assign(new Error("unauthorized"), { code: "unauthorized" });
  const res = await fetch(`${base()}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" });
  if (!res.ok) throw Object.assign(new Error(data.error ?? "request_failed"), { code: data.error ?? "request_failed", status: res.status });
  return data;
}

const notConfigured = async () => {
  throw new Error("Supabase admin API not configured. Set VITE_SUPABASE_URL to enable live data.");
};

export const liveAdminApi = {
  getAdminCounts: notConfigured,
  getApplications: notConfigured,
  getBusinesses: notConfigured,
  getPayments: notConfigured,
  addFlag: notConfigured,
  decideApplication: (body) => callFunction("admin-decide-application", body),
};

export default liveAdminApi;
