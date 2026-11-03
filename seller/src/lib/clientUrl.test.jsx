import { afterEach, describe, expect, it, vi } from "vitest";
import { clientItemUrl, clientShopUrl } from "./clientUrl.js";

afterEach(() => vi.unstubAllEnvs());

describe("client links", () => {
  it("prefers VITE_CLIENT_URL, then VITE_SITE_URL, then the default site", () => {
    vi.stubEnv("VITE_CLIENT_URL", "https://client.test/");
    vi.stubEnv("VITE_SITE_URL", "https://site.test");
    expect(clientItemUrl("mama-oliech", "it-1")).toBe("https://client.test/b/mama-oliech/i/it-1");
    vi.stubEnv("VITE_CLIENT_URL", "");
    expect(clientItemUrl("mama-oliech", "it-1")).toBe("https://site.test/b/mama-oliech/i/it-1");
    vi.stubEnv("VITE_SITE_URL", "");
    expect(clientShopUrl("mama-oliech")).toBe("https://epicmkt.app/s/mama-oliech");
  });
});
