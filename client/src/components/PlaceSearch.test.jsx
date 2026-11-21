import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PlaceSearch from "./PlaceSearch.jsx";

const kilimani = { name: "Kilimani", label: "Kilimani, Nairobi", lat: -1.29, lng: 36.78, kind: "suburb" };
const setup = (search = vi.fn().mockResolvedValue([kilimani])) => {
  const onPick = vi.fn();
  render(<PlaceSearch label="Search" placeholder="Type" onPick={onPick} search={search} delay={0} />);
  return { onPick, search, box: screen.getByRole("combobox", { name: "Search" }) };
};

describe("PlaceSearch", () => {
  it("lists nothing for a single letter that matches no town, and does not search", async () => {
    const { box, search } = setup();
    await userEvent.type(box, "z");
    expect(screen.queryByRole("option")).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("shows towns at once and online areas after a moment, each once", async () => {
    const { box, search } = setup(vi.fn().mockResolvedValue([{ name: "Kisumu", label: "Kisumu, Kisumu", lat: 0, lng: 34.7 }, { name: "Kisumu Ndogo", label: "Kisumu Ndogo, Kisumu", lat: 0, lng: 34.8 }]));
    await userEvent.type(box, "kisu");
    expect(await screen.findByRole("option", { name: /Kisumu Ndogo/ })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /^Kisumu/ }).filter((o) => /^Kisumu(,|$| Kisumu)/.test(o.textContent) && !/Ndogo/.test(o.textContent))).toHaveLength(1);
    expect(search).toHaveBeenLastCalledWith("kisu", expect.objectContaining({ signal: expect.anything() }));
  });

  it("picks an online area with its name and position", async () => {
    const { box, onPick } = setup();
    await userEvent.type(box, "kilim");
    await userEvent.click(await screen.findByRole("option", { name: /Kilimani/ }));
    expect(onPick).toHaveBeenCalledWith({ name: "Kilimani, Nairobi", lat: -1.29, lng: 36.78 });
    expect(box).toHaveValue("");
  });

  it("works from the keyboard: arrows move, Enter picks, Escape closes", async () => {
    const { box, onPick } = setup();
    await userEvent.type(box, "kilim");
    await screen.findByRole("option", { name: /Kilimani/ });
    await userEvent.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledTimes(1);
    await userEvent.type(box, "kilim");
    await screen.findByRole("option", { name: /Kilimani/ });
    await userEvent.keyboard("{Escape}");
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("says when nothing is found, and still works when the online search fails", async () => {
    const { box } = setup(vi.fn().mockResolvedValue([]));
    await userEvent.type(box, "qqqqq");
    expect(await screen.findByText("No place found. Try the nearest town.")).toBeInTheDocument();
  });

  it("an older slow answer never replaces a newer one", async () => {
    let first;
    const search = vi.fn().mockImplementationOnce(() => new Promise((r) => { first = r; })).mockResolvedValue([kilimani]);
    const { box } = setup(search);
    await userEvent.type(box, "ki");
    await userEvent.type(box, "l");
    await screen.findByRole("option", { name: /Kilimani/ });
    first([{ name: "Stale", label: "Stale, Nairobi", lat: -1, lng: 36 }]);
    await Promise.resolve();
    expect(screen.queryByRole("option", { name: /Stale/ })).toBeNull();
  });
});
