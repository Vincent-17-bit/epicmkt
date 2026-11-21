import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./preview.js";

const BID = "22222222-2222-4222-8222-222222222222";
const ID = "11111111-1111-4111-8111-111111111111";
const MB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const shell = "<!doctype html><html><head><title>x</title></head><body></body></html>";
const business = { id: BID, slug: "shop", name: "Shop", category_id: "retail", county: "Kisumu", town: "Maseno", logo_path: null, cover_path: null };
const item = { id: ID, business_id: BID, name: "Galaxy", description: "d", short_description: "s", price: 21000, price_max: null, price_type: "fixed", availability: "available", image_paths: [`${BID}/cover.webp`, `${BID}/blue.webp`], media: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "image", path: `${BID}/cover.webp` }, { id: MB, kind: "image", path: `${BID}/blue.webp` }] };
const optionsPayload = { options: [{ key: "color", label: "Color", values: [{ id: "grey", label: "Grey" }, { id: "blue", label: "Blue", mediaId: MB }] }], optionVariants: [{ id: "v1", choice: { color: "grey" }, status: "available", mediaIds: [] }, { id: "v2", choice: { color: "blue" }, status: "available", mediaIds: [] }] };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let calls;
let rpcResult;
let saved;

beforeEach(() => {
  calls = [];
  rpcResult = () => json(optionsPayload);
  saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const u = String(input?.url ?? input);
    calls.push(u);
    if (u.endsWith("/index.html")) return new Response(shell, { status: 200 });
    if (u.includes("/rest/v1/public_businesses")) return json([business]);
    if (u.includes("/rest/v1/public_items")) return json([item]);
    if (u.includes("/rest/v1/categories")) return json([{ name: "Retail" }]);
    if (u.includes("/rest/v1/rpc/public_item_options")) return rpcResult();
    return json([], 404);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of [["SUPABASE_URL", saved.url], ["SUPABASE_ANON_KEY", saved.key]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const ask = async (query = "") => (await handler(new Request(`https://epicmkt.example/api/preview?slug=shop&item=${ID}${query}`))).text();
const image = (html) => html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];

describe("item link preview", () => {
  it("shows the first photo for a plain item link and does not ask for options", async () => {
    const html = await ask();
    expect(image(html)).toContain("cover.webp");
    expect(calls.some((c) => c.includes("rpc/public_item_options"))).toBe(false);
  });

  it("shows the photo of the chosen option", async () => {
    const html = await ask("&v=blue");
    expect(image(html)).toContain("blue.webp");
    expect(html).toContain(`<link rel="canonical" href="https://epicmkt.example/b/shop/i/${ID}"`);
  });

  it("shows the first photo when the chosen option has none, or the choice is not valid", async () => {
    expect(image(await ask("&v=grey"))).toContain("cover.webp");
    expect(image(await ask("&v=nonsense"))).toContain("cover.webp");
  });

  it("still returns a good preview when the options lookup fails", async () => {
    rpcResult = () => json({ message: "boom" }, 500);
    const html = await ask("&v=blue");
    expect(image(html)).toContain("cover.webp");
    expect(html).toContain("<title>Galaxy");
  });

  it("ignores a variant on a store link", async () => {
    const html = await (await handler(new Request("https://epicmkt.example/api/preview?slug=shop&v=blue"))).text();
    expect(calls.some((c) => c.includes("rpc/public_item_options"))).toBe(false);
    expect(html).toContain("og:image");
  });
});
