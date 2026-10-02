import assert from "node:assert/strict";
import { setLatency, searchBusinesses, getBusiness, getCategories, getTopSearches, logSearch, logContactEvent, getSuggestions, getNearbyBusinesses, getSimilarBusinesses, getFeaturedBusinesses, resolveShortcode, reportBusiness, getSellerBusiness, updateSellerBusiness, ValidationError } from "./src/index.js";
import { getOverview, listBusinesses, setBusinessStatus } from "../admin-backend/src/index.js";

setLatency(0);

const cats = await getCategories();
assert.equal(cats.length, 10);

const barbers = await searchBusinesses({ query: "barber" });
assert.ok(barbers.items.length >= 3);
assert.equal(barbers.items[0].plan, "premium");

assert.ok((await searchBusinesses({ query: "pharmacy", county: "Kisumu" })).items.every((b) => b.county === "Kisumu"));
assert.equal((await searchBusinesses({ query: "zzzz" })).total, 0);

const nearMaseno = await searchBusinesses({ lat: -0.0058, lng: 34.6, sort: "distance" });
assert.ok(nearMaseno.items[0].distanceKm < 1);
assert.ok(nearMaseno.items.every((b) => b.id !== "b_023" && b.id !== "b_024"));

const biz = await getBusiness("fade-kings-barbershop");
assert.equal(biz.id, "b_001");
assert.equal(biz.sellerId, undefined);
await assert.rejects(() => getBusiness("old-lake-chemist"), { name: "NotFoundError" });

assert.ok(biz.coverUrl && biz.logoUrl && biz.services.every((svc) => svc.imageUrl) && biz.gallery.every((g) => g.url));
assert.equal(biz.offers.length, 2);
assert.ok(biz.offers.every((o) => Date.parse(o.expiresAt) > Date.now()));
assert.equal((await getBusiness("b_021")).offers.length, 0);
assert.ok(biz.closesAt || biz.opensAt);
assert.equal((await resolveShortcode(biz.shortcode)).slug, biz.slug);
await assert.rejects(() => resolveShortcode("nope"), { name: "NotFoundError" });
assert.equal((await reportBusiness({ businessId: "b_001", reason: "closed" })).ok, true);
await assert.rejects(() => reportBusiness({ businessId: "b_001", reason: "x" }), ValidationError);
await assert.rejects(() => reportBusiness({ businessId: "zzz", reason: "closed" }), { name: "NotFoundError" });

const featuredA = await getFeaturedBusinesses({ limit: 20, seed: 1 });
const featuredB = await getFeaturedBusinesses({ limit: 20, seed: 2 });
assert.ok(featuredA.every((b) => b.plan === "premium"));
assert.deepEqual([...featuredA.map((b) => b.id)].sort(), [...featuredB.map((b) => b.id)].sort());
assert.notDeepEqual(featuredA.map((b) => b.id), featuredB.map((b) => b.id));

assert.ok((await getSuggestions("bar")).length > 0);
assert.ok((await getNearbyBusinesses({ lat: -0.0058, lng: 34.6, radiusKm: 3 })).length >= 5);
assert.ok((await getSimilarBusinesses("b_001")).every((b) => b.categoryId === "barbershops"));

await logSearch("Haircut");
await logSearch("haircut");
assert.equal((await getTopSearches(10)).find((s) => s.term === "haircut").count, 200);

const before = (await getSellerBusiness("s_001")).stats.call;
await logContactEvent({ businessId: "b_001", type: "call" });
assert.equal((await getSellerBusiness("s_001")).stats.call, before + 1);

await assert.rejects(() => updateSellerBusiness("s_002", { socials: { x: "a" } }), ValidationError);
await assert.rejects(() => updateSellerBusiness("s_002", { plan: "premium" }), ValidationError);
assert.equal((await updateSellerBusiness("s_002", { tagline: "Updated" })).tagline, "Updated");

const overview = await getOverview();
assert.equal(overview.totalBusinesses, 24);
assert.equal(overview.byStatus.pending, 1);
await setBusinessStatus("b_023", "active");
assert.equal((await listBusinesses({ status: "pending" })).total, 0);
assert.equal((await searchBusinesses({ query: "phone" })).total, 1);

console.log("all checks passed");
