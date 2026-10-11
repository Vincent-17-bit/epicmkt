import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setLatency } from "@epicmkt/backend";
import { blankItem } from "@epicmkt/shared";
import * as mock from "../api/mock.js";
import { PlanPage } from "./PlanPage.jsx";

setLatency(0);

const mount = async () => {
  const router = createMemoryRouter(
    [
      { path: "/business/plan", element: <PlanPage /> },
      { path: "/business/catalog", element: <div>Catalog page</div> },
    ],
    { initialEntries: ["/business/plan"] }
  );
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(screen.queryByText(/Loading your plan/)).not.toBeInTheDocument());
  return { user, router };
};

// Only the plan cards, not the benefit bullets nested inside them.
const planCards = () => {
  const list = screen.getByRole("list", { name: "Plans" });
  return within(list).getAllByRole("listitem").filter((li) => li.parentElement === list);
};

const contactEnv = () => {
  vi.stubEnv("VITE_CONTACT_EMAIL", "help@epicmkt.test");
  vi.stubEnv("VITE_CONTACT_WHATSAPP", "+254722111222");
  vi.stubEnv("VITE_CONTACT_PHONE", "0712345678");
  vi.stubEnv("VITE_SUPPORT_HOURS", "Mon to Fri, 8am to 5pm");
};

beforeEach(async () => {
  mock.resetMock();
  await mock.login("ES100001", "Demo-Passw0rd");
});
afterEach(() => vi.unstubAllEnvs());

describe("plan page: Standard seller", () => {
  test("highlights the current plan, shows usage and both plans' real numbers", async () => {
    await mock.createItem(blankItem({ name: "Alpha", sort: 0 }));
    await mock.createItem(blankItem({ name: "Bravo", sort: 1 }));
    await mount();
    expect(screen.getByRole("heading", { name: "Your plan" })).toBeInTheDocument();
    expect(screen.getByTestId("usage-meter")).toHaveTextContent("2 of 25 items");
    const cards = planCards();
    expect(cards).toHaveLength(2);
    const [standard, premium] = cards;
    expect(standard).toHaveAttribute("aria-current", "true");
    expect(premium).not.toHaveAttribute("aria-current");
    expect(within(standard).getByText("Your plan")).toBeInTheDocument();
    expect(within(premium).queryByText("Your plan")).not.toBeInTheDocument();
    expect(standard).toHaveTextContent("KSh 500");
    expect(standard).toHaveTextContent("Up to 25 items");
    expect(premium).toHaveTextContent("KSh 1,300");
    expect(premium).toHaveTextContent("Up to 70 items");
    expect(within(premium).getByText("CSV and Excel import")).toBeInTheDocument();
  });

  test("says what Premium adds", async () => {
    await mount();
    const adds = screen.getByRole("region", { name: "What Premium adds" });
    expect(adds).toHaveTextContent("45 more items: up to 70 instead of 25");
    expect(within(adds).getByText("Priority placement in category lists")).toBeInTheDocument();
  });

  test("every number comes from the plan data, not the page", async () => {
    mock.setMockPlanNumbers("premium", { priceKes: 2000, itemsLimit: 120 });
    mock.setMockPlanNumbers("standard", { priceKes: 800, itemsLimit: 40 });
    await mount();
    expect(screen.getByTestId("usage-meter")).toHaveTextContent("0 of 40 items");
    expect(screen.getByRole("region", { name: "What Premium adds" })).toHaveTextContent("80 more items: up to 120 instead of 40");
    expect(planCards()[1]).toHaveTextContent("KSh 2,000");
    expect(screen.queryByText(/KSh 1,300|KSh 1,500|KSh 500/)).not.toBeInTheDocument();
  });

  test("the upgrade action is a set of real links carrying the seller, the current plan and the plan wanted", async () => {
    contactEnv();
    await mount();
    const section = screen.getByRole("region", { name: "Contact EpicMKT to upgrade" });
    const email = within(section).getByRole("link", { name: /Email EpicMKT/ });
    const href = new URL(email.getAttribute("href"));
    expect(href.protocol).toBe("mailto:");
    expect(href.pathname).toBe("help@epicmkt.test");
    expect(decodeURIComponent(href.searchParams.get("subject"))).toBe("Upgrade request: Demo Shop to Premium");
    expect(decodeURIComponent(href.searchParams.get("body"))).toMatch(/Demo Shop \(Seller ID ES100001\) from Standard to Premium/);
    const wa = within(section).getByRole("link", { name: /WhatsApp EpicMKT/ });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/254722111222\?text=/);
    expect(wa).toHaveAttribute("target", "_blank");
    expect(wa).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(section).getByRole("link", { name: /Call EpicMKT/ })).toHaveAttribute("href", "tel:+254712345678");
    expect(within(section).getByText(/Mon to Fri, 8am to 5pm/)).toBeInTheDocument();
    for (const link of within(section).getAllByRole("link")) expect(link.getAttribute("href")).toBeTruthy();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  });

  test("with no contact details configured it says so instead of showing dead buttons", async () => {
    await mount();
    const section = screen.getByRole("region", { name: "Contact EpicMKT to upgrade" });
    expect(within(section).queryByRole("link")).not.toBeInTheDocument();
    expect(within(section).getByRole("status")).toHaveTextContent(/contact details are not set up/i);
  });

  test("only the channels that are configured appear", async () => {
    vi.stubEnv("VITE_CONTACT_EMAIL", "help@epicmkt.test");
    await mount();
    const section = screen.getByRole("region", { name: "Contact EpicMKT to upgrade" });
    expect(within(section).getAllByRole("link").map((l) => l.textContent.trim().split(" help")[0])).toEqual(["Email EpicMKT"]);
  });
});

describe("plan page: Premium seller (highest plan)", () => {
  test("marks Premium as current and offers no upgrade", async () => {
    contactEnv();
    mock.setMockPlan("premium");
    await mock.createItem(blankItem({ name: "Alpha", sort: 0 }));
    await mount();
    const [standard, premium] = planCards();
    expect(premium).toHaveAttribute("aria-current", "true");
    expect(standard).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("usage-meter")).toHaveTextContent("1 of 70 items");
    expect(screen.queryByRole("region", { name: /Contact EpicMKT to upgrade/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /What .* adds/ })).not.toBeInTheDocument();
    expect(screen.getByText(/You are on our highest plan/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Email EpicMKT/ })).not.toBeInTheDocument();
  });
});

describe("plan page: states", () => {
  test("a failed load shows an error and Try again recovers", async () => {
    mock.resetMock(); // signed out, so the first load fails
    const { user } = await mount();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load your plan/i);
    await mock.login("ES100001", "Demo-Passw0rd");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("list", { name: "Plans" })).toBeInTheDocument();
  });

  test("links back to the catalog", async () => {
    const { user, router } = await mount();
    await user.click(screen.getByRole("link", { name: "Back to your catalog" }));
    expect(router.state.location.pathname).toBe("/business/catalog");
  });
});
