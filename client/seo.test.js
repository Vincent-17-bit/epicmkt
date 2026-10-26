import { describe, expect, it } from "vitest";
import { buildSiteJsonLd, jsonLdTag, resolveSiteUrl, verificationTags } from "./seo.js";

describe("resolveSiteUrl", () => {
  it("prefers VITE_SITE_URL and trims a trailing slash", () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: "https://epicmkt.app/" }, { VERCEL_PROJECT_PRODUCTION_URL: "epicmkt.vercel.app" })).toBe("https://epicmkt.app");
  });
  it("adds https when the scheme is left out", () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: "epicmkt.app" })).toBe("https://epicmkt.app");
  });
  it("falls back to the Vercel production domain", () => {
    expect(resolveSiteUrl({}, { VERCEL_PROJECT_PRODUCTION_URL: "epicmkt.vercel.app" })).toBe("https://epicmkt.vercel.app");
  });
  it("is empty when nothing is known", () => {
    expect(resolveSiteUrl({}, {})).toBe("");
  });
});

describe("buildSiteJsonLd", () => {
  it("returns null without a site url", () => {
    expect(buildSiteJsonLd({ site: "" })).toBeNull();
  });
  it("describes the website, organization and app with absolute urls", () => {
    const data = buildSiteJsonLd({ site: "https://epicmkt.app", socials: ["https://facebook.com/x", "", "nope"], email: "hi@epicmkt.app" });
    const [site, org, app] = data["@graph"];
    expect(site["@type"]).toBe("WebSite");
    expect(site.potentialAction.target.urlTemplate).toBe("https://epicmkt.app/search?q={search_term_string}");
    expect(org.logo.url).toBe("https://epicmkt.app/icon-512.png");
    expect(org.sameAs).toEqual(["https://facebook.com/x"]);
    expect(org.contactPoint[0].email).toBe("hi@epicmkt.app");
    expect(app["@type"]).toBe("WebApplication");
    expect(app.offers.price).toBe("0");
  });
  it("leaves out contact and social fields that are not set", () => {
    const org = buildSiteJsonLd({ site: "https://epicmkt.app" })["@graph"][1];
    expect(org.sameAs).toBeUndefined();
    expect(org.contactPoint).toBeUndefined();
  });
  it("cannot close its own script tag", () => {
    expect(jsonLdTag({ name: "</script><b>" })).not.toMatch(/<\/script><b>/);
  });
});

describe("verificationTags", () => {
  it("writes only the tags that have a value, escaped", () => {
    expect(verificationTags({})).toBe("");
    expect(verificationTags({ VITE_GOOGLE_SITE_VERIFICATION: 'abc"1' })).toBe('<meta name="google-site-verification" content="abc&quot;1" />');
    expect(verificationTags({ VITE_BING_SITE_VERIFICATION: "z9" })).toContain('name="msvalidate.01" content="z9"');
  });
});
