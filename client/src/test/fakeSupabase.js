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
  const state = { serverNow: null, sales: [], items: [], businesses: [], failing: null, status: "SUBSCRIBED", handlers: new Set(), calls: [], offline: false };

  const clock = () => state.serverNow ?? Date.now();

  const rowsOf = (table) => {
    if (table === "public_flash_sales") return state.sales.map((row) => ({ ...row, server_now: iso(clock()) }));
    if (table === "public_items") return state.items;
    if (table === "public_businesses") return state.businesses;
    return [];
  };

  const from = (table) => {
    const filters = [];
    const run = () => {
      state.calls.push(table);
      if (state.failing) return { data: null, error: state.failing };
      const data = rowsOf(table).filter((row) => filters.every(([col, value]) => row[col] === value));
      return { data, error: null };
    };
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (col, value) => {
        filters.push([col, value]);
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
    rpc: async (name) => {
      state.calls.push(name);
      if (state.failing || state.offline) return { data: null, error: state.failing ?? { message: "offline" } };
      return { data: iso(clock()), error: null };
    }
  };

  return { client, state, emit: (event = "update") => state.handlers.forEach((handler) => handler({ event, payload: {} })) };
}
