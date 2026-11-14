import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as typesApi from "../../api/mockProductTypes.js";
import * as specApi from "../../api/mockSpecRules.js";
import * as chartApi from "../../api/mockSizeCharts.js";
import * as valuesApi from "../../api/mockValues.js";
import { buildKit, kitText } from "../../lib/kit.js";

const api = {
  listTypeSettings: typesApi.listTypeSettings, saveTypeSettings: typesApi.saveTypeSettings,
  listSpecTypes: specApi.listSpecTypes, saveSpecRows: specApi.saveSpecRows,
  listSizeCharts: chartApi.listSizeCharts, saveSizeChart: chartApi.saveSizeChart,
  listOptionValues: valuesApi.listOptionValues, importOptionValue: valuesApi.importOptionValue,
};
vi.mock("../../api/index.js", () => ({ api, default: api }));
vi.mock("../../hooks/usePermissions.js", () => ({ usePermissions: () => ({ can: () => true, why: () => undefined }) }));
vi.mock("../../components/Toast.jsx", () => ({ useToast: () => ({ push: () => {} }) }));
const { default: KitPage } = await import("./KitPage.jsx");

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><KitPage /></MemoryRouter>
  </QueryClientProvider>,
);
beforeEach(() => { typesApi.resetMockProductTypes(); specApi.resetMockSpecRules(); chartApi.resetMockSizeCharts(); valuesApi.resetMockValues(); });
afterEach(cleanup);

const kitOf = async () => {
  const ts = await typesApi.listTypeSettings();
  const category = ts.types.find((t) => t.id === "shoes-eu").categoryIds[0];
  return buildKit({ category: { id: category, name: category }, types: ts.types, specTypes: await specApi.listSpecTypes(), sizeCharts: await chartApi.listSizeCharts(), values: [] });
};

describe("Category kits", () => {
  it("exports with counts for the chosen category", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Export a kit" })).toBeInTheDocument();
    expect(await screen.findByText(/\d+ types?, \d+ spec rows/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeEnabled();
  });

  it("refuses a file that is not a kit and says why", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Or paste the kit"), { target: { value: "{\"nope\":1}" } });
    fireEvent.click(screen.getByRole("button", { name: "Check the kit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This kit cannot be used");
    expect(screen.queryByRole("button", { name: /^Import/ })).toBeNull();
  });

  it("previews an import and applies it", async () => {
    const kit = await kitOf();
    const text = kitText({ ...kit, types: kit.types.map((t) => ({ ...t, name: `${t.name} copy`, id: `${t.id}-copy` })) });
    renderPage();
    fireEvent.change(await screen.findByLabelText("Or paste the kit"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Check the kit" }));
    const go = await screen.findByRole("button", { name: /^Import \d+ change/ });
    expect(screen.getByText(/new, .* to change/)).toBeInTheDocument();
    fireEvent.click(go);
    expect(await screen.findByText(/changes? applied/)).toBeInTheDocument();
    const ts = await typesApi.listTypeSettings();
    expect(ts.types.some((t) => t.name.endsWith(" copy"))).toBe(true);
  });

  it("clones a type, switched off", async () => {
    renderPage();
    const section = within((await screen.findByRole("heading", { name: "Clone a type" })).closest("section"));
    fireEvent.change(section.getByLabelText(/Name of the copy/), { target: { value: "Trail shoes" } });
    fireEvent.click(section.getByRole("button", { name: "Clone type" }));
    expect(await screen.findByText(/switched off/)).toBeInTheDocument();
    await waitFor(async () => {
      const ts = await typesApi.listTypeSettings();
      expect(ts.types.find((t) => t.name === "Trail shoes")?.active).toBe(false);
    });
  });
});
