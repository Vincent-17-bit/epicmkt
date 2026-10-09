import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { searchBusinesses, setLatency } from "../api/index.js";
import { applyFilters, buildChips, clearFilters, readFilters, toApiFilters } from "./filters.js";
import { formatTime, statusText } from "./businessView.js";
import Business from "../pages/Business.jsx";

const mockBusiness = vi.hoisted(() => ({ value: null }));

vi.mock("../api/index.js", async () => {
  const backend = await import("@epicmkt/backend");
  return {
    searchBusinesses: (params) => backend.searchBusinesses(params),
    getBusiness: (ref) => (mockBusiness.value ? Promise.resolve(mockBusiness.value) : backend.getBusiness(ref)),
    setLatency: backend.setLatency,
    logContactEvent: vi.fn(),
    reportBusiness: vi.fn()
  };
});
vi.mock("../components/FlashStrip.jsx", () => ({ default: () => null }));
vi.mock("../components/TemplateDetails.jsx", () => ({ default: () => null }));
vi.mock("../components/QrCode.jsx", () => ({ default: () => null }));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => <nav aria-label="page trail" /> }));
vi.mock("../components/ItemDetail.jsx", () => ({ default: () => null }));

const MON_NOON = "2026-11-09T09:00:00Z";
const MON_EVENING = "2026-11-09T18:30:00Z";
const SUN_NOON = "2026-11-08T09:00:00Z";
const MON_EARLY = "2026-11-09T02:30:00Z";

const freeze = (iso) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

beforeAll(() => setLatency(0));
afterEach(() => {
  vi.useRealTimers();
  mockBusiness.value = null;
});

describe("formatTime", () => {
  it.each([
    ["08:00", "8:00 AM"],
    ["00:00", "12:00 AM"],
    ["11:59", "11:59 AM"],
    ["12:00", "12:00 PM"],
    ["17:30", "5:30 PM"],
    ["23:59", "11:59 PM"]
  ])("%s -> %s", (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });
});

describe("statusText", () => {
  beforeEach(() => freeze(MON_NOON));

  it("shows the closing time while open", () => {
    expect(statusText({ isOpen: true, closesAt: "20:00" })).toBe("Open now · Closes 8:00 PM");
  });

  it("falls back to plain Open now without a closing time", () => {
    expect(statusText({ isOpen: true, closesAt: null })).toBe("Open now");
  });

  it("omits the day when it opens later today", () => {
    expect(statusText({ isOpen: false, opensAt: { day: "mon", time: "14:00" } })).toBe("Closed · Opens 2:00 PM");
  });

  it("names the day when it opens on another day", () => {
    expect(statusText({ isOpen: false, opensAt: { day: "tue", time: "08:00" } })).toBe("Closed · Opens Tue 8:00 AM");
    expect(statusText({ isOpen: false, opensAt: { day: "sat", time: "10:00" } })).toBe("Closed · Opens Sat 10:00 AM");
  });

  it("says Closed when there is no next opening", () => {
    expect(statusText({ isOpen: false, opensAt: null })).toBe("Closed");
  });
});

describe("filters", () => {
  it("reads the open filter from the query string", () => {
    expect(readFilters(new URLSearchParams("open=1")).openNow).toBe(true);
    expect(readFilters(new URLSearchParams("open=0")).openNow).toBe(false);
    expect(readFilters(new URLSearchParams("")).openNow).toBe(false);
  });

  it("sets and clears the open parameter", () => {
    const on = applyFilters(new URLSearchParams("q=gym"), { openNow: true });
    expect(on.get("open")).toBe("1");
    expect(on.get("q")).toBe("gym");
    const off = applyFilters(on, { openNow: false });
    expect(off.has("open")).toBe(false);
  });

  it("builds an Open now chip that clears itself", () => {
    const chips = buildChips(readFilters(new URLSearchParams("open=1")), null);
    expect(chips).toEqual([{ id: "open", label: "Open now", patch: { openNow: false } }]);
  });

  it("passes openNow to the API and drops it on clear", () => {
    expect(toApiFilters(readFilters(new URLSearchParams("open=1")), null, 7).openNow).toBe(true);
    expect(toApiFilters(readFilters(new URLSearchParams("")), null, 7).openNow).toBe(false);
    expect(clearFilters(new URLSearchParams("open=1&q=gym")).has("open")).toBe(false);
  });
});

describe("catalog open status for weekly-hours shops", () => {
  const openIds = async () => (await searchBusinesses({ openNow: true, pageSize: 100, seed: 1 })).items.map((b) => b.id).sort();

  it("lists every shop open on a Monday at noon", async () => {
    freeze(MON_NOON);
    const ids = await openIds();
    expect(ids).toHaveLength(34);
    expect(ids).not.toContain("b_023");
  });

  it("narrows to the late shops on a Monday evening", async () => {
    freeze(MON_EVENING);
    expect(await openIds()).toEqual(["b_007", "b_013", "b_022", "b_030"]);
  });

  it("drops the Sunday-closed shops on a Sunday", async () => {
    freeze(SUN_NOON);
    const ids = await openIds();
    expect(ids).toHaveLength(28);
    expect(ids).toContain("b_001");
    expect(ids).not.toContain("b_011");
    expect(ids).not.toContain("b_012");
  });

  it("opens exactly at the start time", async () => {
    freeze(MON_EARLY);
    expect(await openIds()).toEqual(["b_013", "b_015", "b_030"]);
  });

  it("flags isOpen on the summaries the same way as the filter", async () => {
    freeze(MON_EVENING);
    const all = await searchBusinesses({ pageSize: 100, seed: 1 });
    expect(all.items.filter((b) => b.isOpen).map((b) => b.id).sort()).toEqual(["b_007", "b_013", "b_022", "b_030"]);
    expect(all.items).toHaveLength(34);
  });

  it("keeps closed shops in the unfiltered list", async () => {
    freeze(MON_EVENING);
    const all = await searchBusinesses({ pageSize: 100, seed: 1 });
    expect(all.total).toBe(34);
  });
});

describe("business detail open status", () => {
  const detail = async (slug) => {
    const { getBusiness } = await import("@epicmkt/backend");
    return getBusiness(slug);
  };

  it("reports closing time and today's hours while open", async () => {
    freeze(MON_EVENING);
    const b = await detail("ironcore-gym");
    expect(b).toMatchObject({ isOpen: true, closesAt: "22:00", opensAt: null, todayHours: ["05:30", "22:00"] });
  });

  it("reports the next day opening when closed for the night", async () => {
    freeze(MON_EVENING);
    const b = await detail("greenfield-agrovet");
    expect(b).toMatchObject({ isOpen: false, closesAt: null, opensAt: { day: "tue", time: "07:30" }, todayHours: ["07:30", "18:30"] });
  });

  it("reports today's opening when not yet open", async () => {
    freeze("2026-11-09T02:00:00Z");
    const b = await detail("greenfield-agrovet");
    expect(b).toMatchObject({ isOpen: false, closesAt: null, opensAt: { day: "mon", time: "07:30" } });
  });

  it("uses the Sunday slot on a Sunday", async () => {
    freeze(SUN_NOON);
    const b = await detail("ironcore-gym");
    expect(b).toMatchObject({ isOpen: true, closesAt: "16:00", todayHours: ["08:00", "16:00"] });
  });
});

describe("Business page hours for a weekly-hours shop", () => {
  const shop = {
    id: "b_x",
    slug: "weekly-shop",
    name: "Weekly Shop",
    shortcode: "abc123",
    category: { singular: "Shop", name: "Shops", fields: [] },
    area: "Maseno",
    county: "Kisumu",
    address: "Main St",
    lat: 0,
    lng: 0,
    phone: "0712345678",
    whatsapp: "0712345678",
    description: "d",
    tagline: "t",
    plan: "standard",
    verified: false,
    rating: 4,
    reviewCount: 2,
    offers: [],
    gallery: [],
    socials: {},
    attributes: {},
    services: [],
    tags: [],
    hours: { mon: ["08:00", "20:00"], tue: ["08:00", "20:00"], wed: null, thu: ["09:00", "17:30"], fri: ["08:00", "20:00"], sat: ["10:00", "18:00"], sun: null },
    isOpen: true,
    closesAt: "20:00",
    opensAt: null
  };

  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/b/weekly-shop"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/b/:slug" element={<Business />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );

  it("renders the week rows, marks today and shows the status text", async () => {
    freeze(MON_NOON);
    mockBusiness.value = shop;
    mount();
    expect(await screen.findByRole("heading", { name: "Opening hours" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Monday8:00 AM to 8:00 PM",
      "Tuesday8:00 AM to 8:00 PM",
      "WednesdayClosed",
      "Thursday9:00 AM to 5:30 PM",
      "Friday8:00 AM to 8:00 PM",
      "Saturday10:00 AM to 6:00 PM",
      "SundayClosed"
    ]);
    expect(rows.filter((r) => r.getAttribute("aria-current") === "date").map((r) => r.textContent)).toEqual([rows[0].textContent]);
    expect(screen.getByText("Open now · Closes 8:00 PM")).toBeInTheDocument();
  });

  it("shows the next opening when closed", async () => {
    freeze(MON_EVENING);
    mockBusiness.value = { ...shop, isOpen: false, closesAt: null, opensAt: { day: "tue", time: "08:00" } };
    mount();
    expect(await screen.findByText("Closed · Opens Tue 8:00 AM")).toBeInTheDocument();
  });
});
