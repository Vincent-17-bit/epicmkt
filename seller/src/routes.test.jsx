import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { routes } from "./routes.jsx";

const at = (basename, path) => {
  const router = createMemoryRouter(routes, { basename: basename || undefined, initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

describe.each([
  ["", ""],
  ["/business", "/business"]
])("seller app at base %j", (_, base) => {
  it.each([
    ["/login", "Seller login"],
    ["/forgot-password", "Forgot password"],
    ["/first-login", "First login"]
  ])("renders %s", (path, heading) => {
    at(base, `${base}${path}`);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("redirects the root to the login page", () => {
    const router = at(base, `${base}/`);
    expect(router.state.location.pathname).toBe(`${base}/login`);
  });

  it("prefixes internal links with the base", () => {
    at(base, `${base}/login`);
    expect(screen.getByRole("link", { name: "Forgot password" })).toHaveAttribute("href", `${base}/forgot-password`);
  });
});
