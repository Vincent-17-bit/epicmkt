import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Breadcrumbs from "./Breadcrumbs.jsx";
import ItemSheet from "../ItemSheet.jsx";

vi.mock("../../api/index.js", () => ({ logContactEvent: vi.fn() }));

const trail4 = [
  { key: "home", label: "Home", to: "/", icon: "house" },
  { key: "c", label: "Barbershops", to: "/c/barbershops" },
  { key: "t", label: "Maseno", to: "/c/barbershops?town=maseno" },
  { key: "b", label: "Fade Kings Barbershop" }
];

const trail5 = [
  { key: "home", label: "Home", to: "/", icon: "house" },
  { key: "c", label: "Barbershops", to: "/c/barbershops" },
  { key: "t", label: "Maseno", to: "/c/barbershops?town=maseno" },
  { key: "b", label: "Fade Kings Barbershop", to: "/b/fade-kings" },
  { key: "i", label: "Skin fade" }
];

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${pathname}${search}`}</p>;
}

const mount = (ui, entry = "/") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      {ui}
      <Where />
    </MemoryRouter>
  );

describe("Breadcrumbs", () => {
  it("renders correct hrefs for ancestors", () => {
    mount(<Breadcrumbs trail={trail4} compact={false} />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Barbershops" })).toHaveAttribute("href", "/c/barbershops");
    expect(screen.getByRole("link", { name: "Maseno" })).toHaveAttribute("href", "/c/barbershops?town=maseno");
  });

  it("renders the last crumb as text with aria-current", () => {
    mount(<Breadcrumbs trail={trail4} compact={false} />);
    const current = screen.getByText("Fade Kings Barbershop");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("navigates when a crumb is clicked", async () => {
    const user = userEvent.setup();
    mount(<Breadcrumbs trail={trail4} compact={false} />, "/b/fade-kings");
    await user.click(screen.getByRole("link", { name: "Maseno" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/c/barbershops?town=maseno");
  });

  it("reports clicks and hover intent", async () => {
    const user = userEvent.setup();
    const onCrumbClick = vi.fn();
    const onCrumbIntent = vi.fn();
    mount(<Breadcrumbs trail={trail4} compact={false} onCrumbClick={onCrumbClick} onCrumbIntent={onCrumbIntent} />);
    await user.hover(screen.getByRole("link", { name: "Barbershops" }));
    expect(onCrumbIntent).toHaveBeenCalledWith(expect.objectContaining({ to: "/c/barbershops" }));
    await user.click(screen.getByRole("link", { name: "Barbershops" }));
    expect(onCrumbClick).toHaveBeenCalledWith(expect.objectContaining({ to: "/c/barbershops" }), 1);
  });

  it("shows the full trail on phones when it has four crumbs or fewer", () => {
    mount(<Breadcrumbs trail={trail4} compact />);
    expect(screen.queryByRole("button", { name: /hidden/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Maseno" })).toBeInTheDocument();
  });

  it("collapses the middle on phones when there are more than four crumbs", () => {
    mount(<Breadcrumbs trail={trail5} compact />);
    expect(screen.getByRole("button", { name: /hidden/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Barbershops" })).toBeNull();
    expect(screen.getByRole("link", { name: "Fade Kings Barbershop" })).toHaveAttribute("href", "/b/fade-kings");
    expect(screen.getByText("Skin fade")).toHaveAttribute("aria-current", "page");
  });

  it("opens the popover, lists hidden crumbs as links, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    mount(<Breadcrumbs trail={trail5} compact />);
    const button = screen.getByRole("button", { name: /hidden/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "true");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/c/barbershops");
    expect(hrefs).toContain("/c/barbershops?town=maseno");

    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Maseno" })).toBeNull();
    expect(button).toHaveFocus();
  });

  it("navigates from the popover and closes it", async () => {
    const user = userEvent.setup();
    mount(<Breadcrumbs trail={trail5} compact />);
    await user.click(screen.getByRole("button", { name: /hidden/i }));
    await user.click(screen.getByRole("link", { name: "Maseno" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/c/barbershops?town=maseno");
    expect(screen.getByRole("button", { name: /hidden/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("puts the full text in the title attribute for long names", () => {
    const longName = "Extraordinarily Long Category Name Here";
    const trail = [trail4[0], { key: "c", label: longName, to: "/c/x" }, { key: "b", label: "Business" }];
    mount(<Breadcrumbs trail={trail} compact={false} />);
    expect(screen.getByRole("link", { name: longName })).toHaveAttribute("title", longName);
  });

  it("shows a placeholder while loading", () => {
    const { container } = mount(<Breadcrumbs loading trail={[]} />);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("renders the Back to results button when provided", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    mount(<Breadcrumbs trail={trail4} compact={false} back={{ label: "Back to results", onClick }} />);
    await user.click(screen.getByRole("button", { name: "Back to results" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("Item sheet trail", () => {
  const business = { id: "b_001", name: "Fade Kings Barbershop", phone: "0712345678", whatsapp: "0712345678" };
  const item = { id: "skin-fade", name: "Skin fade", priceKes: 300 };

  function Harness() {
    const { search } = useLocation();
    const open = new URLSearchParams(search).get("item") === "skin-fade";
    return (
      <>
        <Breadcrumbs trail={open ? trail5 : trail4.slice(0, 3).concat([{ key: "b", label: business.name }])} compact={false} />
        <ItemSheet business={business} item={open ? item : null} onClose={() => window.__closed?.()} />
      </>
    );
  }

  it("shows a compact trail with the business and the item", () => {
    mount(<ItemSheet business={business} item={item} onClose={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Item" });
    expect(within(nav).getByRole("button", { name: /Fade Kings Barbershop/ })).toBeInTheDocument();
    expect(within(nav).getByText("Skin fade")).toHaveAttribute("aria-current", "page");
  });

  it("closes the sheet when the Business button is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mount(<ItemSheet business={business} item={item} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /Fade Kings Barbershop/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("removes the item from the URL when the page Business crumb is clicked", async () => {
    const user = userEvent.setup();
    mount(
      <Routes>
        <Route path="/b/:slug" element={<Harness />} />
      </Routes>,
      "/b/fade-kings?item=skin-fade"
    );
    expect(screen.getByTestId("where")).toHaveTextContent("?item=skin-fade");
    const page = screen.getAllByRole("navigation", { name: "Breadcrumb" })[0];
    await user.click(within(page).getByRole("link", { name: "Fade Kings Barbershop" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/b\/fade-kings$/);
  });
});
