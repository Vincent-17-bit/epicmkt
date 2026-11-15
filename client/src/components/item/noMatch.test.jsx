import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { phone } from "@epicmkt/shared/options/fixtures";

const logUnmetDemand = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("../../api/index.js", () => ({ logUnmetDemand }));

import { useOptionSelection } from "../../hooks/useOptionSelection.js";
import { seriousViolations } from "../../test/axe.js";
import Options from "./Options.jsx";

const seller = { id: "11111111-1111-4111-8111-111111111111", name: "Shop" };
function Harness({ item }) {
  const option = useOptionSelection(item, "it");
  return <Options ctx={{ option, seller }} slot={{ item }} />;
}
const mount = () => render(<MemoryRouter initialEntries={["/?item=it"]}><Harness item={{ ...phone(), id: "22222222-2222-4222-8222-222222222222" }} /></MemoryRouter>);
const radio = (group, name) => screen.getByRole("radio", { name: new RegExp(name) });

beforeEach(() => logUnmetDemand.mockClear());

describe("no-match box", () => {
  it("is absent until the buyer asks for something that is not on sale", () => {
    mount();
    expect(screen.queryByRole("region", { name: /Not available/ })).toBeNull();
  });

  it("names what was asked for, why not, and the closest combinations that are on sale", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(radio("Color", "Grey"));
    await user.click(radio("Storage", "512 GB"));
    const box = await screen.findByRole("region", { name: /Not available: Grey, 512 GB/ });
    expect(box).toHaveTextContent("sold out");
    expect(screen.getByText("Closest matches")).toBeInTheDocument();
    expect(box.querySelectorAll("li").length).toBeGreaterThanOrEqual(1);
  });

  it("a closest match jumps to that combination and clears the box", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(radio("Storage", "512 GB"));
    await user.click(radio("Color", "Grey"));
    const first = (await screen.findByRole("region", { name: /Not available/ })).querySelector("li button");
    await user.click(first);
    expect(screen.queryByRole("region", { name: /Not available/ })).toBeNull();
    expect(screen.getAllByRole("radio", { checked: true }).length).toBe(2);
  });

  it("sends nothing until the button is tapped, then sends the filters once and says thanks", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(radio("Storage", "512 GB"));
    await user.click(radio("Color", "Grey"));
    await screen.findByRole("region", { name: /Not available/ });
    expect(logUnmetDemand).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Let the seller know" }));
    expect(logUnmetDemand).toHaveBeenCalledTimes(1);
    expect(logUnmetDemand).toHaveBeenCalledWith({ businessId: seller.id, itemId: "22222222-2222-4222-8222-222222222222", filters: { color: "Grey", storage: "512 GB" } });
    expect(await screen.findByText(/Thank you/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Let the seller know" })).toBeNull();
  });

  it("says when sending failed, and the button stays", async () => {
    logUnmetDemand.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    mount();
    await user.click(radio("Storage", "512 GB"));
    await user.click(radio("Color", "Grey"));
    await screen.findByRole("region", { name: /Not available/ });
    await user.click(screen.getByRole("button", { name: "Let the seller know" }));
    expect(await screen.findByText(/could not send/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Let the seller know" })).toBeEnabled();
  });

  it("can be dismissed and passes axe", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await user.click(radio("Storage", "512 GB"));
    await user.click(radio("Color", "Grey"));
    await screen.findByRole("region", { name: /Not available/ });
    expect(await seriousViolations(container)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: /Not available/ })).toBeNull();
  });
});
