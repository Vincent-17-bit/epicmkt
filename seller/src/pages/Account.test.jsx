import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuardProvider } from "../lib/guard.jsx";
import * as api from "../api/mock.js";
import Account from "./Account.jsx";

vi.mock("../components/account/MapPicker.jsx", () => ({
  default: ({ value, onChange }) => (
    <div data-testid="map">
      <span>{value ? `${value.lat},${value.lng}` : "no pin"}</span>
      {onChange && <button type="button" onClick={() => onChange({ lat: -1.3, lng: 36.9 })}>move pin</button>}
    </div>
  ),
}));
vi.mock("../api/index.js", async () => await import("../api/mock.js"));

const open = async (who = "ES100001") => {
  api.resetMock();
  await api.login(who, "Demo-Passw0rd");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter(
    [
      { path: "/business/account", element: <GuardProvider><Account /></GuardProvider> },
      { path: "/business/plan", element: <p>plan page</p> },
    ],
    { initialEntries: ["/business/account"] }
  );
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
  await screen.findByRole("heading", { name: /Your listing/ });
  return { router, user: userEvent.setup() };
};

const card = (id) => within(document.getElementById(id));

describe("My Account", () => {
  beforeEach(() => api.resetMock());

  it("groups sections and marks the locked ones", async () => {
    await open();
    expect(card("details-readonly").queryAllByRole("button")).toHaveLength(0);
    for (const id of ["name", "category", "location", "phone", "town"]) expect(card(id).getByText("Changes need approval")).toBeInTheDocument();
    expect(card("licence-card").getByText("Changes need approval")).toBeInTheDocument();
    expect(card("basics").queryByText("Changes need approval")).toBeNull();
    expect(card("details-readonly").getByText("ES100001")).toBeInTheDocument();
    expect(card("details-readonly").getByText("epicmkt.co.ke/s/demo-shop-100001")).toBeInTheDocument();
  });

  it("saves an editable section straight away and enforces the limits", async () => {
    const { user } = await open();
    await user.click(card("basics").getByRole("button", { name: "Edit Tagline, description and year" }));
    const tagline = card("basics").getByLabelText("Tagline");
    await user.click(tagline);
    await user.paste("x".repeat(81));
    expect(card("basics").getByText("Use up to 80 characters")).toBeInTheDocument();
    expect(card("basics").getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(tagline);
    await user.type(tagline, "Fresh cuts");
    await user.click(card("basics").getByRole("button", { name: "Save" }));
    await waitFor(() => expect(card("basics").getByText("Fresh cuts")).toBeInTheDocument());
    expect(card("basics").queryByText("Not edited yet")).toBeNull();
    expect((await api.getMyBusiness()).tagline).toBe("Fresh cuts");
  });

  it("keeps the old value live while a locked change waits, and lets the seller cancel it", async () => {
    const { user } = await open();
    await user.click(card("name").getByRole("button", { name: "Edit Business name" }));
    const input = card("name").getByLabelText("Business name");
    await user.clear(input);
    await user.type(input, "Demo Shop Deluxe");
    await user.click(card("name").getByRole("button", { name: "Save" }));
    await card("name").findByText("Pending approval");
    expect(card("name").getByText("Demo Shop")).toBeInTheDocument();
    expect(card("name").getByText("Demo Shop Deluxe")).toBeInTheDocument();
    expect(card("name").getByRole("button", { name: "Edit Business name" })).toBeDisabled();
    expect((await api.getMyBusiness()).name).toBe("Demo Shop");
    await user.click(card("name").getByRole("button", { name: "Cancel request" }));
    await waitFor(() => expect(card("name").queryByText("Pending approval")).toBeNull());
  });

  it("quotes the prorated difference for a dearer category and nothing for a cheaper one", async () => {
    const { user } = await open();
    await user.click(card("category").getByRole("button", { name: "Edit Category" }));
    await user.selectOptions(card("category").getByLabelText("Category"), "salon");
    expect(card("category").getByText(/to pay first/)).toBeInTheDocument();
    await user.selectOptions(card("category").getByLabelText("Category"), "stall");
    expect(card("category").getByText("Nothing to pay now.")).toBeInTheDocument();
    await user.selectOptions(card("category").getByLabelText("Category"), "salon");
    await user.click(card("category").getByRole("button", { name: "Save" }));
    await card("category").findByText(/Awaiting payment of KES/);
    expect(card("category").getByText("Barber")).toBeInTheDocument();
  });

  it("sends a moved map pin as a change request", async () => {
    const { user } = await open();
    await user.click(card("location").getByRole("button", { name: "Edit Map pin" }));
    await user.click(card("location").getByRole("button", { name: "move pin" }));
    await user.click(card("location").getByRole("button", { name: "Save" }));
    await card("location").findByText("Pending approval");
    expect(card("location").getByText("-1.300000, 36.900000")).toBeInTheDocument();
    expect((await api.getMyBusiness()).lat).toBeCloseTo(0.2827);
  });

  it("asks before leaving with unsaved edits", async () => {
    const { router, user } = await open();
    await user.click(card("tags").getByRole("button", { name: "Edit Tags" }));
    await user.type(card("tags").getByLabelText("Add a tag"), "fade");
    await user.click(card("tags").getByRole("button", { name: "Add" }));
    await act(async () => { router.navigate("/business/plan"); });
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Leave without saving?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Stay on this page" }));
    expect(router.state.location.pathname).toBe("/business/account");
    await user.click(card("tags").getByRole("button", { name: "Cancel" }));
    await act(async () => { router.navigate("/business/plan"); });
    expect(await screen.findByText("plan page")).toBeInTheDocument();
  });

  it("locks the Premium sections on Standard and opens them on Premium", async () => {
    await open("ES100001");
    expect(card("announcement").getByText(/part of the Premium plan/)).toBeInTheDocument();
    expect(card("branches").getByText(/part of the Premium plan/)).toBeInTheDocument();
    expect(card("branches").queryByRole("button", { name: "Add branch" })).toBeNull();
  });

  it("lets a Premium seller set a clean banner and add up to five branches", async () => {
    const { user } = await open("ES100002");
    await user.click(card("announcement").getByRole("button", { name: "Edit Announcement banner" }));
    const box = card("announcement").getByLabelText("Banner text");
    await user.type(box, "Call 0712 345 678");
    expect(card("announcement").getByText(/Remove phone numbers/)).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "Open late on Friday");
    await user.click(card("announcement").getByRole("button", { name: "Save" }));
    await card("announcement").findByText("Open late on Friday");

    for (let i = 1; i <= 5; i++) {
      await user.click(card("branches").getByRole("button", { name: "Add branch" }));
      await user.type(card("branches").getByLabelText("Branch name"), `Branch ${i}`);
      await user.click(card("branches").getByRole("button", { name: "Save" }));
      await card("branches").findByText(`Branch ${i}`);
    }
    expect(card("branches").getByRole("button", { name: "Add branch" })).toBeDisabled();
    expect(card("branches").getByText(/5 of 5 branches/)).toBeInTheDocument();
  });
});
