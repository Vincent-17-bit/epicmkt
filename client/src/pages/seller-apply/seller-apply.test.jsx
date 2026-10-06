import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { FormProvider, useForm } from "react-hook-form";
import { emptyValues } from "./formModel.js";
import { useCatalog } from "./useCatalog.js";
import PlanStep from "./PlanStep.jsx";
import ReviewStep from "./ReviewStep.jsx";
import PublicSellerLayout from "./PublicSellerLayout.jsx";
import BecomeASeller from "./BecomeASeller.jsx";
import { resetPricing, setPlanOverride } from "../../api/applications/mockStore.js";
import * as api from "../../api/applications/index.js";

vi.mock("../../api/applications/index.js", async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, getCatalogPricing: vi.fn(m.getCatalogPricing) };
});
vi.mock("./MapPicker.jsx", () => ({ default: () => <div>map</div> }));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Harness({ children, defaults = {} }) {
  const methods = useForm({ defaultValues: { ...emptyValues(), ...defaults } });
  const catalog = useCatalog();
  return <FormProvider {...methods}>{children(catalog, methods)}</FormProvider>;
}

const mountStep = (render_, defaults) =>
  render(
    <QueryClientProvider client={client()}>
      <Harness defaults={defaults}>{render_}</Harness>
    </QueryClientProvider>
  );

afterEach(() => {
  resetPricing();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("plan step", () => {
  it("shows skeletons then the plans for the chosen category", async () => {
    mountStep((c) => <PlanStep catalog={c} />, { categoryId: "bakery" });
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(await screen.findByText("Packages for Bakery")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("expanding details does not change the selection, selecting the card does", async () => {
    mountStep((c) => <PlanStep catalog={c} />, { categoryId: "bakery", planKey: "standard" });
    await screen.findByText("Packages for Bakery");
    const [standard, premium] = screen.getAllByRole("radio");
    expect(standard).toBeChecked();
    const buttons = screen.getAllByRole("button", { name: /see all details/i });
    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute("aria-expanded", "true");
    expect(standard).toBeChecked();
    fireEvent.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(premium);
    expect(premium).toBeChecked();
  });

  it("reflects a price change after refetch when the category changes", async () => {
    let form;
    mountStep((c, m) => {
      form = m;
      return <PlanStep catalog={c} />;
    }, { categoryId: "bakery" });
    await screen.findByText("Packages for Bakery");
    setPlanOverride("juice-shop", "standard", { price: 777 });
    act(() => form.setValue("categoryId", "juice-shop"));
    expect(await screen.findByText("Packages for Juice shop")).toBeInTheDocument();
    expect(screen.getAllByText("KES 777").length).toBeGreaterThan(0);
  });

  it("shows a retry state and no prices when loading fails", async () => {
    api.getCatalogPricing.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down"));
    mountStep((c) => <PlanStep catalog={c} />, { categoryId: "bakery" });
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(/could not load/i);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/KES/)).not.toBeInTheDocument();
  });
});

describe("review step", () => {
  const props = (over = {}) => ({
    category: null,
    docs: { files: {} },
    read: { terms: false, privacy: false },
    onRead: () => {},
    goTo: () => {},
    missing: ["Complete \"About you\""],
    onToken: () => {},
    ...over
  });
  const legal = {
    terms: { title: "Seller Terms and Rules", version: "1", key_points: ["a"], body: "one\n\ntwo" },
    privacy: { title: "Privacy Notice", version: "1", key_points: ["b"], body: "three" }
  };

  it("keeps the legal checkboxes disabled until each document is read", () => {
    mountStep(() => <ReviewStep {...props({ legal })} />);
    expect(screen.getByLabelText(/Seller Terms and Rules/)).toBeDisabled();
    expect(screen.getByLabelText(/Privacy Notice/)).toBeDisabled();
    expect(screen.getByLabelText(/authorised to represent/)).toBeEnabled();
    expect(screen.getByText(/Before you can submit/)).toBeInTheDocument();
  });

  it("enables a checkbox once its document has been read", () => {
    mountStep(() => <ReviewStep {...props({ legal, read: { terms: true, privacy: false } })} />);
    expect(screen.getByLabelText(/Seller Terms and Rules/)).toBeEnabled();
    expect(screen.getByLabelText(/Privacy Notice/)).toBeDisabled();
  });

  it("marks a document read when the dialog is scrolled to the end", async () => {
    const onRead = vi.fn();
    mountStep(() => <ReviewStep {...props({ legal, onRead })} />);
    fireEvent.click(screen.getByRole("button", { name: /Open Seller Terms and Rules/ }));
    const body = await screen.findByLabelText("Seller Terms and Rules full text", { selector: "div" }, { hidden: true });
    Object.defineProperty(body, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(body, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(body, "scrollTop", { value: 100, configurable: true });
    fireEvent.scroll(body);
    expect(onRead).not.toHaveBeenCalled();
    Object.defineProperty(body, "scrollTop", { value: 600, configurable: true });
    fireEvent.scroll(body);
    expect(onRead).toHaveBeenCalledWith("terms");
  });
});

const mountPage = () => {
  const router = createMemoryRouter(
    [{ path: "/become-a-seller", element: <PublicSellerLayout />, children: [{ index: true, element: <BecomeASeller /> }] }],
    { initialEntries: ["/become-a-seller"] }
  );
  return render(
    <QueryClientProvider client={client()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

describe("page", () => {
  it("has a header with links, no theme or language toggle, and the intro", async () => {
    mountPage();
    expect(await screen.findByRole("heading", { name: /local customers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /check my application|check status/i })).toHaveAttribute("href", "/become-a-seller/status");
    expect(screen.getByRole("link", { name: /help/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /theme|dark|language/i })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "How it works" })).toBeInTheDocument();
  });

  it("follows the browser colour scheme live", async () => {
    let listener;
    const media = { matches: true, addEventListener: (_, f) => (listener = f), removeEventListener() {} };
    vi.spyOn(window, "matchMedia").mockImplementation(() => media);
    mountPage();
    expect(document.documentElement.dataset.theme).toBe("dark");
    media.matches = false;
    listener();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("lists all categories, shows required documents and validates the next step", async () => {
    const user = userEvent.setup();
    mountPage();
    const group = await screen.findByRole("radiogroup", { name: "Business type" });
    expect(within(group).getAllByRole("radio")).toHaveLength(32);
    await user.click(within(group).getByRole("radio", { name: "Chemist or pharmacy" }));
    expect(await screen.findByText(/Documents you will need/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("About you", { selector: "h2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/need your attention/);
    expect(screen.getAllByText("Full names is required").length).toBeGreaterThan(0);
  });

  it("has no OTP step", async () => {
    mountPage();
    await screen.findByRole("heading", { name: /local customers/i });
    expect(screen.queryByText(/otp|verification code/i)).not.toBeInTheDocument();
  });
});
