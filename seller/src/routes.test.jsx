import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { freshSession, renderApp } from "./test/helpers.jsx";

describe.each([
  ["", ""],
  ["/business", "/business"]
])("seller app at base %j", (_, base) => {
  beforeEach(freshSession);

  it.each([
    ["/login", "Seller login"],
    ["/forgot-password", "Forgot password"]
  ])("renders %s", async (path, heading) => {
    renderApp(path, base);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it.each(["/", "/first-login", "/catalog"])("sends a signed-out visitor from %s to the login page", async (path) => {
    const { router } = renderApp(path, base);
    await screen.findByRole("heading", { name: "Seller login" });
    expect(router.state.location.pathname).toBe(`${base}/login`);
  });

  it("prefixes internal links with the base", async () => {
    renderApp("/login", base);
    expect(await screen.findByRole("link", { name: "Forgot password" })).toHaveAttribute("href", `${base}/forgot-password`);
  });
});
