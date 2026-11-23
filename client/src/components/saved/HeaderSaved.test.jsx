import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { configureAxe } from "vitest-axe";
import HeaderSaved from "./HeaderSaved.jsx";
import { savedList } from "../../lib/savedList.js";
import { announce } from "../../stores/savedAnnounce.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

function Probe() {
  const l = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="state">{JSON.stringify(l.state)}</p>
      <p data-testid="index">{String(window.history.length)}</p>
      <button type="button" onClick={() => navigate(-1)}>back</button>
    </>
  );
}
const mount = (entries = ["/"], index) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <HeaderSaved />
      <Probe />
    </MemoryRouter>
  );
const add = (n) => Array.from({ length: n }, (_, i) => savedList().add({ itemId: `i${i}`, businessId: "b", qty: 1 }));

beforeEach(() => savedList().clear());

describe("HeaderSaved", () => {
  it("is a 44 px button with the right ARIA and no badge when nothing is saved", () => {
    mount();
    const btn = screen.getByRole("button", { name: "Saved items, none yet" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
    expect(btn).toHaveAttribute("aria-controls", "saved-drawer");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("saved-badge")).toBeNull();
  });

  it("shows the count in its name and on the badge, and 99+ above 99", async () => {
    mount();
    act(() => add(5));
    expect(screen.getByRole("button", { name: "Saved items, 5" })).toBeInTheDocument();
    expect(screen.getByTestId("saved-badge")).toHaveTextContent("5");
    act(() => add(120).forEach(() => {}));
    expect(screen.getByTestId("saved-badge")).toHaveTextContent("99+");
  });

  it("the badge bumps when the count goes up, and not when it goes down", () => {
    mount();
    act(() => add(1));
    expect(screen.getByTestId("saved-badge")).toHaveAttribute("data-bump", "true");
    act(() => add(3));
    act(() => { savedList().remove("i0|"); });
    expect(screen.getByTestId("saved-badge")).not.toHaveAttribute("data-bump");
  });

  it("opens the drawer by pushing { saved: true } so Back closes it", async () => {
    mount();
    await userEvent.click(screen.getByTestId("header-saved"));
    expect(screen.getByTestId("state")).toHaveTextContent('{"saved":true}');
    expect(screen.getByTestId("header-saved")).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByTestId("state")).toHaveTextContent("null");
  });

  it("from the menu it replaces the menu's entry, so Back does not bring the menu back; menu and saved are never both open", async () => {
    mount([{ pathname: "/" }, { pathname: "/", state: { menu: true } }]);
    await userEvent.click(screen.getByTestId("header-saved"));
    expect(screen.getByTestId("state")).toHaveTextContent('{"saved":true}');
    expect(screen.getByTestId("state")).not.toHaveTextContent("menu");
    await userEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByTestId("state")).toHaveTextContent("null");
  });

  it("announces what happened in one polite live region", () => {
    mount();
    act(() => announce("Saved. 5 items in your list."));
    expect(screen.getByRole("status")).toHaveTextContent("Saved. 5 items in your list.");
  });

  it("has no accessibility violations", async () => {
    const { container } = mount();
    act(() => add(3));
    expect((await axe(container)).violations).toEqual([]);
  });
});
