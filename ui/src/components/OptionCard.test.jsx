import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { seriousViolations } from "../test/axe.js";
import OptionCard from "./OptionCard.jsx";
import OptionSelect from "./OptionSelect.jsx";

const group = (children) => <div role="radiogroup" aria-label="Color">{children}</div>;

describe("OptionCard", () => {
  it("is a radio with its name, checked state and click", async () => {
    const onSelect = vi.fn();
    render(group(<OptionCard label="Grey" selected onSelect={onSelect} />));
    const card = screen.getByRole("radio", { name: "Grey" });
    expect(card).toHaveAttribute("aria-checked", "true");
    await userEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("draws a swatch, a photo or plain text, and a compact button", () => {
    const { container, rerender } = render(group(<OptionCard label="Grey" swatch="#888" />));
    expect(screen.getByRole("radio")).toHaveAttribute("data-kind", "swatch");
    rerender(group(<OptionCard label="Linen" imageUrl="https://example.test/l.png" />));
    expect(screen.getByRole("radio")).toHaveAttribute("data-kind", "photo");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    rerender(group(<OptionCard label="256 GB" />));
    expect(screen.getByRole("radio")).toHaveAttribute("data-kind", "text");
    rerender(group(<OptionCard label="M" compact />));
    expect(screen.getByRole("radio")).toHaveAttribute("data-kind", "button");
  });

  it("shows its price and the struck earlier price, with a word for screen readers", () => {
    render(group(<OptionCard label="256 GB" price="KES 12,078" was="KES 16,883" wasLabel="Was" />));
    const card = screen.getByRole("radio");
    expect(card).toHaveTextContent("KES 12,078");
    expect(card.querySelector("s")).toHaveTextContent("Was KES 16,883");
    expect(card).toHaveAccessibleName(/256 GB.*KES 12,078.*Was KES 16,883/);
  });

  it("marks an unavailable choice dashed and says so, and it can still be picked", async () => {
    const onSelect = vi.fn();
    render(group(<OptionCard label="Blue" unavailable unavailableText="Currently unavailable" onSelect={onSelect} />));
    const card = screen.getByRole("radio", { name: "Blue Currently unavailable" });
    expect(card).toHaveAttribute("data-unavailable");
    expect(card).not.toBeDisabled();
    await userEvent.click(card);
    expect(onSelect).toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      group(
        <>
          <OptionCard label="Grey" swatch="#888" price="KES 24,000" selected tabIndex={0} />
          <OptionCard label="Blue" swatch="#00f" price="KES 25,000" unavailable unavailableText="Currently unavailable" tabIndex={-1} />
        </>
      )
    );
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe("OptionSelect", () => {
  const items = [{ id: "38", label: "EU 38" }, { id: "39", label: "EU 39", unavailable: true, suffix: "Currently unavailable" }];
  it("is a labelled dropdown that reports the choice, keeping unavailable values listed", async () => {
    const onChange = vi.fn();
    const { container } = render(<OptionSelect label="Size" value="38" items={items} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Size" });
    expect(select).toHaveValue("38");
    expect(screen.getByRole("option", { name: "EU 39 (Currently unavailable)" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "39");
    expect(onChange).toHaveBeenCalledWith("39");
    expect(await seriousViolations(container)).toEqual([]);
  });
});
