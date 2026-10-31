const iso = (ms) => new Date(ms).toISOString();

export const saleRow = (over = {}) => {
  const at = over.now ?? Date.now();
  const { now: _now, ...rest } = over;
  return {
    id: "00000000-0000-0000-0000-000000000001",
    business_id: "10000000-0000-0000-0000-000000000001",
    item_id: "20000000-0000-0000-0000-000000000001",
    headline: null,
    starts_at: iso(at - 3600000),
    ends_at: iso(at + 3600000),
    discount_type: "percent",
    discount_value: "20.00",
    variant_overrides: [],
    quantity_note: null,
    item_name: "Fade and beard",
    item_description: "Sharp cut",
    item_section: "Cuts",
    item_price_type: "fixed",
    item_unit: null,
    item_availability: "available",
    item_image_path: null,
    regular_price: "1000.00",
    sale_price: "800.00",
    savings: "200.00",
    discount_percent: "20",
    business_slug: "shop-a",
    business_name: "Shop A",
    business_category_id: "barbershops",
    business_town: "Maseno",
    business_county: "Kisumu",
    business_lat: -0.0058,
    business_lng: 34.6,
    business_phone: "+254712345678",
    business_whatsapp: "+254712345678",
    business_logo_path: null,
    business_verification_level: "verified",
    business_hours: {},
    ...rest
  };
};

export function createFakeSupabase() {
  const state = { serverNow: null, sales: [], offers: [], items: [], businesses: [], categories: [], failing: null, status: "SUBSCRIBED", handlers: new Set(), calls: [], selects: [], offline: false, rpc: {} };

  const clock = () => state.serverNow ?? Date.now();

  const rowsOf = (table) => {
    if (table === "public_flash_sales") return state.sales.map((row) => ({ ...row, server_now: iso(clock()) }));
    if (table === "public_offers") return state.offers;
    if (table === "public_items") return state.items;
    if (table === "public_businesses") return state.businesses;
    if (table === "categories") return state.categories;
    return [];
  };

  const from = (table) => {
    const filters = [];
    const inFilters = [];
    const tests = [];
    let window = null;
    let wantCount = false;
    let signal = null;
    const run = () => {
      state.calls.push(table);
      if (signal?.aborted) return { data: null, error: { name: "AbortError", message: "AbortError: The user aborted a request." } };
      if (state.failing) return { data: null, error: state.failing };
      let data = rowsOf(table).filter((row) => filters.every(([col, value]) => row[col] === value) && inFilters.every(([col, values]) => values.includes(row[col])) && tests.every((test) => test(row)));
      const total = data.length;
      if (window) data = data.slice(window[0], window[1] + 1);
      return { data, error: null, count: wantCount ? total : null };
    };
    const query = {
      select: (columns, options) => {
        state.selects.push([table, columns]);
        wantCount = options?.count === "exact";
        return query;
      },
      order: () => query,
      limit: () => query,
      // Like supabase-js: not available after maybeSingle(), so a call that chains it too late fails here as it would for real.
      abortSignal: (value) => {
        signal = value;
        return query;
      },
      range: (from, to) => {
        window = [from, to];
        return query;
      },
      eq: (col, value) => {
        filters.push([col, value]);
        return query;
      },
      neq: (col, value) => {
        tests.push((row) => row[col] !== value);
        return query;
      },
      gte: (col, value) => {
        tests.push((row) => Number(row[col]) >= value);
        return query;
      },
      lte: (col, value) => {
        tests.push((row) => Number(row[col]) <= value);
        return query;
      },
      // Case-insensitive match; a backslash escapes the next character, as in Postgres. % is any run, _ any one character.
      ilike: (col, pattern) => {
        const source = String(pattern).replace(/\\(.)|(%)|(_)|[.*+?^${}()|[\]]/g, (m, esc, any, one) => (esc ? esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : any ? ".*" : one ? "." : `\\${m}`));
        const re = new RegExp(`^${source}$`, "i");
        tests.push((row) => re.test(String(row[col] ?? "")));
        return query;
      },
      // Only the "col.ilike.%text%,col.ilike.%text%" form: a row passes when any clause matches.
      or: (clauses) => {
        const tests2 = String(clauses).split(",").map((clause) => {
          const [col, op, ...rest] = clause.split(".");
          const re = new RegExp(String(rest.join(".")).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*"), "i");
          return (row) => op === "ilike" && re.test(String(row[col] ?? ""));
        });
        tests.push((row) => tests2.some((test) => test(row)));
        return query;
      },
      in: (col, values) => {
        inFilters.push([col, values]);
        return query;
      },
      maybeSingle: async () => {
        const { data, error } = run();
        return { data: data?.[0] ?? null, error };
      },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject)
    };
    return query;
  };

  const channel = () => {
    const api = {
      on: (_type, _filter, handler) => {
        state.handlers.add(handler);
        return api;
      },
      subscribe: (callback) => {
        callback?.(state.status);
        return api;
      }
    };
    return api;
  };

  const client = {
    from,
    channel,
    removeChannel: () => {
      state.handlers.clear();
    },
    rpc: (name, args) => {
      let signal = null;
      const run = async () => {
        state.calls.push(name);
        if (signal?.aborted) return { data: null, error: { name: "AbortError", message: "AbortError: The user aborted a request." } };
        if (name.startsWith("search_") || name.startsWith("similar_")) {
          if (state.failing) return { data: null, error: state.failing };
          const handler = state.rpc[name];
          if (!handler) return { data: null, error: { code: "PGRST202", message: "function not found" } };
          // A handler answers with the data, or with { error } to simulate a failure other than "not deployed".
          const out = handler(args);
          return out && !Array.isArray(out) && out.error ? { data: null, error: out.error } : { data: out, error: null };
        }
        if (state.failing || state.offline) return { data: null, error: state.failing ?? { message: "offline" } };
        return { data: iso(clock()), error: null };
      };
      const call = {
        abortSignal: (value) => {
          signal = value;
          return call;
        },
        then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
        catch: (reject) => call.then(undefined, reject),
        finally: (done) => call.then((v) => (done?.(), v), (e) => { done?.(); throw e; })
      };
      return call;
    }
  };

  return { client, state, emit: (event = "update") => state.handlers.forEach((handler) => handler({ event, payload: {} })) };
}
