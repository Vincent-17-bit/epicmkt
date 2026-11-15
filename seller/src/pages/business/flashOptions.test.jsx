import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import * as mock from "../../api/mock.js";
import { M, signedInApp, setTime } from "../../test/utils.jsx";
import { setServerOffset } from "../../lib/clock.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const NOW = "2026-10-17T09:00:00.000Z";
const axes = [{ key: "colour", label: "Colour", display: "button", values: [{ id: "black", label: "Black" }, { id: "white", label: "White" }, { id: "red", label: "Red" }] }];
const variants = [
  { id: "v1", choice: { colour: "black" }, price: 500, status: "available" },
  { id: "v2", choice: { colour: "white" }, price: 600, status: "available" },
  { id: "v3", choice: { colour: "red" }, price: 450, status: "unavailable" }
];
const open = (prepare) => signedInApp("/business/flash", async () => { setTime(NOW); setServerOffset(0); await prepare?.(); });
const withOptions = () => vi.spyOn(mock, "getItemOptions").mockResolvedValue({ axes, variants, optionAvailability: [], defaultVariantId: null, sizeChartId: null, sizeChartOverride: null });
const start = async (user) => {
  const button = await screen.findByRole("button", { name: "New flash sale" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  fireEvent.change(screen.getByLabelText("Item"), { target: { value: "it-fade" } });
  fireEvent.change(screen.getByLabelText("Percent (1 to 99)"), { target: { value: "10" } });
};

afterEach(() => vi.restoreAllMocks());

describe("flash sale per option (seller)", () => {
  it("an item without options keeps the single price form", async () => {
    const user = userEvent.setup();
    await open();
    await start(user);
    expect(screen.queryByTestId("fs-options")).not.toBeInTheDocument();
    expect(screen.getByTestId("fs-preview")).toHaveTextContent("Customers pay KES 450 instead of KES 500");
  });

  it("every option: shows before and after for each sold combination and the lowest price", async () => {
    const user = userEvent.setup();
    withOptions();
    await open();
    await start(user);
    expect(await screen.findByTestId("fs-options")).toBeInTheDocument();
    expect(await screen.findByTestId("fs-after-colour=black")).toHaveTextContent("KES 450");
    expect(screen.getByTestId("fs-after-colour=white")).toHaveTextContent("KES 540");
    expect(screen.getByTestId("fs-after-colour=red")).toHaveTextContent("Not sold");
    expect(screen.getByTestId("fs-lowest")).toHaveTextContent("Lowest sale price: KES 450");
  });

  it("Black only: only that option is on sale, with its own discount", async () => {
    const user = userEvent.setup();
    withOptions();
    const create = vi.spyOn(mock, "createFlashSale");
    await open();
    await start(user);
    await user.click(await screen.findByRole("radio", { name: "Only some options" }));
    expect(screen.getByText(/Tick the options that go on sale/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Put Black on sale" }));
    expect(screen.getByRole("checkbox", { name: "Put Red on sale" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Discount type for Black"), "amount_off");
    fireEvent.change(screen.getByLabelText("Discount for Black"), { target: { value: "100" } });
    expect(screen.getByTestId("fs-after-colour=black")).toHaveTextContent("KES 400");
    expect(screen.getByTestId("fs-after-colour=white")).toHaveTextContent("Normal price");
    expect(screen.getByTestId("fs-lowest")).toHaveTextContent("KES 400");
    await user.click(screen.getByRole("button", { name: "6 hours" }));
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({ itemId: "it-fade", variantTarget: "chosen", variantOverrides: [{ combo: "colour=black", type: "amount_off", value: 100 }] });
  });

  it("refuses to start a sale on chosen options when none is chosen, and when a discount is too large", async () => {
    const user = userEvent.setup();
    withOptions();
    const create = vi.spyOn(mock, "createFlashSale");
    await open();
    await start(user);
    await user.click(await screen.findByRole("radio", { name: "Only some options" }));
    await user.click(screen.getByRole("button", { name: "6 hours" }));
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/Choose at least one option/);
    await user.click(screen.getByRole("checkbox", { name: "Put Black on sale" }));
    await user.selectOptions(screen.getByLabelText("Discount type for Black"), "amount_off");
    fireEvent.change(screen.getByLabelText("Discount for Black"), { target: { value: "500" } });
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/price zero/);
    expect(create).not.toHaveBeenCalled();
  });

  it("has no serious accessibility violations", async () => {
    const user = userEvent.setup();
    withOptions();
    const { container } = await open();
    await start(user);
    await user.click(await screen.findByRole("radio", { name: "Only some options" }));
    await user.click(screen.getByRole("checkbox", { name: "Put Black on sale" }));
    expect((await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });
});

describe("demo twin of the per-option sale", () => {
  it("accepts chosen combinations on an item with options and refuses others", async () => {
    await open(async () => {});
    const saved = await mock.saveItem("it-fade", { name: "Fade cut", description: "", section: null, priceType: "from", price: 500, unit: null, availability: "available",
      options: { axes, variants: [{ choice: { colour: "black" }, price: 500 }, { choice: { colour: "white" }, price: 600 }] } });
    expect(saved).toBe("it-fade");
    const base = { itemId: "it-fade", discountType: "percent", discountValue: 10, endsAt: "2026-10-17T15:00:00Z", afterEnd: "keep" };
    await expect(mock.createFlashSale({ ...base, variantTarget: "chosen", variantOverrides: [{ combo: "colour=red", type: "percent", value: 10 }] })).rejects.toThrow(/invalid_flash_target/);
    await expect(mock.createFlashSale({ ...base, variantTarget: "chosen", variantOverrides: [] })).rejects.toThrow(/flash_needs_combinations/);
    const sale = await mock.createFlashSale({ ...base, variantTarget: "chosen", variantOverrides: [{ combo: "colour=black", type: "percent", value: 20 }] });
    expect(sale.variantTarget).toBe("chosen");
    expect(sale.variantOverrides).toEqual([{ combo: "colour=black", type: "percent", value: 20 }]);
    expect(M.state.flash.at(-1).variantTarget).toBe("chosen");
  });
});
