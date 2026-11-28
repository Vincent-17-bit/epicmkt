import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductTile } from "./index.js";

const item = {
  id: "i1",
  name: "Chapati and beans",
  imageUrl: "/p.jpg",
  availability: "available",
  pricing: {
    regularPrice: 150,
    salePrice: 150,
    savings: 0,
    discountPercent: 0,
  },
  flash: null,
  business: { name: "Mama Pima Kitchen" },
};

// A link that records navigation instead of leaving the page, like the client's router Link does.
const navigations = [];
const renderLink = ({ href, children, ...rest }) => (
  <a
    href={href}
    {...rest}
    onClick={(e) => {
      e.preventDefault();
      navigations.push(href);
      rest.onClick?.(e);
    }}
  >
    {children}
  </a>
);

const setup = (props = {}) => {
  navigations.length = 0;
  const onToggle = vi.fn();
  const onClick = vi.fn();
  const view = render(
    <ProductTile
      item={item}
      href="/b/mama/i/i1"
      renderLink={renderLink}
      onClick={onClick}
      action={{ saved: false, onToggle, label: "Save Chapati and beans" }}
      {...props}
    />,
  );
  return { onToggle, onClick, ...view };
};

describe("ProductTile with a Save heart", () => {
  it("tapping the heart saves and does not open the item or log a card click", () => {
    const { onToggle, onClick } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Save Chapati and beans" }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onClick).not.toHaveBeenCalled();
    expect(navigations).toEqual([]);
  });

  it("the heart is a sibling of the link, never inside it", () => {
    setup();
    const link = screen.getByRole("link");
    expect(link.contains(screen.getByRole("button"))).toBe(false);
    expect(link).toHaveTextContent("Chapati and beans");
    expect(link).toHaveAttribute("href", "/b/mama/i/i1");
  });

  it("the picture, name, price and shop are all inside the one link, and the heart is the only other control", () => {
    setup();
    const link = screen.getByRole("link");
    expect(link.querySelector("img, [class*=media]")).toBeTruthy();
    expect(link).toHaveTextContent("Chapati and beans");
    expect(link).toHaveTextContent(/KES/);
    expect(link).toHaveTextContent("Mama Pima Kitchen");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // the heart is drawn over the picture's corner, outside the link
    expect(screen.getByRole("button").className).toMatch(/save/);
  });

  it("clicking the price or the shop name opens the item; clicking the heart does not", () => {
    const { onClick } = setup();
    fireEvent.click(screen.getByText("Mama Pima Kitchen"));
    expect(navigations).toEqual(["/b/mama/i/i1"]);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button"));
    expect(navigations).toEqual(["/b/mama/i/i1"]);
  });

  it("opening the item still works through the name link and still logs the click", () => {
    const { onClick } = setup();
    fireEvent.click(screen.getByRole("link"));
    expect(navigations).toEqual(["/b/mama/i/i1"]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows the saved state to assistive tech", () => {
    setup({
      action: {
        saved: true,
        onToggle: () => {},
        label: "Remove Chapati and beans from Saved",
      },
    });
    expect(
      screen.getByRole("button", {
        name: "Remove Chapati and beans from Saved",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("is not shown in the seller preview, whatever is passed", () => {
    setup({ mode: "preview" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("without an action the card is one link, as before", () => {
    render(<ProductTile item={item} href="/x" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveClass(/tile/);
  });
});
