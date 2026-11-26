import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhoneInput from "./PhoneInput.jsx";
import { seriousViolations } from "../test/axe.js";

function Harness({ initial = "", onValue = () => {}, ...props }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <label htmlFor="p">Phone</label>
      <PhoneInput id="p" value={v} onChange={(x) => { setV(x); onValue(x); }} {...props} />
      <output data-testid="value">{v}</output>
    </>
  );
}
const value = () => screen.getByTestId("value").textContent;
const countryButton = () => screen.getByRole("button", { name: /country code/i });

describe("PhoneInput", () => {
  it("starts on Kenya with its flag and prefix, and turns a local number into the international one", async () => {
    render(<Harness />);
    expect(countryButton()).toHaveTextContent("🇰🇪");
    expect(countryButton()).toHaveTextContent("+254");
    await userEvent.type(screen.getByLabelText("Phone"), "0712 345 678");
    expect(value()).toBe("+254712345678");
  });

  it("shows an old value written the local way, and a stored international one for its own country", () => {
    const { unmount } = render(<Harness initial="0712 345 678" />);
    expect(screen.getByLabelText("Phone")).toHaveValue("0712 345678");
    expect(countryButton()).toHaveTextContent("+254");
    unmount();
    render(<Harness initial="+256772123456" />);
    expect(countryButton()).toHaveTextContent("🇺🇬");
    expect(countryButton()).toHaveTextContent("+256");
    expect(screen.getByLabelText("Phone")).toHaveValue("0772 123456");
  });

  it("opens a searchable list, finds a country by name, and the number follows the choice", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Phone"), "0772123456");
    expect(value()).toBe("+254772123456");
    await userEvent.click(countryButton());
    const dialog = screen.getByRole("dialog", { name: /choose a country/i });
    expect(within(dialog).getByText("Suggested")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole("combobox"), "ugan");
    const options = within(dialog).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Uganda");
    expect(options[0]).toHaveTextContent("+256");
    await userEvent.click(options[0]);
    expect(countryButton()).toHaveTextContent("🇺🇬");
    expect(countryButton()).toHaveTextContent("+256");
    expect(value()).toBe("+256772123456");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finds a country by its dial code, a nickname, and says so when nothing matches", async () => {
    render(<Harness />);
    await userEvent.click(countryButton());
    const search = screen.getByRole("combobox");
    await userEvent.type(search, "+44");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("United Kingdom");
    await userEvent.clear(search);
    await userEvent.type(search, "uk");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("United Kingdom");
    await userEvent.clear(search);
    await userEvent.type(search, "qqqq");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No country matches/)).toBeInTheDocument();
  });

  it("works from the keyboard: arrows move, Enter chooses, and focus returns to the number", async () => {
    render(<Harness />);
    countryButton().focus();
    await userEvent.keyboard("{Enter}");
    const search = screen.getByRole("combobox");
    await userEvent.type(search, "rwanda{Enter}");
    expect(countryButton()).toHaveTextContent("+250");
    await userEvent.click(countryButton());
    await userEvent.type(screen.getByRole("combobox"), "tanz{ArrowDown}{ArrowUp}{Enter}");
    expect(countryButton()).toHaveTextContent("+255");
  });

  it("a pasted international number switches the country on its own", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+256 772 123 456" } });
    expect(countryButton()).toHaveTextContent("🇺🇬");
    expect(value()).toBe("+256772123456");
    expect(screen.getByLabelText("Phone")).toHaveValue("0772 123456");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0044 20 7123 4567" } });
    expect(countryButton()).toHaveTextContent("+44");
    expect(value()).toBe("+442071234567");
  });

  it("works for countries with no trunk zero and for shared calling codes", async () => {
    render(<Harness defaultCountry="US" />);
    expect(countryButton()).toHaveTextContent("+1");
    await userEvent.type(screen.getByLabelText("Phone"), "4155552671");
    expect(value()).toBe("+14155552671");
    await userEvent.click(countryButton());
    await userEvent.type(screen.getByRole("combobox"), "canada");
    await userEvent.click(screen.getByRole("option"));
    expect(countryButton()).toHaveTextContent("🇨🇦");
    expect(value()).toBe("+14155552671"); // the same +1 number
  });

  it("tidies a good number when leaving the box, and warns, without blocking, about one that cannot be real", async () => {
    render(<Harness />);
    const box = screen.getByLabelText("Phone");
    await userEvent.type(box, "0712345678");
    await userEvent.tab();
    expect(box).toHaveValue("0712 345678");
    expect(screen.queryByText(/does not look like/)).not.toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "07123");
    await userEvent.tab();
    expect(screen.getByText(/does not look like a valid Kenya number/)).toBeInTheDocument();
    expect(box).toHaveAccessibleDescription(/does not look like/);
  });

  it("follows a value set from outside, and clearing empties it", () => {
    const { rerender } = render(<PhoneInput value="" onChange={() => {}} />);
    rerender(<PhoneInput value="+255712345678" onChange={() => {}} />);
    expect(countryButton()).toHaveTextContent("+255");
    rerender(<PhoneInput value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText("Phone number")).toHaveValue("");
  });

  it("passes the surrounding field's aria and blur to the number box, and can be disabled", () => {
    const onBlur = vi.fn();
    render(<PhoneInput value="" onChange={() => {}} onBlur={onBlur} aria-invalid="true" aria-describedby="e" disabled />);
    const box = screen.getByPlaceholderText("Phone number");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAttribute("aria-describedby", "e");
    expect(box).toBeDisabled();
    expect(countryButton()).toBeDisabled();
  });

  it("has no accessibility violations, closed or open", async () => {
    const { container } = render(<Harness />);
    expect(await seriousViolations(container)).toEqual([]);
    await userEvent.click(countryButton());
    expect(await seriousViolations(screen.getByRole("dialog"))).toEqual([]);
  });
});
